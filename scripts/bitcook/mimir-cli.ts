#!/usr/bin/env -S deno run --allow-all

import process from "node:process"
import { execSync } from "node:child_process"
import { ClaudeAPIClient } from "./utils/claudeAPI.ts"

// we need this global
// deno-lint-ignore no-var
var GlobalErrorCount = 0
const MAX_ERROR_COUNT = 4
const VERSION = "0.1.0"


// llm client
const mimir = new ClaudeAPIClient()
const _pwd = process.cwd()
const _dirs = Deno.readDirSync(_pwd)
mimir.setAdditionalContext(
    `Project workdir, or PWD, is the following,` +
    `${_pwd}\n\n` +
    `USE THIS PATH AS BASE FOR THE COMMANDS SUGGESTIONS EVERYTHING WITH A PATH, AVOID cd WHENEVER POSSIBLE!\n\n` +
    `The project workdir has the following folders that are possible repos:\n` +
    `${_dirs.toArray().map(dir => `${_pwd}/${dir.name}`).join("\n")}\n\n` +
    `Gaia build system generates folders for the distro build like ./build-<distro name>, these folders are not repos, but build output folders, avoid them.\n\n` +
    `If the repo has an AGENTS.md file give it precedence over README.md for developer documentation.\n\n`
)

// the first argument is a string witht the question
if (Deno.args.length === 0) {
    console.log("The first argument is a string with the question")
    Deno.exit(404)
}

if (Deno.args[0] === "--version") {
    console.log(`Mimir CLI version ${VERSION}`)
    Deno.exit(0)
}

const loop = async (question: string) => {
    const turn = await mimir.ask(question)

    if (turn.explanation.trim() === 'Okay, there\'re a few gaps in my knowledge, I do not have the answer to your question') {
        console.log(`Mimir: ${turn.explanation}`)
        Deno.exit(69)
    }

    if (GlobalErrorCount <= MAX_ERROR_COUNT && turn.command != null) {
        const _outputTmpFile = `/tmp/mimir_output_${Date.now()}.log`

        try {
            // remove the previous output file if it exists
            try {
                Deno.removeSync(_outputTmpFile)
            } catch {
                // ignore if the file does not exist
            }

            execSync(
                `set -o pipefail; { ${turn.command}; } 2>&1 | tee ${_outputTmpFile}`,
                {
                    shell: "/bin/bash",
                    stdio: "inherit",
                    encoding: "utf-8",
                    env: process.env
                }
            )

            GlobalErrorCount = 0
        } catch (error) {
            // let's continue the loop in the agent inputting the
            // next question as the error
            // we need to also have some way to stop if we have so
            // many levels of errors
            GlobalErrorCount++

            if (GlobalErrorCount < MAX_ERROR_COUNT) {
                // Prefer captured command output, but fallback to the thrown error message.
                let _outputTmpFileContent = ""

                try {
                    _outputTmpFileContent = Deno.readTextFileSync(_outputTmpFile)
                } catch {
                    const e = error as Error
                    _outputTmpFileContent = e.message
                }

                // wow, AI knows how to do recursion?
                await loop(
                    `The command "${turn.command}" failed to execute, logs: ${_outputTmpFileContent}\n`
                )
            }
        }
    }
}

// ok, so input the question and run the command
const input = Deno.args[0]
await loop(input)
