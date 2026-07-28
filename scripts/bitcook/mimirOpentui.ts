#!/usr/bin/env -S deno run --allow-all

import process from "node:process"
import { spawn } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type {
    BoxRenderable,
    InputRenderable,
    ScrollBoxRenderable,
    TextChunk,
    TextRenderable,
} from "@jitl/opentui-core"
import { ClaudeAPIClient } from "./utils/claudeAPI.ts"

// @jitl/opentui-core's tree-sitter syntax highlighter (used by
// MarkdownRenderable for fenced code blocks) spawns its worker via the
// runtime's native Worker with no options, which Deno rejects with
// "Classic workers are not supported." — Deno only allows `type: "module"`
// workers. opentui-core captures its own reference to `Worker` the moment
// it's imported, so this patch has to land — and the module has to load —
// before that happens; hence the dynamic import below instead of a static
// one.
const NativeWorker = globalThis.Worker

class ModuleWorker extends NativeWorker {
    constructor (specifier: string | URL, options?: WorkerOptions) {
        super(specifier, { ...options, type: "module" })
    }
}

globalThis.Worker = ModuleWorker as unknown as typeof Worker

const {
    Box,
    CliRenderEvents,
    Input,
    InputRenderableEvents,
    MarkdownRenderable,
    RGBA,
    ScrollBox,
    StyledText,
    SyntaxStyle,
    Text,
    bg,
    blink,
    bold,
    createCliRenderer,
    dim,
    fg,
    instantiate,
    italic,
    parseColor,
    reverse,
    strikethrough,
    underline,
} = await import("@jitl/opentui-core")

process.env.COLORTERM = "truecolor"
const VERSION = "0.2.0"

const logo = `
░▒▓▓▓▓▓▓▓▓▓▓▓▓▒░▒▓▒▒░░░░░░░░░░░░░░░
░▓████████████▓░▓██▒░░░░░░░░░░░░░░░
░▓█████████████▒░▒▓░░░░░░░░░░░░░░░░
░▓███▒      ███▒ ▒▓░███▒░     ░▒▒▒░
░▓██▒░ ▒▓▓▓▓░░░░▓▓█▒░░░▓▓▓▓▓▒ ░▒▒▒░
░▓██▒▒░▒▓▓▓▓    ▓██▓   ▓▓▓▓▓▒░░▒▒▒░
░▓████▒         ▓██▓        ░░░░░░░
░▓█████████████▒▓██▓░░░░░░░░░░░░░░░
░▓████████████▓░▓██▓░░░░░░░░░░░░░░░
░▓███████████▒▓▒▓██▓░▒░░░░░░░░░░░░░
░▓███████████ ▒▓▓██▓░▓░░░░░░░░░░░░░
░▓███████████  ▓███▓▒░ ░░░░░░░░░░░░
░▓█████████████▒   ░▒░░░░░░░░░░░░░░
░▓█████████████▓▓▒ ░░░░░░░░░░░░░░░░
░▓███████████▓▓▓▓▒ ░░░░░░░░░░░░░░░░
░▓█████████▓▓ ░░░░░░░░ ░░░░░░░░░░░░
░▓████████▓░ ░▓███████░░▒░░░░░░░░░░
░▓███████████▓░   ░▒   ░░░░░░░░░░░░
░░▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░
`

// deno-lint-ignore no-var
var GlobalErrorCount = 0
// deno-lint-ignore no-var
var AUTO_EXECUTE_COMMAND = false
const MAX_ERROR_COUNT = 4
// the one line-count budget for the whole scrollback: every "you:"/"mimir:"/
// "system:" message and every command-output block counts the same way,
// whether it's one finished entry among many or a single still-growing one.
// A single verbose, long-running command trims its own live buffer to this
// same cap (see the executeCommand callback below) so it can use the whole
// budget on its own without ever exceeding it, instead of a separate,
// smaller cap that made command output behave differently from everything
// else. The ring buffer below (trimHistoryToLimit) then evicts whole older
// entries once the combined total across all of them exceeds this cap.
const MAX_HISTORY_LINES = 1000

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

let processing = false
let stoppedByUser = false
let currentAbort: AbortController | null = null
let currentChild: ReturnType<typeof spawn> | null = null
let currentCommandLabel: string | null = null

// llm client
const mimir = new ClaudeAPIClient()

const isAbortError = (error: unknown): boolean =>
    error instanceof Error && error.name === "AbortError"

const COMMANDS = [
    { name: "/clear", description: "Clear the chat history" },
    { name: "/history", description: "Show past questions and answers" },
    { name: "/auto", description: "Enable/disable agent auto-execute mode" },
    { name: "/stop", description: "Cancel the current request" },
    { name: "/help", description: "Show this help message" },
    { name: "/exit", description: "Exit mimir" },
    { name: "/quit", description: "Exit mimir" },
    { name: "/version", description: "Show the Mimir version" },
]

const matchCommands = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed.startsWith("/")) {
        return []
    }
    return COMMANDS.filter((command) => command.name.startsWith(trimmed))
}

// ---------------------------------------------------------------------------
// renderer bootstrap
// ---------------------------------------------------------------------------

const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
})

// ---------------------------------------------------------------------------
// crash handling — an uncaught exception (e.g. opentui-core's native buffer
// allocation throwing "Failed to create optimized buffer: WxH" on a bad
// resize) otherwise takes the process down mid-render, leaving the terminal
// stuck in raw/alternate-screen mode with the real error scrolled off behind
// the corrupted screen. Restoring the terminal first and writing the full
// error to a fixed, known path is what makes a crash like that diagnosable
// at all instead of just "the app disappeared."
const crashLogPath = path.join(os.tmpdir(), "mimir-crash.log")

const handleFatalError = (label: string, error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    try {
        renderer.destroy()
    } catch {
        // best effort — the renderer may already be in a broken state
    }
    try {
        fs.writeFileSync(crashLogPath, `[${new Date().toISOString()}] ${label}\n${message}\n`)
    } catch {
        // best effort
    }
    console.error(`mimir crashed — full error written to ${crashLogPath}`)
    console.error(message)
    process.exit(1)
}

process.on("uncaughtException", (error) => handleFatalError("uncaughtException", error))
process.on("unhandledRejection", (reason) => handleFatalError("unhandledRejection", reason))

// instantiated directly (rather than left as VNodes) so we can hold onto
// concrete references without relying on getRenderable() doing a recursive
// lookup — each Renderable's id map only tracks its own direct children.
const instantiateAs = <T> (vnode: unknown): T => instantiate(renderer, vnode as never) as unknown as T

// shared style table for markdown rendering (headings, code, tables, ...);
// mimir's answers are markdown, everything else ("you:"/"system:" lines,
// raw command output) stays plain Text
const markdownSyntaxStyle = SyntaxStyle.create()

// markdownSyntaxStyle above has no styles registered, so its "default" group
// resolves to the terminal's default color — MarkdownRenderable's own `fg`
// option only feeds fenced code blocks and blockquote/hr borders, not plain
// paragraph text. To color the loading message's streamed body (the partial
// "thinking" text) the same green as its header, "default" needs its own
// registered style rather than relying on `fg`.
const thinkingSyntaxStyle = SyntaxStyle.fromStyles({ default: { fg: "#9ece6a" } })

// ---------------------------------------------------------------------------
// command palette — a small dropdown of matching "/" commands shown above
// (or below) an input as the user types; never takes focus itself, since
// arrow/tab/enter handling is done via the global keypress listener below
// ---------------------------------------------------------------------------

interface CommandRow {
    row: BoxRenderable
    text: TextRenderable
}

interface CommandPopup {
    box: BoxRenderable
    rows: CommandRow[]
    matches: typeof COMMANDS
    selectedIndex: number
    /** index of the first match currently rendered — lets the fixed-size row window scroll to follow selectedIndex when there are more matches than visible rows */
    scrollOffset: number
    /** repositions the (absolutely-positioned) box right above its input; called each time before it's shown */
    reposition: () => void
}

const MAX_VISIBLE_COMMANDS = 4
const COMMAND_NAME_COLUMN_WIDTH = 10

const COMMAND_NAME_COLOR = "#c0caf5"
const COMMAND_NAME_SELECTED_COLOR = "#7aa2f7"
const COMMAND_DESCRIPTION_COLOR = "#565f89"
const POPUP_BACKGROUND_COLOR = parseColor("#16161e")
const POPUP_SELECTED_BACKGROUND_COLOR = parseColor("#283457")

// custom row list instead of the built-in Select renderable — Select only ever
// puts the description on its own line below the name, with no way to render
// name + description side by side on one line in two colors
const createCommandPopup = (id: string, inputBox: BoxRenderable): CommandPopup => {
    const rows: CommandRow[] = Array.from({ length: MAX_VISIBLE_COMMANDS }, (_, index) => {
        const text = instantiateAs<TextRenderable>(
            Text({
                id: `${id}Row${index}Text`,
                content: "",
            }),
        )

        const row = instantiateAs<BoxRenderable>(
            Box(
                {
                    id: `${id}Row${index}`,
                    width: "100%",
                    height: 1,
                    flexShrink: 0,
                    paddingX: 1,
                    backgroundColor: POPUP_BACKGROUND_COLOR,
                    visible: false,
                },
                text,
            ),
        )

        return { row, text }
    })

    // absolutely positioned so it floats above the history/scene content
    // instead of pushing it around (which was causing layout/redraw glitches
    // in the surrounding boxes every time the popup toggled visible); no
    // bottom border since it butts up directly against the input's own top border
    const box = instantiateAs<BoxRenderable>(
        Box(
            {
                id,
                position: "absolute",
                flexDirection: "column",
                border: ["top", "left", "right"],
                borderColor: parseColor("#3b4261"),
                backgroundColor: POPUP_BACKGROUND_COLOR,
                zIndex: 10,
                visible: false,
            },
            ...rows.map((commandRow) => commandRow.row),
        ),
    )

    const popup: CommandPopup = {
        box,
        rows,
        matches: [],
        selectedIndex: 0,
        scrollOffset: 0,
        // no-op until reassigned below — reposition needs `popup` itself (to
        // read the current match count), which doesn't exist until this
        // object literal finishes constructing
        reposition: () => { },
    }

    popup.reposition = () => {
        // border-top (1 row) + one row per currently visible match, NOT the
        // fixed max — using the max here left a gap between the popup's
        // actual (shorter) rendered height and the reserved space above the
        // input whenever there were fewer than MAX_VISIBLE_COMMANDS matches,
        // which showed up as the popup appearing to run into/behind the input
        const visibleRowCount = Math.min(popup.matches.length, MAX_VISIBLE_COMMANDS)
        const currentHeight = 1 + visibleRowCount

        box.height = currentHeight
        box.top = inputBox.y - currentHeight
        box.left = inputBox.x
        box.width = inputBox.width
    }

    return popup
}

const renderCommandPopup = (popup: CommandPopup) => {
    popup.rows.forEach((commandRow, index) => {
        const matchIndex = popup.scrollOffset + index
        const command = popup.matches[matchIndex]
        if (!command) {
            commandRow.row.visible = false
            return
        }

        const isSelected = matchIndex === popup.selectedIndex
        commandRow.row.visible = true
        commandRow.row.backgroundColor = isSelected ? POPUP_SELECTED_BACKGROUND_COLOR : POPUP_BACKGROUND_COLOR
        commandRow.text.content = new StyledText([
            fg(isSelected ? COMMAND_NAME_SELECTED_COLOR : COMMAND_NAME_COLOR)(
                command.name.padEnd(COMMAND_NAME_COLUMN_WIDTH),
            ),
            fg(COMMAND_DESCRIPTION_COLOR)(command.description),
        ])
    })
}

let activeCommandPopup: CommandPopup | null = null

const updateCommandPopup = (popup: CommandPopup, value: string) => {
    const matches = matchCommands(value)

    if (matches.length === 0) {
        popup.box.visible = false
        if (activeCommandPopup === popup) {
            activeCommandPopup = null
        }
        return
    }

    popup.matches = matches
    popup.selectedIndex = 0
    popup.scrollOffset = 0
    renderCommandPopup(popup)
    popup.reposition()
    popup.box.visible = true
    activeCommandPopup = popup
}

const closeCommandPopup = (popup: CommandPopup) => {
    popup.box.visible = false
    if (activeCommandPopup === popup) {
        activeCommandPopup = null
    }
}

const moveCommandSelection = (popup: CommandPopup, delta: number) => {
    const count = popup.matches.length
    if (count === 0) {
        return
    }
    popup.selectedIndex = (popup.selectedIndex + delta + count) % count

    // slide the fixed-size row window just enough to keep selectedIndex
    // inside it — without this the selection can move past the last
    // rendered row and become invisible once there are more matches than
    // MAX_VISIBLE_COMMANDS
    if (popup.selectedIndex < popup.scrollOffset) {
        popup.scrollOffset = popup.selectedIndex
    } else if (popup.selectedIndex >= popup.scrollOffset + MAX_VISIBLE_COMMANDS) {
        popup.scrollOffset = popup.selectedIndex - MAX_VISIBLE_COMMANDS + 1
    }

    renderCommandPopup(popup)
}

const getSelectedCommand = (popup: CommandPopup) => popup.matches[popup.selectedIndex] ?? null

// ---------------------------------------------------------------------------
// scene 1: welcome — just the logo and a single "ask anything" input,
// centered on an otherwise empty screen
// ---------------------------------------------------------------------------

const welcomeInput = instantiateAs<InputRenderable>(
    Input({
        id: "welcomeInput",
        placeholder: "Ask anything",
        flexGrow: 1,
    }),
)

const welcomeInputBox = instantiateAs<BoxRenderable>(
    Box(
        {
            id: "welcomeInputBox",
            width: 60,
            height: 3,
            flexShrink: 0,
            flexDirection: "row",
            border: ["top", "bottom"],
            borderColor: parseColor("#3b4261"),
            focusedBorderColor: parseColor("#7aa2f7"),
        },
        Text({
            id: "welcomeInputPrompt",
            content: "> ",
            fg: parseColor("#7aa2f7"),
        }),
        welcomeInput,
    ),
)

const welcomeCommandsPopup = createCommandPopup("welcomeCommandsPopup", welcomeInputBox)

const welcomeScene = Box(
    {
        id: "welcomeScene",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: RGBA.defaultBackground(),
    },
    Text({
        id: "welcomeLogo",
        content: logo,
        fg: parseColor("#7aa2f7"),
    }),
    Text({
        id: "welcomeSubtitle",
        content: `Mimir CLI  v${VERSION}\n\n`,
        fg: parseColor("#565f89"),
    }),
    welcomeCommandsPopup.box,
    welcomeInputBox,
)

// ---------------------------------------------------------------------------
// scene 2: chat — thin status line, scrollable history, input pinned to the
// bottom, roughly following the opencode TUI layout
// ---------------------------------------------------------------------------

const statusText = instantiateAs<TextRenderable>(
    Text({
        id: "statusText",
        content: `mimir v${VERSION}  ·  ${process.cwd()}`,
        fg: parseColor("#565f89"),
    }),
)

// the last-run command, shown on its own row below the version/path row —
// wordwrapped and only added to statusLine while a label is set, so a big
// command grows this fixed header (and shrinks historyBox, which is the only
// flexGrow: 1 sibling) instead of getting truncated to one line
const statusCommandText = instantiateAs<TextRenderable>(
    Text({
        id: "statusCommandText",
        content: "",
        wrapMode: "word",
        fg: parseColor("#565f89"),
    }),
)

const statusLine = instantiateAs<BoxRenderable>(
    Box(
        {
            id: "statusLine",
            width: "100%",
            flexDirection: "column",
            flexShrink: 0,
        },
        statusText,
    ),
)

const historyBox = instantiateAs<ScrollBoxRenderable>(
    ScrollBox({
        id: "history",
        width: "100%",
        flexGrow: 1,
        stickyScroll: true,
        stickyStart: "bottom",
        rootOptions: {
            border: true,
            borderColor: parseColor("#3b4261"),
        },
    }),
)

const chatInput = instantiateAs<InputRenderable>(
    Input({
        id: "chatInput",
        placeholder: "Type your message here...",
        flexGrow: 1,
    }),
)

const chatInputBox = instantiateAs<BoxRenderable>(
    Box(
        {
            id: "chatInputBox",
            width: "100%",
            height: 3,
            flexShrink: 0,
            flexDirection: "row",
            paddingX: 1,
            border: ["top", "bottom"],
            borderColor: parseColor("#3b4261"),
            focusedBorderColor: parseColor("#7aa2f7"),
        },
        Text({
            id: "chatInputPrompt",
            content: "> ",
            fg: parseColor("#7aa2f7"),
        }),
        chatInput,
    ),
)

const chatCommandsPopup = createCommandPopup("chatCommandsPopup", chatInputBox)

const chatScene = Box(
    {
        id: "chatScene",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        flexDirection: "column",
        paddingX: 1,
        backgroundColor: RGBA.defaultBackground(),
        visible: false,
    },
    statusLine,
    historyBox,
    chatCommandsPopup.box,
    chatInputBox,
)

// ---------------------------------------------------------------------------
// root: both scenes overlap (absolute), only one is visible at a time
// ---------------------------------------------------------------------------

const root = Box({
    id: "root",
    width: "100%",
    height: "100%",
    backgroundColor: RGBA.defaultBackground(),
}, welcomeScene, chatScene)

const rootRenderable = instantiate(renderer, root)
renderer.root.add(rootRenderable)

const welcomeSceneBox = rootRenderable.getRenderable("welcomeScene") as BoxRenderable
const chatSceneBox = rootRenderable.getRenderable("chatScene") as BoxRenderable

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// opentui-core tracks mouse text-selection by fixed screen row/col
// coordinates (not by logical text position), so appending or replacing
// content anywhere above/within a selection reflows everything below it
// without moving the selection along — leaving a "ghost" highlight box
// pinned over whatever text now happens to sit at the old coordinates.
// A selection made against content that's about to reflow is stale by
// definition, so drop it before mutating history.
const dropStaleSelection = () => {
    if (renderer.hasSelection) {
        renderer.clearSelection()
    }
}

// historyBox's own "stickyScroll" follow can fall behind when content grows
// (or shrinks, via the ring buffer trimming below) faster than it re-checks
// whether the viewport is still sitting exactly at the bottom edge — most
// visible during a command's rapid-fire output, where the view drifts up
// instead of tracking the newest line. Forcing scrollTop to scrollHeight
// is a hard, explicit pin that doesn't depend on that internal edge-detection
// ever noticing in time.
//
// The pin itself has to happen on the renderer's "frame" event, not inline
// right after the content mutation: a long unwrapped line (e.g. a compiler
// invocation) only gets laid out into its actual wrapped row count during
// the renderer's own layout pass inside root.render(), which runs later in
// the same tick as this file's code, not synchronously when `.content = ...`
// is assigned. Reading historyBox.scrollHeight immediately after mutating
// content — as a plain inline call here used to do — reads a stale,
// pre-wrap height, so the pin lands short of the true bottom. Under a bursty
// producer (many stdout chunks per frame from a parallel build) each of
// those short pins never gets corrected before the next one, and the gap
// between the pinned position and the true bottom keeps growing. Marking a
// flag and consuming it on "frame" (which fires right after root.render()
// has already recalculated layout for this tick) guarantees scrollHeight is
// always read post-wrap, so the pin set here is what next frame's render
// actually reflects.
let historyScrollPinPending = false

const scrollHistoryToBottom = () => {
    historyScrollPinPending = true
}

renderer.on(CliRenderEvents.FRAME, () => {
    if (!historyScrollPinPending) {
        return
    }
    historyScrollPinPending = false
    historyBox.scrollTop = historyBox.scrollHeight
})

// ring buffer over the WHOLE scrollback — every "you:"/"mimir:"/"system:"
// message and every command-output line, no exceptions — tracked here by
// id + current line count. It's a plain capped stack: once the total crosses
// MAX_HISTORY_LINES, whole oldest entries are popped and their renderables
// removed, one at a time, until back under budget. No entry is ever
// shrunk/rewritten in place — each renderable is written once and only ever
// fully removed, never partially trimmed. That used to not be true for
// command output (a single ever-growing entry had its front cut off
// repeatedly to stay in budget); mutating one renderable's content over and
// over at a rapid, sub-frame cadence is what left opentui's own layout
// height for that node stuck too tall (see appendStreamingMessage below).
interface HistoryEntry {
    id: string
    lines: number
}

const historyLog: HistoryEntry[] = []
let historyLineTotal = 0

// deno-lint-ignore no-control-regex
const ANSI_CSI_PATTERN = /\x1b\[([0-9;]*)([A-Za-z])/g

// strips ANSI escape sequences entirely — used for the plain-text path
// (feeding a failed command's output back to the LLM as the next question),
// where color codes are just noise, not something to render, and for
// countLines below, where they'd otherwise inflate the estimated wrapped
// width of a line without occupying any actual screen columns
const stripAnsi = (text: string): string => text.replace(ANSI_CSI_PATTERN, "")

// estimates *rendered* rows, not just "\n"-delimited segments — command
// output routinely contains long unwrapped lines (a single compiler
// invocation, say) that render as many wrapped terminal rows. Counting only
// "\n"s credited such a line as "1" against MAX_HISTORY_LINES, so the ring
// buffer's budget silently fell behind the real on-screen row count during
// verbose /auto output: eviction didn't trigger until the undercounted total
// finally crossed the cap, then dropped a much bigger chunk of real rows
// than the cap implied in one step — visible as a gap opening up between
// the pinned scroll position and the actual last rendered line.
const countLines = (content: string): number => {
    const width = Math.max(1, process.stdout.columns || 80)
    return stripAnsi(content)
        .split("\n")
        .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / width)), 0)
}

const trimHistoryToLimit = () => {
    let evicted = false

    // `> 1`, not `> 0`: eviction must never remove the entry that was just
    // registered. A single burst of streamed output (e.g. a command dumping
    // a large JSON blob in one go) can push historyLineTotal past the cap
    // all by itself — evicting down to `length > 0` would then evict every
    // older entry and finally the brand-new one too, since removing it is
    // still the only way left to shrink historyLineTotal. That wiped the
    // screen back to empty the instant new content arrived (looked like a
    // blink with nothing left in the scrollback). Keeping the newest entry
    // means the ring buffer can briefly sit over budget for one oversized
    // entry, which is an acceptable trade for never losing the newest output.
    while (historyLineTotal > MAX_HISTORY_LINES && historyLog.length > 1) {
        const oldest = historyLog.shift()!
        historyBox.content.remove(oldest.id)
        historyLineTotal -= oldest.lines
        evicted = true
    }

    // opentui's incremental repaint only redraws what it thinks changed;
    // if it ever mis-tracks the region a removed entry used to occupy (a
    // stale "dirty rect"), old pixels can linger on screen even though the
    // logical scroll position is already correct. A full repaint after any
    // eviction sidesteps that class of bug by never relying on incremental
    // diffing across a structural change.
    if (evicted) {
        renderer.requestFullRepaintRender()
    }
}

// registers a brand new, permanent historyBox entry against the ring buffer
// — nothing about this entry is ever rewritten again; it's either on screen
// as-is or fully evicted by trimHistoryToLimit above
const registerHistoryEntry = (id: string, content: string) => {
    historyLog.push({ id, lines: countLines(content) })
    historyLineTotal += countLines(content)
    trimHistoryToLimit()
    scrollHistoryToBottom()
}

// re-measures an already-registered entry after its own content changed in
// place (e.g. appendStreamingMessage's updater, or the loading spinner)
const updateHistoryEntryLines = (id: string, content: string) => {
    const existing = historyLog.find((entry) => entry.id === id)
    if (!existing) {
        return
    }
    const lines = countLines(content)
    historyLineTotal += lines - existing.lines
    existing.lines = lines
    trimHistoryToLimit()
    scrollHistoryToBottom()
}

const untrackHistoryLines = (id: string) => {
    const index = historyLog.findIndex((entry) => entry.id === id)
    if (index === -1) {
        return
    }
    historyLineTotal -= historyLog[index].lines
    historyLog.splice(index, 1)
}

const resetHistoryLines = () => {
    historyLog.length = 0
    historyLineTotal = 0
}

// trailing blank line after every message so consecutive messages don't
// visually run into each other in the history scrollback
const appendSpacer = () => {
    const spacer = instantiate(renderer, Text({ content: "" })) as TextRenderable
    historyBox.content.add(spacer)
    registerHistoryEntry(spacer.id, "")
}

const appendMessage = (author: string, content: string, color?: string) => {
    dropStaleSelection()

    const messageContent = `${author}: ${content}`
    const line = instantiate(
        renderer,
        Text({
            content: messageContent,
            fg: color ? parseColor(color) : undefined,
        }),
    ) as TextRenderable

    historyBox.content.add(line)
    registerHistoryEntry(line.id, messageContent)
    appendSpacer()
}

// like appendMessage, but renders content as markdown (headings, code blocks,
// tables, ...) below a plain-text "author:" header line — used for mimir's
// answers, which are markdown, unlike the plain "you:"/"system:" lines
const appendMarkdownMessage = (author: string, content: string, color?: string) => {
    dropStaleSelection()

    const headerContent = `${author}:`
    const header = instantiate(
        renderer,
        Text({
            content: headerContent,
            fg: color ? parseColor(color) : undefined,
        }),
    ) as TextRenderable

    const markdownContent = ClaudeAPIClient.AnsiToMarkdown(content)
    const body = new MarkdownRenderable(renderer, {
        content: markdownContent,
        syntaxStyle: markdownSyntaxStyle,
    })

    historyBox.content.add(header)
    historyBox.content.add(body)
    registerHistoryEntry(header.id, headerContent)
    // the markdown source is only an approximation of the rendered line
    // count (headings/lists/wrapping can change it), close enough for a
    // buffer meant to bound memory/render cost, not to be pixel-exact
    registerHistoryEntry(body.id, markdownContent)
    appendSpacer()
}

// command output, streamed in as chunks arrive. Every completed line becomes
// its own brand new, permanent renderable — written once, never rewritten —
// exactly like every other entry in the ring buffer. The ONLY renderable
// this function ever mutates in place is the single still-arriving line at
// the tail, and only by growing it; the moment a "\n" completes it, it's
// sealed into a fresh renderable and a new (empty) tail line takes over.
// No renderable here is ever grown and later shrunk in place — that
// grow-then-shrink-in-place pattern (the old design: one entry for the
// whole command, its front repeatedly cut to stay in budget) is what left
// opentui's own cached layout height for that node stuck too tall, since it
// was also being mutated far faster than one frame per update.
const appendStreamingMessage = (author: string, color?: string) => {
    dropStaleSelection()

    const authorFg = color ? parseColor(color) : undefined
    let isFirstLine = true
    let pendingChunks = ""

    let tailLine: TextRenderable | null = null
    let tailContent = ""

    // a completed line is ANSI-parsed on its own, starting from a fresh SGR
    // state each time (ansiToStyledText resets state per call) — a color set
    // on one line that's never explicitly reset before the next "\n" won't
    // carry over. Real build/CLI output almost always reissues color codes
    // per line, so this is an acceptable trade for never rewriting a sealed
    // line's renderable again.
    const styledLineChunks = (text: string, withAuthor: boolean): TextChunk[] => {
        const chunks: TextChunk[] = withAuthor
            ? [{ __isChunk: true, text: `${author}: `, fg: authorFg }]
            : []
        chunks.push(...ansiToStyledText(text))
        return chunks
    }

    const styledLine = (text: string, withAuthor: boolean) => new StyledText(styledLineChunks(text, withAuthor))

    const removeTailLine = () => {
        if (!tailLine) {
            return
        }
        historyBox.content.remove(tailLine.id)
        untrackHistoryLines(tailLine.id)
        tailLine = null
    }

    // a command that's already produced thousands of lines before this
    // process ever gets to read its pipe (e.g. a fast startup phase that
    // dumps a large JSON blob) can hand flush() a single chunk containing
    // hundreds of completed lines at once. Sealing all of them into ONE
    // renderable regardless of size is what MAX_SEALED_LINES_PER_ENTRY below
    // guards against — a single Text node holding hundreds of wrapped rows
    // is the same shape of "long content" that elsewhere in this file is
    // documented as landing opentui's native buffer allocator on bad
    // dimensions, except here it's one huge node instead of one mutated too
    // fast. Capping how many lines go into any one sealed renderable keeps
    // every node's size bounded no matter how bursty the producer is.
    const MAX_SEALED_LINES_PER_ENTRY = 200

    // seals every line completed within a single flush() into as few new
    // renderables as MAX_SEALED_LINES_PER_ENTRY allows, instead of one
    // renderable per line. A bursty producer (many stdout lines arriving in
    // a single chunk, e.g. a build) used to turn one flush() — itself
    // running once per frame — into dozens of separate
    // historyBox.content.add()/remove() calls against the scrollback's
    // ScrollBox in a single tick. That's far more backing-buffer resize
    // churn on the ScrollBox than the old design (one renderable, mutated in
    // place) ever produced, and is what was landing opentui's native buffer
    // allocator on bad/racing dimensions ("Failed to create optimized
    // buffer: WxH") during verbose command output. Batching keeps the
    // "written once, never mutated" invariant (so the old
    // cached-height-stuck-too-tall bug doesn't come back) while collapsing N
    // content.add() calls per frame down to as few as the size cap allows.
    const sealLines = (lines: string[]) => {
        removeTailLine()

        for (let start = 0; start < lines.length; start += MAX_SEALED_LINES_PER_ENTRY) {
            const batch = lines.slice(start, start + MAX_SEALED_LINES_PER_ENTRY)
            const chunks: TextChunk[] = []
            batch.forEach((text, index) => {
                if (index > 0) {
                    chunks.push({ __isChunk: true, text: "\n" })
                }
                const withAuthor = isFirstLine
                isFirstLine = false
                chunks.push(...styledLineChunks(text, withAuthor))
            })
            const sealed = instantiate(renderer, Text({ content: new StyledText(chunks) })) as TextRenderable
            historyBox.content.add(sealed)
            registerHistoryEntry(sealed.id, batch.join("\n"))
        }
    }

    const flush = () => {
        if (!pendingChunks) {
            return
        }
        const chunk = pendingChunks
        pendingChunks = ""

        const segments = chunk.split("\n")
        const completedLines: string[] = []
        for (let i = 0; i < segments.length - 1; i++) {
            tailContent += segments[i]
            completedLines.push(tailContent)
            tailContent = ""
        }
        if (completedLines.length > 0) {
            sealLines(completedLines)
        }
        tailContent += segments[segments.length - 1]

        if (!tailContent) {
            return
        }
        if (!tailLine) {
            tailLine = instantiate(renderer, Text({ content: "" })) as TextRenderable
            historyBox.content.add(tailLine)
            registerHistoryEntry(tailLine.id, "")
        }
        tailLine.content = styledLine(tailContent, isFirstLine)
        updateHistoryEntryLines(tailLine.id, tailContent)
    }

    renderer.on(CliRenderEvents.FRAME, flush)

    return {
        update: (chunk: string) => {
            dropStaleSelection()
            pendingChunks += chunk
        },
        // stops coalescing and applies whatever arrived since the last frame
        // — call once the command that's feeding this entry is done, so the
        // frame listener doesn't outlive it for the rest of the session
        dispose: () => {
            flush()
            renderer.off(CliRenderEvents.FRAME, flush)
            appendSpacer()
        },
    }
}

// deno-lint-ignore no-var
var loadingMessageCounter = 0

// mimir's "thinking" turn is its own standalone message, separate from the
// final answer: a header line ("mimir: <spinner>") plus a body line below it
// that fills in with the streamed partial text while waiting. Once the real
// answer is ready, this whole message is torn down via remove() and the
// answer is appended as a brand new message (see appendMessage in loop()),
// rather than the loading message morphing in place into the answer.
// Both the header (label + spinner) and the streamed body share the same color.
const createLoadingMessage = (author: string, color?: string) => {
    dropStaleSelection()

    const id = `mimirLoading${loadingMessageCounter++}`

    let headerContent = `${author}: `
    const header = instantiate(
        renderer,
        Text({
            id: `${id}Header`,
            content: headerContent,
            fg: color ? parseColor(color) : undefined,
        }),
    ) as TextRenderable

    // markdown, streaming: true — the trailing block stays unstable while
    // chunks keep arriving; this message is torn down via remove() once the
    // final answer is ready, so there's no need to ever flip streaming off
    let bodyContent = ""
    const body = new MarkdownRenderable(renderer, {
        id: `${id}Body`,
        content: bodyContent,
        syntaxStyle: thinkingSyntaxStyle,
        streaming: true,
        fg: color ? parseColor(color) : undefined,
    })

    historyBox.content.add(header)
    historyBox.content.add(body)
    registerHistoryEntry(header.id, headerContent)
    registerHistoryEntry(body.id, bodyContent)

    return {
        setSpinner: (frame: string) => {
            dropStaleSelection()
            headerContent = frame ? `${author}: ${frame}` : `${author}: `
            header.content = headerContent
            updateHistoryEntryLines(header.id, headerContent)
        },
        setBody: (text: string) => {
            dropStaleSelection()
            bodyContent = text
            body.content = bodyContent
            updateHistoryEntryLines(body.id, bodyContent)
        },
        remove: () => {
            dropStaleSelection()
            historyBox.content.remove(header.id)
            historyBox.content.remove(body.id)
            untrackHistoryLines(header.id)
            untrackHistoryLines(body.id)
        },
    }
}

// braille dot-cycle spinner, driven by setInterval since opentui-core has no
// built-in spinner renderable (unlike melker's <spinner variant="dots" />).
// Returns a stop function; safe to call more than once.
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

const startSpinner = (update: (text: string) => void): () => void => {
    let frame = 0
    update(SPINNER_FRAMES[0])

    const interval = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length
        update(SPINNER_FRAMES[frame])
    }, 80)

    let stopped = false
    return () => {
        if (stopped) {
            return
        }
        stopped = true
        clearInterval(interval)
    }
}

const setProcessing = (value: boolean) => {
    processing = value
    chatInput.placeholder = value
        ? "Mimir is thinking... (/stop to cancel)"
        : "Type your message here..."
}

let statusCommandTextAdded = false

const updateStatusLine = () => {
    if (currentCommandLabel == null) {
        if (statusCommandTextAdded) {
            statusLine.remove(statusCommandText.id)
            statusCommandTextAdded = false
        }
        return
    }

    statusCommandText.content = `command: ${currentCommandLabel.replace(/\s+/g, " ").trim()}`
    if (!statusCommandTextAdded) {
        statusLine.add(statusCommandText)
        statusCommandTextAdded = true
    }
}

const showChatScene = () => {
    welcomeSceneBox.visible = false
    chatSceneBox.visible = true
    chatInput.focus()
}

// ---------------------------------------------------------------------------
// command handling
// ---------------------------------------------------------------------------

const handleCommand = (input: string): boolean => {
    const trimmed = input.trim()

    if (trimmed === "/auto") {
        AUTO_EXECUTE_COMMAND = !AUTO_EXECUTE_COMMAND
        appendMessage(
            "system",
            `Auto-execute mode is now ${AUTO_EXECUTE_COMMAND ? "enabled" : "disabled"}.`,
            "#e0af68"
        )
        return true
    }

    if (trimmed === "/stop") {
        stoppedByUser = true
        currentAbort?.abort()

        if (currentChild?.pid) {
            try {
                // negative PID targets the whole process group (see the
                // `detached: true` comment in executeCommand) so the actual
                // pipeline command, not just the bash wrapper, gets killed
                process.kill(-currentChild.pid, "SIGTERM")
            } catch {
                // already exited between the processing check and here
            }
        }

        setProcessing(false)
        appendMessage("system", "stopped.", "#e0af68")
        return true
    }

    if (trimmed === "/clear") {
        for (const child of [...historyBox.content.getChildren()]) {
            historyBox.content.remove(child.id)
        }
        resetHistoryLines()
        return true
    }

    if (trimmed === "/history") {
        const turns = mimir.getHistory()

        if (turns.length === 0) {
            appendMessage("system", "No questions asked yet.", "#e0af68")
            return true
        }

        for (const turn of turns) {
            appendMessage("system", `[${turn.timestamp}]`, "#565f89")
            appendMessage("you", turn.question, "#c0caf5")
            appendMarkdownMessage("mimir", turn.answer.explanation, "#9ece6a")

            if (turn.answer.command != null) {
                appendMessage("system", `Command: ${turn.answer.command}`, "#fa625a")
            }
        }

        return true
    }

    if (trimmed === "/exit" || trimmed === "/quit") {
        renderer.destroy()
        process.exit(0)
    }

    if (trimmed === "/version") {
        appendMessage(
            "system",
            `
${logo}

Mimir version: ${VERSION}
            `,
            "#2ca0ff"
        )
        showChatScene()
        return true
    }

    if (trimmed === "/help") {
        appendMessage(
            "system",
            `
Available commands:
    /clear   - Clear the chat history
    /history - Show past questions and answers
    /stop    - Cancel the current request
    /help    - Show this help message
    /exit    - Exit mimir
    /quit    - Exit mimir
            `,
            "#e0af68"
        )

        // help already set the chatscene if not yet
        showChatScene()
        return true
    }

    return false
}

// ---------------------------------------------------------------------------
// context sent to mimir alongside every question: cwd, candidate repo
// folders, and AGENTS.md content, if present
// ---------------------------------------------------------------------------

const buildAdditionalContext = (): string => {
    const pwd = process.cwd()
    const dirs = Deno.readDirSync(pwd)
    const agentsMdPath = `${pwd}/gaia/AGENTS.md`
    let agentsMdContent = ""

    if (fs.existsSync(agentsMdPath)) {
        agentsMdContent = fs.readFileSync(agentsMdPath, "utf-8")
    }

    return (
        `Project workdir, or PWD, is the following, ${pwd}\n\n` +
        `The project workdir has the following folders that are possible repos:\n` +
        `${dirs.toArray().map((dir) => `${pwd}/${dir.name}`).join("\n")}\n\n` +
        `Gaia build system generates folders for the distro build like ./build-<distro name>, these folders are not repos, but build output folders, avoid them.\n\n` +
        `If the repo has an AGENTS.md file give it precedence over README.md for developer documentation.\n\n` +
        `${agentsMdContent}\n\n`
    )
}

const ANSI_16_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"]
const ANSI_BRIGHT_16_NAMES = [
    "brightBlack", "brightRed", "brightGreen", "brightYellow",
    "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
]

// xterm 256-color palette (SGR "38;5;n"/"48;5;n"): 0-15 are the named 16
// colors above, 16-231 are a 6x6x6 color cube, 232-255 are a grayscale ramp
const xterm256ToColor = (index: number): string => {
    if (index < 8) return ANSI_16_NAMES[index]
    if (index < 16) return ANSI_BRIGHT_16_NAMES[index - 8]

    if (index < 232) {
        const cubeIndex = index - 16
        const level = (v: number) => (v === 0 ? 0 : 55 + v * 40)
        const r = level(Math.floor(cubeIndex / 36))
        const g = level(Math.floor((cubeIndex % 36) / 6))
        const b = level(cubeIndex % 6)
        return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
    }

    const gray = 8 + (index - 232) * 10
    return `#${gray.toString(16).padStart(2, "0").repeat(3)}`
}

interface AnsiState {
    fg?: string
    bg?: string
    bold: boolean
    dim: boolean
    italic: boolean
    underline: boolean
    strikethrough: boolean
    inverse: boolean
    blink: boolean
}

const freshAnsiState = (): AnsiState => ({
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
    blink: false,
})

// mutates `state` in place per the SGR (Select Graphic Rendition) params of
// a single "\x1b[...m" sequence — everything else about terminal ANSI
// (cursor movement, screen/line clears, ...) is meaningless here since
// opentui has no real cursor, it's an ever-growing scrollback buffer, so
// non-"m" CSI sequences are just dropped by the caller
const applySgr = (state: AnsiState, params: string): void => {
    const codes = params.split(";").filter((code) => code !== "").map(Number)
    if (codes.length === 0) {
        codes.push(0)
    }

    for (let i = 0; i < codes.length; i++) {
        const code = codes[i]

        if (code === 0) {
            state.fg = undefined
            state.bg = undefined
            Object.assign(state, freshAnsiState())
        } else if (code === 1) {
            state.bold = true
        } else if (code === 2) {
            state.dim = true
        } else if (code === 3) {
            state.italic = true
        } else if (code === 4) {
            state.underline = true
        } else if (code === 5 || code === 6) {
            state.blink = true
        } else if (code === 7) {
            state.inverse = true
        } else if (code === 9) {
            state.strikethrough = true
        } else if (code === 22) {
            state.bold = false
            state.dim = false
        } else if (code === 23) {
            state.italic = false
        } else if (code === 24) {
            state.underline = false
        } else if (code === 25) {
            state.blink = false
        } else if (code === 27) {
            state.inverse = false
        } else if (code === 29) {
            state.strikethrough = false
        } else if (code >= 30 && code <= 37) {
            state.fg = ANSI_16_NAMES[code - 30]
        } else if (code >= 90 && code <= 97) {
            state.fg = ANSI_BRIGHT_16_NAMES[code - 90]
        } else if (code === 39) {
            state.fg = undefined
        } else if (code >= 40 && code <= 47) {
            state.bg = ANSI_16_NAMES[code - 40]
        } else if (code >= 100 && code <= 107) {
            state.bg = ANSI_BRIGHT_16_NAMES[code - 100]
        } else if (code === 49) {
            state.bg = undefined
        } else if (code === 38 || code === 48) {
            const isBg = code === 48
            const mode = codes[i + 1]

            if (mode === 5) {
                const color = xterm256ToColor(codes[i + 2])
                if (isBg) { state.bg = color } else { state.fg = color }
                i += 2
            } else if (mode === 2) {
                const [r, g, b] = [codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0]
                const color = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
                if (isBg) { state.bg = color } else { state.fg = color }
                i += 4
            }
        }
    }
}

// applies the currently active ANSI style to one plain-text segment,
// composing opentui-core's own chunk-style helpers rather than poking at
// TextChunk.attributes directly — that bitmask encoding is a private
// implementation detail, these helpers are the stable public surface for it
const styleSegment = (text: string, state: AnsiState): TextChunk => {
    // always start from a real TextChunk object (never a bare string) — when
    // no style flag is active (e.g. right after a "\x1b[0m" reset) none of
    // the branches below fire, and a bare string forced through `as
    // TextChunk` has no `.text` property at runtime, so the native renderer
    // silently drops it — which, for command output, is exactly the segment
    // carrying the newline and timestamp between log lines
    let chunk: TextChunk = { __isChunk: true, text }
    if (state.bold) chunk = bold(chunk)
    if (state.dim) chunk = dim(chunk)
    if (state.italic) chunk = italic(chunk)
    if (state.underline) chunk = underline(chunk)
    if (state.strikethrough) chunk = strikethrough(chunk)
    if (state.inverse) chunk = reverse(chunk)
    if (state.blink) chunk = blink(chunk)
    if (state.fg) chunk = fg(state.fg)(chunk)
    if (state.bg) chunk = bg(state.bg)(chunk)
    return chunk
}

// parses raw ANSI (as produced by the executed command itself) into opentui
// TextChunks carrying that same styling — the command's own colors are what
// shows up, not a flat color opentui would otherwise impose on the whole line
const ansiToStyledText = (text: string): TextChunk[] => {
    const chunks: TextChunk[] = []
    const state = freshAnsiState()
    let lastIndex = 0
    let match: RegExpExecArray | null

    ANSI_CSI_PATTERN.lastIndex = 0
    while ((match = ANSI_CSI_PATTERN.exec(text)) !== null) {
        const segment = text.slice(lastIndex, match.index)
        if (segment) {
            chunks.push(styleSegment(segment, state))
        }

        const [, params, final] = match
        if (final === "m") {
            applySgr(state, params)
        }

        lastIndex = ANSI_CSI_PATTERN.lastIndex
    }

    const rest = text.slice(lastIndex)
    if (rest) {
        chunks.push(styleSegment(rest, state))
    }

    return chunks
}

// execute the commands, streaming each output chunk to onOutput as it arrives
const executeCommand = (command: string, onOutput: (chunk: string) => void, logFilePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const child = spawn(
            "/bin/bash",
            ["-c", `set -o pipefail; { ${command}; } 2>&1 | tee ${logFilePath}`],
            {
                env: {
                    ...process.env,
                    COLUMNS: `${process.stdout.columns || 80}`,
                    LINES: "1000"
                },
                // `command` runs as a shell pipeline (`{ cmd; } | tee`), so the
                // actual work happens in bash's *children*, not in bash itself.
                // `detached: true` makes this child the leader of a new process
                // group so the whole pipeline can be signaled at once via the
                // negative PID (see /stop handling above).
                detached: true
            }
        )

        currentChild = child
        let output = ""

        child.stdout.on("data", (data) => {
            const chunk = data.toString()
            output += chunk
            onOutput(chunk)
        })

        child.on("error", reject)

        child.on("close", (code, signal) => {
            currentChild = null

            if (code === 0) {
                resolve(output)
            } else if (signal) {
                const stoppedError = new Error(output || `command stopped by signal ${signal}`)
                stoppedError.name = "AbortError"
                reject(stoppedError)
            } else {
                reject(new Error(output || `command exited with code ${code}`))
            }
        })
    })
}

// ---------------------------------------------------------------------------
// main ask/answer loop
// ---------------------------------------------------------------------------

const loop = async (question: string) => {
    setProcessing(true)
    stoppedByUser = false
    currentAbort = new AbortController()
    appendMessage("you", question, "#c0caf5")

    const loadingMessage = createLoadingMessage("mimir", "#9ece6a")
    const stopSpinner = startSpinner((frame) => loadingMessage.setSpinner(frame))

    try {
        mimir.setAdditionalContext(buildAdditionalContext())

        const resp = await mimir.ask(question, (text) => {
            // partial thinking output, streamed in below the header as it
            // arrives; the spinner keeps animating on the header line for
            // the whole thinking phase, not just until the first chunk
            loadingMessage.setBody(text)
        }, currentAbort.signal)

        stopSpinner()
        loadingMessage.remove()

        if (resp.explanation) {
            appendMarkdownMessage("mimir", resp.explanation, "#9ece6a")

            if (resp.command != null) {
                appendMessage("system", `Command: ${resp.command}`, "#fa625a")

                if (!AUTO_EXECUTE_COMMAND) {
                    appendMessage(
                        "system",
                        "(auto-execution disabled, run it manually or use /auto)",
                        "#e0af68"
                    )
                } else {
                    const outputTmpFile = `/tmp/mimir_output_${Date.now()}.log`
                    // appendStreamingMessage accumulates chunks itself and is
                    // tracked against the shared history ring buffer, so this
                    // entry's size is bounded the same way as everything else
                    // in the scrollback, not by a separate cap here
                    const cmdOutput = appendStreamingMessage("output", "#565f89")

                    currentCommandLabel = resp.command
                    updateStatusLine()

                    try {
                        await executeCommand(resp.command, (chunk) => {
                            cmdOutput.update(chunk)
                        }, outputTmpFile)

                        GlobalErrorCount = 0
                    } catch (error) {
                        if (stoppedByUser || isAbortError(error)) {
                            // user asked for it, not an actual failure: don't
                            // feed it back into the auto-retry-on-error loop
                            return
                        }

                        // let's continue the loop, feeding the failure back in
                        // as the next question, up to MAX_ERROR_COUNT times
                        GlobalErrorCount++

                        if (GlobalErrorCount < MAX_ERROR_COUNT) {
                            let outputTmpFileContent = ""

                            try {
                                const fullOutput = stripAnsi(Deno.readTextFileSync(outputTmpFile))
                                const lines = fullOutput.split("\n")

                                outputTmpFileContent = lines.length > 500
                                    ? lines.slice(-500).join("\n")
                                    : fullOutput
                            } catch {
                                outputTmpFileContent = (error as Error).message
                            }

                            await loop(
                                `The command "${resp.command}" failed to execute, logs: ${outputTmpFileContent}\n`
                            )
                        }
                    } finally {
                        cmdOutput.dispose()
                    }
                }
            }
        }
    } catch (error) {
        stopSpinner()
        loadingMessage.remove()

        if (!isAbortError(error)) {
            appendMessage("system", `Error: ${(error as Error).message}`, "#fa625a")
        }
    } finally {
        stopSpinner()
        setProcessing(false)
        currentAbort = null
        currentChild = null
    }
}

// ---------------------------------------------------------------------------
// wire input
// ---------------------------------------------------------------------------

// command popup: filter as the user types, navigate/accept via the global
// keypress listener below (the popup never takes focus itself)
welcomeInput.on(InputRenderableEvents.INPUT, (value: string) => {
    updateCommandPopup(welcomeCommandsPopup, value)
})

chatInput.on(InputRenderableEvents.INPUT, (value: string) => {
    updateCommandPopup(chatCommandsPopup, value)
})

// global keypress listener runs before the focused Input's own key handling
// (see InternalKeyHandler.emitWithPriority) — that's what lets it intercept
// up/down/tab/enter/escape while a command popup is open, via stopPropagation.
renderer.keyInput.on("keypress", (key) => {
    const popup = activeCommandPopup
    if (!popup) {
        return
    }

    const input = popup === chatCommandsPopup ? chatInput : welcomeInput

    if (key.name === "up") {
        moveCommandSelection(popup, -1)
        key.stopPropagation()
        return
    }

    if (key.name === "down") {
        moveCommandSelection(popup, 1)
        key.stopPropagation()
        return
    }

    if (key.name === "escape") {
        closeCommandPopup(popup)
        key.stopPropagation()
        return
    }

    if (key.name === "tab") {
        const selected = getSelectedCommand(popup)
        if (selected) {
            input.value = `${selected.name} `
        }
        closeCommandPopup(popup)
        key.stopPropagation()
        return
    }

    if (key.name === "return") {
        const selected = getSelectedCommand(popup)
        closeCommandPopup(popup)
        key.stopPropagation()
        if (selected) {
            input.value = ""
            input.emit(InputRenderableEvents.ENTER, selected.name)
        }
        return
    }
})

// NOTE: InputRenderable's `submit()` override never calls the `onSubmit`
// prop/listener — it only emits InputRenderableEvents.ENTER ("enter"), so
// that's what has to be listened to here.
welcomeInput.on(InputRenderableEvents.ENTER, async (value: string) => {
    if (value.trim() === "") {
        return
    }

    welcomeInput.value = ""

    if (handleCommand(value)) {
        return
    }

    showChatScene()
    await loop(value)
})

chatInput.on(InputRenderableEvents.ENTER, async (value: string) => {
    if (value.trim() === "") {
        return
    }

    chatInput.value = ""

    if (handleCommand(value)) {
        return
    }

    if (processing) {
        return
    }

    await loop(value)
})

welcomeInput.focus()
renderer.start()
