#!/usr/bin/env -S deno run --allow-all

import process from "node:process"
import { spawn } from "node:child_process"
import * as fs from "node:fs"
import {
    createInterface,
    Interface
} from "node:readline"
import { ClaudeAPIClient } from "./utils/claudeAPI.ts"

// we need this global
// deno-lint-ignore no-var
var GlobalErrorCount = 0
// deno-lint-ignore no-var
var AUTO_EXECUTE_COMMAND = false
const MAX_ERROR_COUNT = 4

// state
let processing = false
let stoppedByUser = false
let currentAbort: AbortController | null = null
let currentChild: ReturnType<typeof spawn> | null = null
let lastCommand: string | null = null

// the isAbortError helper is used to tell "user pressed /stop" apart from a
// real API error so we don't feed a stop back to mimir as a failure
const isAbortError = (error: unknown): boolean =>
    error instanceof Error && error.name === "AbortError"

const VERSION = "0.2.1"

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
░▓████████▓░ ░▓███████░▒░░░░░░░░░░░
░▓███████████▓░   ░▒   ░░░░░░░░░░░░
░░▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░
`

// llm client
const mimir = new ClaudeAPIClient()

const COMMANDS = [
    { name: "/clear", description: "Clear the chat history" },
    { name: "/history", description: "Show past questions and answers" },
    { name: "/again", description: "Run the last proposed command again" },
    { name: "/auto", description: "Enable/disable agent auto-execute mode" },
    { name: "/stop", description: "Cancel the current request" },
    { name: "/help", description: "Show this help message" },
    { name: "/exit", description: "Exit mimir" },
    { name: "/quit", description: "Exit mimir" },
    { name: "/version", description: "Show the Mimir version" },
]

const COLOR_RESET = "\x1b[0m"
const COLOR_BLUE = "\x1b[34m"
const COLOR_ORANGE = "\x1b[38;5;208m"
const COLOR_GREEN = "\x1b[32m"
const COLOR_RED = "\x1b[31m"
const COLOR_GRAY = "\x1b[90m"
const COLOR_YELLOW = "\x1b[33m"

// ---------------------------------------------------------------------------
// printing helpers
// ---------------------------------------------------------------------------

function printBanner (): void {
    console.log(COLOR_BLUE + logo + COLOR_RESET)
    console.log("Mimir knows everything about Gaia, Bitcook, DeimOS and PhobOS.")
    console.log(`Mimir CLI  v${VERSION}`)
    console.log("")
}

function printHelp (): void {
    console.log("Available commands:")
    console.log("  /clear   - Clear the chat history")
    console.log("  /history - Show past questions and answers")
    console.log("  /again   - Run the last proposed command again")
    console.log("  /auto    - Enable/disable agent auto-execute mode")
    console.log("  /stop    - Cancel the current request")
    console.log("  /help    - Show this help message")
    console.log("  /exit    - Exit mimir")
    console.log("  /quit    - Exit mimir")
    console.log("")
}

function printVersion (): void {
    console.log(COLOR_BLUE + logo + COLOR_RESET)
    console.log("")
    console.log(`Mimir version: ${VERSION}`)
    console.log("")
}

function printHistory (): void {
    const turns = mimir.getHistory()

    if (turns.length === 0) {
        console.log("No questions asked yet.")
        console.log("")
        return
    }

    console.log("History:")
    for (const turn of turns) {
        console.log(`  ${COLOR_GRAY}[${turn.timestamp}]${COLOR_RESET}`)
        console.log(`     ${COLOR_BLUE}User:${COLOR_RESET} ${turn.question}`)
        console.log(`     ${COLOR_ORANGE}Mimir:${COLOR_RESET} ${turn.answer.explanation}`)
        if (turn.answer.command != null) {
            console.log(`     ${COLOR_RED}Command:${COLOR_RESET} ${turn.answer.command}`)
        }
    }
    console.log("")
}

// ---------------------------------------------------------------------------
// context sent to mimir alongside every question: cwd, candidate repo
// folders, and AGENTS.md content, if present
// ---------------------------------------------------------------------------

function buildAdditionalContext (): string {
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

// ---------------------------------------------------------------------------
// thinking animation — same as before, a one-line "Mimir is thinking..."
// with a spinner and the streamed partial text
// ---------------------------------------------------------------------------

function terminalWidth (): number {
    const columns = process.stdout.columns
    return columns && columns > 10 ? columns : 80
}

function truncateToWidth (text: string, width: number): string {
    if (text.length <= width) {
        return text
    }

    return `${text.slice(0, Math.max(0, width - 1))}…`
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

function startThinkingAnimation (): { stop: () => void; setStatus: (text: string) => void } {
    let frame = 0
    let status = ""

    function render (): void {
        const spinner = ` ${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} `
        const line = truncateToWidth(`${COLOR_GREEN}Mimir${COLOR_RESET}${spinner}${status}`, terminalWidth())
        process.stdout.write(`\r\x1b[2K${line}`)
    }

    process.stdout.write("\x1b[?25l")
    render()
    const timer = setInterval(() => {
        frame++
        render()
    }, 80)

    return {
        stop: () => {
            clearInterval(timer)
            process.stdout.write("\r\x1b[2K")
            process.stdout.write("\x1b[?25h")
        },
        setStatus: (text: string) => {
            // collapse any newlines/tabs so the status always renders on a
            // single line alongside the "Mimir is thinking" label
            status = text.replace(/[\r\n\t]+/g, " ").trim()
            render()
        }
    }
}

// ---------------------------------------------------------------------------
// command execution — spawned so /stop can kill the whole pipeline via its
// process group; output streams to stdout as it arrives (stdio inherit)
// ---------------------------------------------------------------------------

const stripAnsi = (text: string): string =>
    // deno-lint-ignore no-control-regex
    text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")

const executeCommand = (command: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const child = spawn(
            "/bin/bash",
            ["-c", command],
            {
                env: {
                    ...process.env,
                    COLUMNS: `${process.stdout.columns || 80}`,
                    LINES: "1000"
                },
                // `command` may run as a shell pipeline, so the actual work
                // happens in bash's children. detached: true makes this child
                // the leader of a new process group so the whole pipeline can
                // be signaled at once via the negative PID (see /stop).
                stdio: "inherit",
                detached: true
            }
        )

        currentChild = child
        let output = ""

        child.stdout?.on("data", (data) => {
            output += data.toString()
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
// the ask/answer loop
// ---------------------------------------------------------------------------

// set when the /ask response flagged a kernel build error (errorKind ===
// "kernel"): the next loop() iteration must go to the specialized
// /analyze/kernel/build/logs endpoint instead of /ask, and no follow-up
// command may be proposed or executed for kernel build failures
// deno-lint-ignore no-var
var pendingKernelBuildAnalysis = false

// the last /ask response's errorKind, set by loop() so runCommand can
// decide whether to flag the next iteration as a kernel build analysis
// deno-lint-ignore no-var
var lastResponseErrorKind: string | null = null

async function runCommand (command: string): Promise<void> {
    const outputTmpFile = `/tmp/mimir_output_${Date.now()}.log`

    console.log(`${COLOR_GREEN}Executing command:${COLOR_RESET} ${command}`)
    console.log("")

    try {
        await executeCommand(`set -o pipefail; { ${command}; } 2>&1 | tee ${outputTmpFile}`)

        GlobalErrorCount = 0
        console.log("")
    } catch (error) {
        if (stoppedByUser || isAbortError(error)) {
            return
        }

        // let's continue the loop, feeding the failure back in
        // as the next question, up to MAX_ERROR_COUNT times
        GlobalErrorCount++

        if (GlobalErrorCount < MAX_ERROR_COUNT) {
            let outputTmpFileContent = ""
            let _nextQuestion = ""
            let _nextContext = ""

            try {
                const fullOutput = stripAnsi(Deno.readTextFileSync(outputTmpFile))
                const lines = fullOutput.split("\n")

                outputTmpFileContent = lines.length > 400
                    ? lines.slice(-400).join("\n")
                    : fullOutput

                // the question + logs + context could not exceed the 80k chars
                _nextQuestion = `The command "${command}" failed to execute, logs: ${outputTmpFileContent}\n`
                _nextContext = mimir.getContext()

                if (_nextQuestion.length + _nextContext.length > 80000) {
                    mimir.compactHistory()
                    _nextQuestion = `The command "${command}" failed to execute, logs: ${outputTmpFileContent}\n`
                    _nextContext = mimir.getContext()

                    if (_nextQuestion.length + _nextContext.length > 80000) {
                        // still too long so we will need to truncate logs
                        const maxLogLength = 80000 - _nextContext.length - 1000
                        const truncatedLogs = outputTmpFileContent.slice(-maxLogLength)
                        _nextQuestion = `The command "${command}" failed to execute, logs: ${truncatedLogs}\n`
                    }
                }
            } catch {
                outputTmpFileContent = (error as Error).message
            }

            if (lastResponseErrorKind === "kernel") {
                pendingKernelBuildAnalysis = true
            }

            await loop(_nextQuestion)
        } else {
            // clean to be able to iterate under errors again
            GlobalErrorCount = 0
            console.log(`${COLOR_RED}Stopped after ${MAX_ERROR_COUNT} consecutive command failures.${COLOR_RESET}`)
            console.log("")
        }
    }
}

async function loop (question: string): Promise<void> {
    // the /ask response for the previous turn flagged this as a kernel
    // build error (errorKind === "kernel"): this turn goes to the
    // specialized /analyze/kernel/build/logs endpoint instead of /ask, and
    // its answer is analysis only — no command is proposed or executed
    const isKernelAnalysis = pendingKernelBuildAnalysis
    pendingKernelBuildAnalysis = false

    processing = true
    stoppedByUser = false
    currentAbort = new AbortController()

    const animation = startThinkingAnimation()

    try {
        mimir.setAdditionalContext(buildAdditionalContext())

        const resp = await mimir.ask(question, (text) => {
            animation.setStatus(text)
        }, currentAbort.signal, isKernelAnalysis ? "/analyze/kernel/build/logs" : "/ask")

        lastResponseErrorKind = resp.errorKind

        animation.stop()

        console.log("")
        console.log("")
        console.log(`${COLOR_ORANGE}Mimir:${COLOR_RESET}`)
        console.log(resp.explanation)

        if (resp.command != null && !isKernelAnalysis) {
            console.log(`${COLOR_RED}Command:${COLOR_RESET} ${resp.command}`)
            lastCommand = resp.command

            if (!AUTO_EXECUTE_COMMAND) {
                console.log(`${COLOR_YELLOW}(auto-execution disabled, run it manually or use /auto)${COLOR_RESET}`)
                console.log("")
            } else {
                await runCommand(resp.command)
                return
            }
        }

        console.log("")

        // /ask flagged this as a kernel build error but no command was
        // executed (either no command was proposed, or auto-execute is
        // disabled): follow up with the specialized analysis endpoint
        if (lastResponseErrorKind === "kernel" && !isKernelAnalysis) {
            pendingKernelBuildAnalysis = true
            await loop(question)
        }
    } catch (error) {
        animation.stop()

        if (!isAbortError(error)) {
            console.log("")
            console.log(`${COLOR_RED}Error: ${(error as Error).message}${COLOR_RESET}`)
            console.log("")
        }
    } finally {
        processing = false
        currentAbort = null
        currentChild = null
    }
}

// ---------------------------------------------------------------------------
// command handling
// ---------------------------------------------------------------------------

async function handleCommand (input: string): Promise<boolean> {
    const trimmed = input.trim()

    if (trimmed === "/again") {
        if (!AUTO_EXECUTE_COMMAND) {
            console.log(`${COLOR_YELLOW}Auto-execute mode is disabled, enable it with /auto first.${COLOR_RESET}`)
            console.log("")
            return true
        }

        if (lastCommand == null) {
            console.log(`${COLOR_YELLOW}No previous command to run again.${COLOR_RESET}`)
            console.log("")
            return true
        }

        if (processing) {
            console.log(`${COLOR_YELLOW}Already running something, /stop first.${COLOR_RESET}`)
            console.log("")
            return true
        }

        processing = true
        stoppedByUser = false

        try {
            await runCommand(lastCommand)
        } finally {
            processing = false
        }

        return true
    }

    if (trimmed === "/auto") {
        AUTO_EXECUTE_COMMAND = !AUTO_EXECUTE_COMMAND
        console.log(`${COLOR_YELLOW}Auto-execute mode is now ${AUTO_EXECUTE_COMMAND ? "enabled" : "disabled"}.${COLOR_RESET}`)
        console.log("")
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

        processing = false
        console.log(`${COLOR_YELLOW}stopped.${COLOR_RESET}`)
        console.log("")
        return true
    }

    if (trimmed === "/clear") {
        mimir.clearHistory()
        console.log("History cleared.")
        console.log("")
        return true
    }

    if (trimmed === "/history") {
        printHistory()
        return true
    }

    if (trimmed === "/version") {
        printVersion()
        return true
    }

    if (trimmed === "/help") {
        printHelp()
        return true
    }

    if (trimmed === "/exit" || trimmed === "/quit") {
        console.log("Goodbye.")
        process.exit(0)
        return true
    }

    return false
}

// ---------------------------------------------------------------------------
// readline interface
// ---------------------------------------------------------------------------

function createChatInterface (): Interface {
    return createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (line: string): [string[], string] => {
            const trimmed = line.trimStart()

            if (!trimmed.startsWith("/")) {
                return [[], line]
            }

            const hits = COMMANDS.filter((cmd) => cmd.name.startsWith(trimmed)).map((cmd) => cmd.name)
            const matches = hits.length > 0 ? hits : COMMANDS.map((cmd) => cmd.name)
            return [matches, trimmed]
        }
    })
}

function askQuestion (rl: Interface, promptText: string): Promise<string | null> {
    return new Promise((resolve) => {
        let settled = false

        const onLine = (line: string): void => {
            if (settled) {
                return
            }

            settled = true
            rl.removeListener("SIGINT", onSigint)
            resolve(line)
        }

        const onSigint = (): void => {
            if (settled) {
                return
            }

            settled = true
            rl.removeListener("line", onLine)
                ; (rl as unknown as { line: string; cursor: number }).line = ""
                ; (rl as unknown as { line: string; cursor: number }).cursor = 0
            console.log()
            resolve(null)
        }

        rl.once("line", onLine)
        rl.once("SIGINT", onSigint)
        rl.setPrompt(promptText)
        rl.prompt()
    })
}

async function run (): Promise<void> {
    const rl = createChatInterface()

    printBanner()

    try {
        while (true) {
            const raw = await askQuestion(rl, `${COLOR_BLUE}User>${COLOR_RESET} `)

            if (raw === null) {
                return
            }

            const question = raw.trim()

            if (question.length === 0) {
                continue
            }

            if (await handleCommand(question)) {
                continue
            }

            if (processing) {
                console.log(`${COLOR_YELLOW}Mimir is still working, /stop to cancel.${COLOR_RESET}`)
                console.log("")
                continue
            }

            await loop(question)
        }
    } finally {
        rl.close()
    }
}

if (import.meta.main) {
    run().catch((error) => {
        console.error("Fatal error while running Mimir:", error)
        process.exit(1)
    })
}
