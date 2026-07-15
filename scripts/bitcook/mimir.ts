#!/usr/bin/env -S deno run --allow-all

import process from "node:process"
import { execSync } from "node:child_process"
import {
    createInterface,
    Interface
} from "node:readline"
import { ClaudeAPIClient } from "./utils/claudeAPI.ts"

const _pwd = process.cwd()
const _dirs = Deno.readDirSync(_pwd)

// we need this global
// deno-lint-ignore no-var
var GlobalContext =
    `Project workdir, or PWD, is the following,` +
    `USE THIS PATH AS BASE FOR THE COMMANDS SUGGESTIONS EVERYTHING WITH A PATH, AVOID cd WHENEVER POSSIBLE:\n` +
    `${_pwd}\n\n` +
    `The project workdir has the following folders that are possible repos:\n` +
    `${_dirs.toArray().map(dir => `${_pwd}/${dir.name}`).join("\n")}`

type ChatTurn = {
    question: string
    answer: string
    timestamp: string
}

const VERSION = "0.1.0"

const COLOR_RESET = "\x1b[0m"
const COLOR_BLUE = "\x1b[34m"
const COLOR_ORANGE = "\x1b[38;5;208m"
const COLOR_GREEN = "\x1b[32m"
const COLOR_RED = "\x1b[31m"

let AUTO_EXECUTE_COMMAND = false

const history: ChatTurn[] = []

const COMMANDS = [
    "/enableAutoExecuteCommand",
    "/help",
    "/history",
    "/clear",
    "/exit"
]

function printBanner (): void {
    console.log("Mimir knows everything about Gaia, Bitcook, DeimOS and PhobOS.")
    console.log(`Version ${VERSION}`)
    console.log("")
}

function printHelp (): void {
    console.log("Available commands:")
    console.log("  /enableAutoExecuteCommand  Enable auto-execution of commands")
    console.log("  /help                      Show this help")
    console.log("  /history                   Show previous ask/answer turns")
    console.log("  /clear                     Clear in-memory history, clean the context")
    console.log("")
}

function printHistory (): void {
    if (history.length === 0) {
        console.log("No history yet.")
        console.log("")
        return
    }

    console.log("History:")
    for (let i = 0; i < history.length; i++) {
        const turn = history[i]
        console.log(`  ${i + 1}. ${COLOR_RED}[${turn.timestamp}]${COLOR_RESET}`)
        console.log(`     ${COLOR_BLUE}User:${COLOR_RESET} ${turn.question}`)
        console.log(`     ${COLOR_ORANGE}Mimir:${COLOR_RESET} ${turn.answer}`)
    }
    console.log("")
}

function printSeparator (): void {
    console.log(COLOR_RESET + " ".repeat(terminalWidth()))
}

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

function startThinkingAnimation (): { stop: () => void; setStatus: (text: string) => void } {
    const frames = [".", "..", "..."]
    let i = 0
    let status = "Mimir is thinking"

    function render (): void {
        const suffix = ` ${frames[i % frames.length]}`
        const line = truncateToWidth(status, terminalWidth() - suffix.length) + suffix
        process.stdout.write(`\r\x1b[2K${COLOR_GREEN}${line}${COLOR_RESET}`)
    }

    process.stdout.write("\x1b[?25l")
    render()
    const timer = setInterval(() => {
        i++
        render()
    }, 400)

    return {
        stop: () => {
            clearInterval(timer)
            process.stdout.write("\r\x1b[2K")
            process.stdout.write("\x1b[?25h")
        },
        setStatus: (text: string) => {
            if (text.length === 0 || text === status) {
                return
            }

            status = text
            render()
        }
    }
}

function _buildQuestionWithContext (input: string): string {
    // let's include on the context paths for then the AI will make
    // the right assuptions for the commands
    let context = ``

    // if there is history, let's include the last 4 turns in the
    // question to provide context to Mimir
    if (history.length > 0) {
        const lastTurns = history.slice(-4)
        context = lastTurns.map((turn) => {
            return `User: ${turn.question}\nMimir: ${turn.answer}`
        }).join("\n\n")

        input = `${GlobalContext}\n${context}\n` +
            `The lines above are only for context, if the next user question does not require context, you can ignore it.\n` +
            `\nUser: ${input}`

    } else {
        input = `${GlobalContext}\n\nUser: ${input}`
    }

    return input
}

async function buildAnswer (question: string): Promise<{
    answer: string,
    command?: string
}> {
    let input = question.trim()

    if (input.length === 0) {
        return {
            answer: "Please ask a question so I can answer it."
        }
    }

    const claude = new ClaudeAPIClient()
    const animation = startThinkingAnimation()

    try {
        input = _buildQuestionWithContext(input)

        const { explanation, command } = await claude.ask(input, (text) => {
            animation.setStatus(text)
        })

        return command ? {
            answer: `${explanation}\n\n${COLOR_RED}Command:${COLOR_RESET} ${command}`,
            command: command
        } : {
            answer: explanation
        }
    } catch (error) {
        return {
            answer: `Failed to reach Mimir API: ${(error as Error).message}`
        }
    } finally {
        animation.stop()
    }
}

function createChatInterface (): Interface {
    return createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: (line: string): [string[], string] => {
            const trimmed = line.trimStart()

            if (!trimmed.startsWith("/")) {
                return [[], line]
            }

            const hits = COMMANDS.filter((cmd) => cmd.startsWith(trimmed))
            const matches = hits.length > 0 ? hits : COMMANDS
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
                continue
            }

            const question = raw.trim()

            if (question.length === 0) {
                continue
            }

            if (question === "/exit") {
                console.log("Goodbye.")
                return
            }

            if (question === "/help") {
                printHelp()
                continue
            }

            if (question === "/clear") {
                history.length = 0
                console.log("History cleared.")
                console.log("")
                continue
            }

            if (question === "/history") {
                printHistory()
                continue
            }

            if (question === "/enableAutoExecuteCommand") {
                AUTO_EXECUTE_COMMAND = true
                console.log("Auto-execution of commands is now enabled.")
                console.log()
                continue
            }

            // not documented /context
            if (question === "/context") {
                console.log(_buildQuestionWithContext(""))
                console.log()
                continue
            }

            const answer = await buildAnswer(question)
            const turn: ChatTurn = {
                question,
                answer: answer.answer,
                timestamp: new Date().toISOString()
            }

            history.push(turn)

            printSeparator()
            console.log(`${COLOR_ORANGE}Mimir:${COLOR_RESET} ${answer.answer}`)
            console.log("")

            if (AUTO_EXECUTE_COMMAND && answer.command) {
                console.log(`${COLOR_GREEN}Executing command:${COLOR_RESET} ${answer.command}`)

                try {
                    execSync(
                        `${answer.command}`,
                        {
                            shell: "/bin/bash",
                            stdio: "inherit",
                            encoding: "utf-8",
                            env: process.env
                        }
                    )
                } catch (_) {
                    // simple do nothing
                }
            }
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
