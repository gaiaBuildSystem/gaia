#!/usr/bin/env -S deno run --allow-all

import process from "node:process"
import { execSync } from "node:child_process"
import { ClaudeAPIClient } from "./utils/claudeAPI.ts"

// we need this global
// deno-lint-ignore no-var
var GlobalErrorCount = 0
const MAX_ERROR_COUNT = 4
const VERSION = "0.1.0"

// strip ANSI escape codes from a string — used when MIMIR_NO_COLOR (or
// NO_COLOR) is set so the API's colored output passes through plain
const stripAnsi = (text: string): string =>
    // deno-lint-ignore no-control-regex
    text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")

// set MIMIR_NO_COLOR=1 (or NO_COLOR) to disable ANSI coloring in the
// API response and thinking output
const NO_COLOR = process.env.MIMIR_NO_COLOR === "1"
    || process.env.NO_COLOR !== undefined
    || process.env.NO_COLOR === "1"

const clean = (text: string): string => NO_COLOR ? stripAnsi(text) : text

// set MIMIR_AUTO_RETRY=1 to enable the automatic command-failure retry loop.
// Off by default: a failed command is reported (logs included) but not fed
// back to the model automatically. The kernel-build analysis follow-up
// (errorKind === "kernel") is unaffected and always runs.
const AUTO_RETRY = process.env.MIMIR_AUTO_RETRY === "1"


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

const loop = async (question: string) => {
    // the /ask response for the previous turn flagged this as a kernel
    // build error (errorKind === "kernel"): this turn goes to the
    // specialized /analyze/kernel/build/logs endpoint instead of /ask, and
    // its answer is analysis only — no command is proposed or executed
    const isKernelAnalysis = pendingKernelBuildAnalysis
    pendingKernelBuildAnalysis = false

    // pipeline-friendly: print a single "Thinking..." marker before asking,
    // not the streamed partials (no animation, no dependency on progress
    // chunks arriving)
    console.log("\nThinking...\n")

    const turn = await mimir.ask(
        question,
        undefined,
        undefined,
        isKernelAnalysis ? "/analyze/kernel/build/logs" : "/ask"
    )

    lastResponseErrorKind = turn.errorKind

    console.log("")
    console.log(`Mimir: ${clean(turn.explanation)}\n`)
    if (turn.command != null && !isKernelAnalysis) {
        console.log("")
        console.log(`\nCommand: ${turn.command}\n`)
    }

    if (turn.explanation.trim().includes('I do not have the answer to your question')) {
        console.log(`Mimir: ${clean(turn.explanation)} \n`)
        Deno.exit(69)
    }

    if (GlobalErrorCount <= MAX_ERROR_COUNT && turn.command != null && !isKernelAnalysis) {
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
            // report the failure; auto-retry (feed the failure back to the
            // model) is opt-in via MIMIR_AUTO_RETRY=1
            GlobalErrorCount++

            if (AUTO_RETRY && GlobalErrorCount < MAX_ERROR_COUNT) {
                // Prefer captured command output, but fallback to the thrown error message.
                let _outputTmpFileContent = ""

                try {
                    const _fullOutput = Deno.readTextFileSync(_outputTmpFile)
                    const _lines = _fullOutput.split("\n")

                    _outputTmpFileContent = _lines.length > 500
                        ? _lines.slice(-500).join("\n")
                        : _fullOutput
                } catch {
                    const e = error as Error
                    _outputTmpFileContent = e.message
                }

                if (lastResponseErrorKind === "kernel") {
                    pendingKernelBuildAnalysis = true
                }

                // wow, AI knows how to do recursion?
                await loop(
                    `The command "${turn.command}" failed to execute, logs: ${_outputTmpFileContent}\n`
                )
            } else if (!AUTO_RETRY) {
                console.log("")
                console.log(`Command failed (exit reported above). Auto-retry is disabled; set MIMIR_AUTO_RETRY=1 to enable it.`)
            }
        }
    }

    // /ask flagged this as a kernel build error but no command was
    // executed (either no command was proposed, or auto-execute is
    // disabled): follow up with the specialized analysis endpoint
    if (lastResponseErrorKind === "kernel" && !isKernelAnalysis) {
        pendingKernelBuildAnalysis = true
        await loop(question)
    }
}

// ok, so input the question and run the command
// Join all arguments to handle multi-word questions properly
const input = Deno.args.join(" ")
await loop(input)
