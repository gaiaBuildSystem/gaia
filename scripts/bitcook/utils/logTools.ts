#!/usr/bin/env -S deno run --allow-all

import type { ClaudeAPIClient } from "./claudeAPI.ts"

// id the output of the last failed command is published under
export const LAST_OUTPUT_LOG_ID = "last_command_output"

// how many lines from the end of a failed command's output are sent inline
// with the question; anything above that is reached through the tools
const INLINE_TAIL_LINES = 60

// caps that keep a single tool result small enough to not blow up the
// request the server sends to the model on the next loop iteration
const MAX_READ_LINES = 200
const MAX_MATCHES = 50
const MAX_CONTEXT_LINES = 10
const MAX_LINE_LENGTH = 500
const MAX_RESULT_CHARS = 20000

// deno-lint-ignore no-control-regex
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g

// Exposes local log files to the mimir model as tools, so it can search and
// page through the full output of a failed command instead of only seeing
// whatever tail fit in the question. Only files published with setLog() are
// reachable — the model never gets a path, just the ids handed out here.
export class LogToolbox {
    private _logs = new Map<string, string>()
    private _lines = new Map<string, string[]>()

    constructor (client: ClaudeAPIClient) {
        client.registerTool({
            name: "log_search",
            description:
                "Search a local log file from the user's machine with a case-insensitive " +
                "regular expression. Returns the matching lines with their line numbers and " +
                "surrounding context. Use it to find the root cause of a failure, which is " +
                "often far above the end of the log (eg. pattern \"error|fatal|failed|No such file\").",
            input_schema: {
                type: "object",
                properties: {
                    log_id: { type: "string", description: "Id of the log, as given in the question" },
                    pattern: { type: "string", description: "JavaScript regular expression, matched case-insensitively per line" },
                    context_lines: { type: "integer", description: `Lines of context before and after each match (default 2, max ${MAX_CONTEXT_LINES})` },
                    max_matches: { type: "integer", description: `Maximum matches to return (default 20, max ${MAX_MATCHES})` },
                    from_end: { type: "boolean", description: "Return the last matches instead of the first ones (default false)" }
                },
                required: ["log_id", "pattern"]
            },
            handler: (input) => this._search(input)
        })

        client.registerTool({
            name: "log_read",
            description:
                "Read a range of lines from a local log file from the user's machine. " +
                "Lines are 1-based and returned with their line numbers.",
            input_schema: {
                type: "object",
                properties: {
                    log_id: { type: "string", description: "Id of the log, as given in the question" },
                    start_line: { type: "integer", description: "First line to read, 1-based; negative values count from the end (-100 = 100th line from the end)" },
                    line_count: { type: "integer", description: `How many lines to read (default 100, max ${MAX_READ_LINES})` }
                },
                required: ["log_id", "start_line"]
            },
            handler: (input) => this._read(input)
        })
    }

    public setLog (id: string, path: string): void {
        this._logs.set(id, path)
        this._lines.delete(id)
    }

    // the question sent to mimir when a command fails: a short tail inline
    // plus a pointer to the full output through the log tools, instead of
    // pasting hundreds of lines that both overflow the request and are
    // stored in the history that every next turn resends
    public failedCommandQuestion (command: string, outputFile: string): string {
        this.setLog(LAST_OUTPUT_LOG_ID, outputFile)

        let lines: string[]
        try {
            lines = this._getLines(LAST_OUTPUT_LOG_ID)
        } catch (error) {
            return `The command "${command}" failed to execute, and its output could not be read: ${(error as Error).message}\n`
        }

        const tail = lines.slice(-INLINE_TAIL_LINES)
        const firstTailLine = lines.length - tail.length + 1

        return `The command "${command}" failed to execute. ` +
            `Its full output has ${lines.length} lines and is available through the log_search and log_read tools ` +
            `with log_id "${LAST_OUTPUT_LOG_ID}". The real root cause is often far above the last lines, ` +
            `so search the log for errors before answering. ` +
            `Last ${tail.length} lines:\n` +
            this._format(tail, firstTailLine) + "\n"
    }

    private _getLines (id: string): string[] {
        const cached = this._lines.get(id)
        if (cached) {
            return cached
        }

        const path = this._logs.get(id)
        if (!path) {
            const known = [...this._logs.keys()].join(", ") || "none"
            throw new Error(`Unknown log_id "${id}", available: ${known}`)
        }

        const lines = Deno.readTextFileSync(path)
            .replace(ANSI_PATTERN, "")
            .split("\n")
            // progress bars rewrite the line with \r, only the last frame matters
            .map((line) => line.split("\r").filter((part) => part.length > 0).pop() ?? "")

        if (lines.length > 0 && lines[lines.length - 1] === "") {
            lines.pop()
        }

        this._lines.set(id, lines)
        return lines
    }

    // "<number>| <line>", long lines cut so one minified blob can't eat the budget
    private _format (lines: string[], firstLineNumber: number): string {
        return lines.map((line, index) => {
            const text = line.length > MAX_LINE_LENGTH
                ? `${line.slice(0, MAX_LINE_LENGTH)}… [${line.length - MAX_LINE_LENGTH} more chars]`
                : line
            return `${firstLineNumber + index}| ${text}`
        }).join("\n")
    }

    private _clampInt (value: unknown, fallback: number, min: number, max: number): number {
        const number = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback
        return Math.min(Math.max(number, min), max)
    }

    private _limit (text: string): string {
        if (text.length <= MAX_RESULT_CHARS) {
            return text
        }
        return `${text.slice(0, MAX_RESULT_CHARS)}\n… [result truncated, narrow the range or the pattern]`
    }

    private _read (input: Record<string, unknown>): string {
        const lines = this._getLines(String(input.log_id))
        const count = this._clampInt(input.line_count, 100, 1, MAX_READ_LINES)

        let start = this._clampInt(input.start_line, 1, -lines.length, lines.length)
        if (start < 0) {
            start = lines.length + start + 1
        }
        start = Math.max(start, 1)

        const slice = lines.slice(start - 1, start - 1 + count)
        const end = start + slice.length - 1

        return this._limit(
            `Lines ${start}-${end} of ${lines.length}:\n` + this._format(slice, start)
        )
    }

    private _search (input: Record<string, unknown>): string {
        const lines = this._getLines(String(input.log_id))
        const context = this._clampInt(input.context_lines, 2, 0, MAX_CONTEXT_LINES)
        const maxMatches = this._clampInt(input.max_matches, 20, 1, MAX_MATCHES)

        let pattern: RegExp
        try {
            pattern = new RegExp(String(input.pattern), "i")
        } catch (error) {
            throw new Error(`Invalid pattern: ${(error as Error).message}`)
        }

        const allMatches: number[] = []
        lines.forEach((line, index) => {
            if (pattern.test(line)) {
                allMatches.push(index)
            }
        })

        if (allMatches.length === 0) {
            return `No matches for /${input.pattern}/i in ${lines.length} lines.`
        }

        const matches = input.from_end === true
            ? allMatches.slice(-maxMatches)
            : allMatches.slice(0, maxMatches)

        // merge overlapping context windows into contiguous blocks
        const blocks: Array<[number, number]> = []
        for (const index of matches) {
            const from = Math.max(0, index - context)
            const to = Math.min(lines.length - 1, index + context)
            const last = blocks[blocks.length - 1]
            if (last && from <= last[1] + 1) {
                last[1] = Math.max(last[1], to)
            } else {
                blocks.push([from, to])
            }
        }

        const header = `${allMatches.length} matching lines in ${lines.length} lines` +
            (allMatches.length > matches.length
                ? `, showing the ${input.from_end === true ? "last" : "first"} ${matches.length}:`
                : ":")

        const body = blocks
            .map(([from, to]) => this._format(lines.slice(from, to + 1), from + 1))
            .join("\n--\n")

        return this._limit(`${header}\n${body}`)
    }
}
