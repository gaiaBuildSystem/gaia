import process from "node:process"
import { spawn } from "node:child_process"
import {
    melker,
    createElement,
    MelkerEngine
} from "@melker/melker/lib"
import { installRawAnsiComponent } from "./melkerAnsi.ts"
import { installTerminalComponent, type TerminalElement } from "./melkerTerminal.ts"
import { ClaudeAPIClient } from "./claudeAPI.ts"


installRawAnsiComponent()
installTerminalComponent()

// deno-lint-ignore no-var
var _outIx = 0
// deno-lint-ignore no-var
var GlobalErrorCount = 0
const MAX_ERROR_COUNT = 4

// deno-lint-ignore no-var
var AUTO_EXECUTE_COMMAND = false
// deno-lint-ignore no-var
var MAIN_CONTAINER_WIDTH = 0

// deno-lint-ignore no-var
var IS_PROCESSING = false
// deno-lint-ignore no-var
var STOPPED_BY_USER = false
// deno-lint-ignore no-var
var CURRENT_ABORT: AbortController | null = null
// deno-lint-ignore no-var
var CURRENT_CHILD: ReturnType<typeof spawn> | null = null

const COMMANDS = [
    "/enableAutoExecuteCommand",
    "/help",
    "/history",
    "/clear",
    "/exit"
]

// while Mimir is thinking or a command is executing, /stop is the only
// command the user is allowed to issue: everything else (including new
// questions) must be blocked until the current turn finishes or is stopped
function activeCommands (): string[] {
    return IS_PROCESSING ? ["/stop"] : COMMANDS
}

export function isProcessing (): boolean {
    return IS_PROCESSING
}

function isAbortError (error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError"
}

// aborts the in-flight LLM request and/or kills the running shell command
export function stopProcessing (ctx: MelkerEngine): void {
    if (!IS_PROCESSING) {
        return
    }

    STOPPED_BY_USER = true
    CURRENT_ABORT?.abort()

    if (CURRENT_CHILD?.pid) {
        try {
            // Negative PID signals the whole process group (see the
            // `detached: true` comment in executeCommand) so the actual
            // pipeline command, not just the bash wrapper, gets killed.
            process.kill(-CURRENT_CHILD.pid, "SIGTERM")
        } catch {
            // already exited between the IS_PROCESSING check and here
        }
    }

    pushInfo(ctx, "Stopped by user.", "#fa625a")
}

// llm client
const mimir = new ClaudeAPIClient()
const _pwd = process.cwd()
const _dirs = Deno.readDirSync(_pwd)
mimir.setAdditionalContext(
    `Project workdir, or PWD, is the following,` +
    `USE THIS PATH AS BASE FOR THE COMMANDS SUGGESTIONS EVERYTHING WITH A PATH, AVOID cd WHENEVER POSSIBLE:\n` +
    `${_pwd}\n\n` +
    `The project workdir has the following folders that are possible repos:\n` +
    `${_dirs.toArray().map(dir => `${_pwd}/${dir.name}`).join("\n")}\n\n`
)


// Command output streams chunks fast enough (many renders per second for a
// verbose/long-running command) that unconditionally auto-scrolling on every
// chunk fights an in-progress mouse drag-selection: the container keeps
// jumping back to the bottom mid-drag, so the selection's end coordinate
// never gets a chance to track anywhere but the row the drag started on.
// Skipping the scroll while a selection is active/present fixes that,
// matching how real terminals pause scroll-follow during a selection.
function scrollLogsToBottom (ctx: MelkerEngine): void {
    if (ctx.getTextSelection().isActive) {
        return
    }
    ctx.scrollToBottom("logsContainer")
}

// prints a single informational line into the logs container, used by the
// internal commands below to give feedback without involving the LLM
function pushInfo (ctx: MelkerEngine, text: string, color = "#26dc20") {
    const logsContainer = ctx.document.getElementById("logsContainer")
    const _info = melker`
                <container style="flex-direction: row;">
                    <text style="color: ${color};" text="${text}\n" />
                </container>
            `
    logsContainer!.children?.push(_info)
    scrollLogsToBottom(ctx)
}

// commands starting with `value` (only meaningful once `value` starts with "/")
export function getCommandSuggestions (value: string): string[] {
    const trimmed = value.trim()

    if (!trimmed.startsWith("/")) {
        return []
    }

    return activeCommands().filter((cmd) => cmd.startsWith(trimmed))
}

// updates the hint line under the input as the user types, showing either
// the single completion Enter would accept or the list of candidates
export function updateCommandHint (ctx: MelkerEngine, value: string): void {
    const hint = ctx.document.getElementById("commandHint")

    if (!hint) {
        return
    }

    const trimmed = value.trim()
    const matches = getCommandSuggestions(trimmed)

    if (matches.length === 0 || (matches.length === 1 && matches[0] === trimmed)) {
        hint.props.text = ""
    } else if (matches.length === 1) {
        hint.props.text = `→ ${matches[0]}  (Enter to complete)`
    } else {
        hint.props.text = matches.join("   ")
    }
}

// handles the internal, LLM-less commands listed in the welcome banner.
// returns true when `question` was one of them (or was completed into one),
// so the caller knows not to forward it to Mimir
export async function handleCommand (question: string, ctx: MelkerEngine): Promise<boolean> {
    const messageInput = ctx.document.getElementById("messageInput")
    const trimmed = question.trim()
    const _active = activeCommands()

    // /context is an undocumented debug command: intentionally left out of
    // COMMANDS/autocomplete/`/help`, and handled here so it works even while
    // IS_PROCESSING restricts everything else to /stop
    if (trimmed === "/context") {
        messageInput!.props.value = ""
        updateCommandHint(ctx, "")
        pushInfo(ctx, "Context:")
        pushInfo(ctx, mimir.getContext())
        return true
    }

    if (!_active.includes(trimmed)) {
        // not a full command yet: if it is an unambiguous prefix of exactly
        // one command, Enter completes the input instead of submitting it
        const matches = getCommandSuggestions(trimmed)

        if (matches.length === 1 && matches[0] !== trimmed) {
            messageInput!.props.value = matches[0]
            updateCommandHint(ctx, matches[0])
            return true
        }

        // while processing, /stop is the only command accepted: swallow
        // anything else instead of forwarding it as a new question to Mimir
        if (IS_PROCESSING) {
            return true
        }

        return false
    }

    messageInput!.props.value = ""
    updateCommandHint(ctx, "")

    if (trimmed === "/stop") {
        stopProcessing(ctx)
        return true
    }

    if (trimmed === "/exit") {
        await ctx.stop()
        process.exit(0)
    }

    if (trimmed === "/help") {
        pushInfo(ctx, "Available commands:")
        pushInfo(ctx, "  /enableAutoExecuteCommand  Enable auto-execution of commands")
        pushInfo(ctx, "  /help                      Show this help")
        pushInfo(ctx, "  /history                   Show previous ask/answer turns")
        pushInfo(ctx, "  /clear                     Clear in-memory history, clean the context")
        pushInfo(ctx, "  /stop                      Stop Mimir's current thinking/command execution")
        pushInfo(ctx, "  /exit                      Quit Mimir")
    } else if (trimmed === "/clear") {
        mimir.clearHistory()
        const logsContainer = ctx.document.getElementById("logsContainer")
        logsContainer!.children = []
        pushInfo(ctx, "History cleared.")
    } else if (trimmed === "/history") {
        const history = mimir.getHistory()

        if (history.length === 0) {
            pushInfo(ctx, "No history yet.")
        } else {
            for (let i = 0; i < history.length; i++) {
                const turn = history[i]
                pushInfo(ctx, `${i + 1}. [${turn.timestamp}]`, "#fa625a")
                pushInfo(ctx, `User: ${turn.question}`, "#755afa")
                pushInfo(ctx, `Mimir: ${turn.answer.explanation}`, "#fab75a")
            }
        }
    } else if (trimmed === "/enableAutoExecuteCommand") {
        AUTO_EXECUTE_COMMAND = true
        pushInfo(ctx, "Auto-execution of commands is now enabled.")
    }

    return true
}

// execute the commands, streaming each output chunk to onOutput as it arrives
function executeCommand (command: string, onOutput: (chunk: string) => void, logFilePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            "/bin/bash",
            ["-c", `set -o pipefail; { ${command}; } 2>&1 | tee ${logFilePath}`],
            {
                env: {
                    ...process.env,
                    COLUMNS: `${MAIN_CONTAINER_WIDTH}`,
                    LINES: "1000"
                },
                // `command` runs as a shell pipeline (`{ cmd; } | tee`), so the
                // actual work happens in bash's *children*, not in bash itself.
                // Without its own process group, signaling just this PID (see
                // stopProcessing) only ever reaches bash — the real command and
                // `tee` are left running orphaned. `detached: true` makes this
                // child the leader of a new group so the whole pipeline can be
                // signaled at once via the negative PID.
                detached: true
            }
        )

        CURRENT_CHILD = child
        let _output = ""

        child.stdout.on("data", (data) => {
            const _chunk = data.toString()
            _output += _chunk
            onOutput(_chunk)
        })

        child.on("error", reject)

        child.on("close", (code, signal) => {
            CURRENT_CHILD = null

            if (code === 0) {
                resolve(_output)
            } else if (signal) {
                const _stoppedError = new Error(_output || `command stopped by signal ${signal}`)
                _stoppedError.name = "AbortError"
                reject(_stoppedError)
            } else {
                reject(new Error(_output || `command exited with code ${code}`))
            }
        })
    })
}

export async function loop (question: string, ctx: MelkerEngine) {
    const messageInput = ctx.document.getElementById("messageInput")
    const logsContainer = ctx.document.getElementById("logsContainer")

    updateCommandHint(ctx, "")

    // update the MAIN_CONTAINER_WIDTH
    MAIN_CONTAINER_WIDTH = logsContainer?.getBounds()?.width || 0

    // block new questions/commands (other than /stop) until this turn ends
    IS_PROCESSING = true
    STOPPED_BY_USER = false
    CURRENT_ABORT = new AbortController()

    // the user input template
    const _userI = melker`
                <container style="flex-direction: row;">
                    <text style="font-weight: bold; color: #755afa" text="User: " />
                    <text style="text-wrap: wrap;" text="${question}\n" />
                </container>
            `
    logsContainer!.children?.push(_userI)
    scrollLogsToBottom(ctx)
    messageInput!.props.value = ""

    // now mimir will think
    const _uidOut = _outIx++
    const _mimirO1 = melker`
                <container>
                    <container id="mimirRespWrap-${_uidOut}">
                        <container style="flex-direction: row;">
                            <text style="font-weight: bold; color: #fab75a;" text="Mimir: " />
                            <spinner id="mimirSpinner-${_uidOut}" style="color: #f58d16;" variant="dots" />
                        </container>
                        <container id="mimirRespContainer-${_uidOut}"></container>
                    </container>

                    <container id="mimirCmdWrap-${_uidOut}">
                        <container id="mimirCmdContainer-${_uidOut}"></container>
                        <container id="mimirCmdLogs-${_uidOut}"></container>
                    </container>
                </container>
            `
    logsContainer!.children?.push(_mimirO1)
    scrollLogsToBottom(ctx)

    // set it to the template
    const _mimirRespContainer = ctx.document.getElementById(`mimirRespContainer-${_uidOut}`)
    const _mimirCmdContainer = ctx.document.getElementById(`mimirCmdContainer-${_uidOut}`)
    const _mimirSpinner = ctx.document.getElementById(`mimirSpinner-${_uidOut}`)
    const _mimirCmdLogs = ctx.document.getElementById(`mimirCmdLogs-${_uidOut}`)

    if (
        !_mimirCmdContainer ||
        !_mimirSpinner ||
        !_mimirCmdLogs ||
        !_mimirRespContainer
    ) {
        throw new Error(`
                    Mimir output elements not found:
                    _mimirCmdContainer: ${_mimirCmdContainer}
                    _mimirSpinner: ${_mimirSpinner}
                    _mimirCmdLogs: ${_mimirCmdLogs}
                    _mimirRespContainer: ${_mimirRespContainer}
                `)
    }

    const mimirRawResp = createElement(
        'raw-ansi', {
        text: '',
        style: {
            width: 'fill'
        }
    })
    _mimirRespContainer.children?.push(mimirRawResp)

    const mimirRawCmd = createElement(
        'raw-ansi', {
        text: '',
        style: {
            width: 'fill'
        }
    })
    _mimirCmdContainer.children?.push(mimirRawCmd)

    // Half of logsContainer's current height, snapshotted once at creation
    // (like MAIN_CONTAINER_WIDTH above) — NOT derived from the terminal's own
    // IntrinsicSizeContext.availableSpace at render time, which is what broke
    // logsContainer's auto-scroll-to-bottom before (see melkerTerminal.ts).
    const _logsContainerHeight = logsContainer?.getBounds()?.height || 0
    const _cmdOutputMaxVisibleRows = _logsContainerHeight > 0
        ? Math.max(1, Math.floor(_logsContainerHeight / 2))
        : undefined

    const cmdOutputRaw = createElement(
        'terminal', {
        text: '',
        maxVisibleRows: _cmdOutputMaxVisibleRows,
        style: {
            width: 'fill'
        }
    }) as TerminalElement
    _mimirCmdLogs.children?.push(cmdOutputRaw)

    try {
        //then call the llm
        const _resp = await mimir.ask(question, (text) => {
            // parcial thinking output, shown in green while still streaming
            mimirRawResp.props.text = `\x1b[32m${text}\x1b[0m\n`
            scrollLogsToBottom(ctx)
        }, CURRENT_ABORT.signal)

        // mimir stops to think
        _mimirSpinner.props.variant = "none"

        if (_resp.explanation) {
            mimirRawResp.props.text = `${_resp.explanation}\n`

            if (_resp.command != null) {
                // bold + #fa625a label baked into the ANSI stream itself, so the
                // label and command stay on one line — raw-ansi wraps badly when
                // used as a flex-row sibling next to another element instead of
                // being the sole child of its container.
                mimirRawCmd.props.text = `\x1b[1;38;2;250;98;90mCommand: \x1b[0m${_resp.command}\n`
            }

            scrollLogsToBottom(ctx)

            if (_resp.command != null && !AUTO_EXECUTE_COMMAND) {
                pushInfo(
                    ctx,
                    "(auto-execution disabled, run it manually or use /enableAutoExecuteCommand)",
                    "#fa625a"
                )
            }

            if (_resp.command != null && AUTO_EXECUTE_COMMAND) {
                const _outputTmpFile = `/tmp/mimir_output_${Date.now()}.log`
                let _rawOutput = ""

                try {
                    // add the
                    // execute the command, appending each output chunk into the UI
                    await executeCommand(_resp.command, (chunk) => {
                        _rawOutput += chunk
                        cmdOutputRaw.props.text = _rawOutput
                        // scrollLogsToBottom(ctx)
                    }, _outputTmpFile)

                    GlobalErrorCount = 0
                } catch (error) {
                    if (STOPPED_BY_USER || isAbortError(error)) {
                        // user asked for it, not an actual failure: don't
                        // feed it back into the auto-retry-on-error loop
                        return
                    }

                    // let's continue the loop in the agent inputting the
                    // next question as the error
                    // we need to also have some way to stop if we have so
                    // many levels of errors
                    GlobalErrorCount++

                    if (GlobalErrorCount < MAX_ERROR_COUNT) {
                        let _outputTmpFileContent = ""

                        try {
                            _outputTmpFileContent = Deno.readTextFileSync(_outputTmpFile)
                        } catch {
                            const e = error as Error
                            _outputTmpFileContent = e.message
                        }

                        // wow, AI knows how to do recursion?
                        await loop(
                            `The command "${_resp.command}" failed to execute, logs: ${_outputTmpFileContent}\n`,
                            ctx
                        )
                    }
                } finally {
                    // Terminal.write() flushes asynchronously, so the last output
                    // chunk may not have parsed into cmdOutputRaw's buffer yet by
                    // the time the command closes and no further chunk arrives to
                    // trigger another render — flush and repaint once more here.
                    // This is best-effort only: IS_PROCESSING isn't reset until
                    // this whole function returns, so a flush that never settles
                    // must never be allowed to hang the conversation loop.
                    await Promise.race([
                        cmdOutputRaw.whenIdle().catch(() => { }),
                        new Promise((resolve) => setTimeout(resolve, 250)),
                    ])
                    scrollLogsToBottom(ctx)
                }
            }
        }
    } catch (error) {
        _mimirSpinner.props.variant = "none"

        if (!isAbortError(error)) {
            throw error
        }
    } finally {
        IS_PROCESSING = false
        CURRENT_ABORT = null
        CURRENT_CHILD = null
    }
}
