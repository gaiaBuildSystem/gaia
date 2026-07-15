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

export class ClaudeAPIClient {
    private baseUrl: string

    constructor (
        baseUrl: string = process.env.MIMIR_API_URL || "http://phobos.dev.br:8000"
    ) {
        this.baseUrl = baseUrl
    }

    async ask (question: string, onProgress?: (text: string) => void): Promise<AskResponse> {
        const response = await fetch(`${this.baseUrl}/ask`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question })
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

        return result
    }
}
