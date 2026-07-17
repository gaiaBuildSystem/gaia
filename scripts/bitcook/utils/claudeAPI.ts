#!/usr/bin/env -S deno run --allow-all

import logger from "node-color-log"
import process from "node:process"

export type AskResponse = {
    explanation: string
    command: string | null
}

type StreamLine = {
    type: "progress" | "result"
    text?: string
    explanation?: string
    command?: string | null
}

export type ChatTurn = {
    question: string
    answer: AskResponse
    timestamp: string
}

export class ClaudeAPIClient {
    private baseUrl: string
    private _additionalContext = ""
    private _maxHistoryContext = 4
    private _history: ChatTurn[] = []

    constructor (
        baseUrl: string = process.env.MIMIR_API_URL || "http://phobos.dev.br:8000"
    ) {
        this.baseUrl = baseUrl
    }

    private _buildQuestionWithContext (input: string): string {
        // let's include on the context paths for then the AI will make
        // the right assuptions for the commands
        let context = ``

        // if there is history, let's include the last 4 turns in the
        // question to provide context to Mimir
        if (this._history.length > 0) {
            const lastTurns = this._history.slice(-this._maxHistoryContext)
            context = lastTurns.map((turn) => {
                return `User: ${turn.question}\nMimir: ${turn.answer.explanation}`
            }).join("\n\n")

            input = `${this._additionalContext}\n${context}\n` +
                `The lines above are only for context, if the next user question does not require context, you can ignore it.\n` +
                `\nUser: ${input}`

        } else {
            input = `${this._additionalContext}\n\nUser: ${input}`
        }

        return input
    }

    public setMaxHistoryContext (max: number) {
        this._maxHistoryContext = max
    }

    public setAdditionalContext (context: string) {
        this._additionalContext = context
    }

    public getHistory (): ChatTurn[] {
        return this._history
    }

    public clearHistory (): void {
        this._history.length = 0
    }

    async ask (question: string, onProgress?: (text: string) => void): Promise<AskResponse> {
        const _question = this._buildQuestionWithContext(question)
        const response = await fetch(`${this.baseUrl}/ask`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question: _question })
        })

        if (!response.ok) {
            const body = await response.text()
            logger.error(`mimir API request failed: ${response.status} ${body}`)
            throw new Error(`mimir API request failed with status ${response.status}`)
        }

        if (!response.body) {
            throw new Error("mimir API response has no body")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let result: AskResponse | null = null

        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }

            buffer += decoder.decode(value, { stream: true })

            let newlineIndex: number
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim()
                buffer = buffer.slice(newlineIndex + 1)

                if (line.length === 0) {
                    continue
                }

                const parsed = JSON.parse(line) as StreamLine

                if (parsed.type === "progress") {
                    onProgress?.(parsed.text ?? "")
                } else if (parsed.type === "result") {
                    result = {
                        explanation: parsed.explanation ?? "",
                        command: parsed.command ?? null
                    }
                }
            }
        }

        if (!result) {
            throw new Error("mimir API stream ended without a result")
        }

        this._history.push({
            question,
            answer: result,
            timestamp: new Date().toISOString()
        })

        return result
    }
}
