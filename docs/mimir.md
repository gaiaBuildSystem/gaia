# Mimir: The Gaia AI Assistant

Mimir is the AI assistant for the Gaia Build System. It knows the build system and
can answer questions about it and, when appropriate, **propose and optionally run shell commands** to carry out a task.

Mimir is a thin, local **client** over a **remote Mimir API** (a Claude-based
service). No model runs on your machine: the client sends the question (plus
context) to the API and renders the streamed answer.

> See [architecture.md](./architecture.md) for where Mimir fits in the overall
> system, and [AGENTS.md](../AGENTS.md) for the build workflow it assists with.

## How it works

```
+------------+   POST /ask (question + context)   +----------------------+
|  Mimir     | ─────────────────────────────────>  |   Mimir API         |
|  client    |   NDJSON stream: progress chunks    |  (Claude-based)     |
| (local)    | <─────────────────────────────────   +----------------------+
+------------+   final: { explanation, command,     (remote)
              |            errorKind }
              |
              |  if command proposed + auto-execute ON:
              |  run it, stream output, and on failure feed the log
              |  back into a new question (up to 4 retries)
```

For every question the client:

1. **Builds context** (see [Context](#context)): the working directory, the
   folders in it, a note about build-output folders, and the contents of
   `gaia/AGENTS.md` when present.
2. **Calls the API**: `POST {MIMIR_API_URL}/ask` with a JSON body
   `{ question }`. The question already carries the recent conversation history
   (last 4 turns) plus the injected context.
3. **Streams the response**: the API returns a **NDJSON** stream of
   `{type:"progress", text}` chunks (rendered live while "thinking") followed by
   one final `{type:"result", explanation, command, errorKind}` object.
4. **Renders the answer** and, when a `command` was proposed, either shows it for
   you to run, or runs it automatically if auto-execute is enabled.

The answer object is:

| Field | Meaning |
|-------|---------|
| `explanation` | Mimir's human-readable answer / reasoning. |
| `command` | An optional shell command Mimir proposes to perform the task. |
| `errorKind` | `"kernel"` or `"other"`, tells the client the question is about a kernel build failure. |

## Entry points

Mimir ships as a set of standalone Deno scripts. Each has a
`#!/usr/bin/env -S deno run --allow-all` shebang and is executable, so it is run
**directly** (it is *not* invoked through the `bitcook` wrapper, which only runs
the build engine).

| Script | Mode | Description |
|--------|------|-------------|
| `scripts/bitcook/mimirOpentui.ts` | **TUI (current)** | Full-screen interactive assistant, built on `@jitl/opentui-core` (v0.2.1). Rich chat view with command output, autocomplete, and a spinner. |
| `scripts/bitcook/mimir.ts` | TUI (Melker) | Earlier terminal UI built on the Melker engine; shares the same client and logic (see `scripts/bitcook/utils/mimirUtils.ts`). |
| `scripts/bitcook/mimir-cli.ts` | **CLI** | One-shot, non-interactive. Print the answer and the proposed command, then exit. |
| `scripts/bitcook/mimirCI.ts` | **CI** | Interactive line-oriented session (readline) intended for scripts and CI pipelines. |

All four use the same core client, `scripts/bitcook/utils/claudeAPI.ts`
(`ClaudeAPIClient`), so they share behavior, context building, and the
auto-execute / error-retry logic.

Example invocations:

```bash
# current TUI
deno run scripts/bitcook/mimirOpentui.ts

# one-shot CLI
deno run scripts/bitcook/mimir-cli.ts "how do I rebuild just the kernel recipe?"

# CI / line-oriented session
deno run scripts/bitcook/mimirCI.ts
```

## Commands

### Current TUI (`mimirOpentui.ts`)

| Command | Description |
|---------|-------------|
| `/clear` | Clear the chat history. |
| `/history` | Show past questions and answers. |
| `/again` | Run the last proposed command again. |
| `/auto` | Toggle agent auto-execute mode. |
| `/stop` | Cancel the current request (and any running command). |
| `/help` | Show the help message. |
| `/exit`, `/quit` | Exit Mimir. |
| `/version` | Show the Mimir version. |

The Melker TUI (`mimir.ts`) exposes the same concepts with slightly different
names: `/enableAutoExecuteCommand` (instead of `/auto`), `/help`, `/history`,
`/clear`, `/exit`, plus `/stop` (while processing) and an undocumented `/context`
debug command.

## Auto-execution and error retry

By default Mimir **only proposes** commands; you run them yourself. Auto-execution
is **opt-in** (via `/auto` in the current TUI, `/enableAutoExecuteCommand` in the
Melker TUI, or `MIMIR_AUTO_RETRY=1` in the CLI).

When auto-execute is enabled and Mimir proposes a `command`:

1. The command runs in a **detached bash process group**:
   `/bin/bash -c "set -o pipefail; { <command>; } 2>&1 | tee <logfile>"`, so its
   full pipeline can be signaled at once (see [Stopping](#stopping)).
2. Output is **streamed live** into the UI as it arrives.
3. If the command **succeeds** (exit code 0), the error counter is reset.
4. If it **fails**, Mimir feeds the **last 500 lines** of the log back as a new
   question and asks the API to continue. This auto-retry loop is bounded by
   `MAX_ERROR_COUNT = 4` attempts.

Stopping: `/stop` (or `/again`-less interruption) sets a flag, **aborts the in-flight
LLM request** (via `AbortController`) and, if a command is running, sends
`SIGTERM` to the child's **process group** (negative PID). A stop requested by the
user is *not* treated as a failure, so it does not trigger the auto-retry loop.

## Kernel build error analysis

When the API classifies a question as a kernel build failure
(`errorKind === "kernel"`), the client routes the **follow-up** call to a
dedicated analysis endpoint instead of the normal one:

| Endpoint | Purpose |
|----------|---------|
| `/ask` | Default: answer a question and optionally propose a command. |
| `/analyze/kernel/build/logs` | Analyze kernel build logs. Returns an analysis only (no command to execute). |

This is useful when a `bitcook` kernel build fails and you want a focused read of
what went wrong rather than a generic command.

## Context

Every question is enriched with context built on the client side so Mimir reasons
about *your* workspace:

- The current **working directory** (PWD).
- The **top-level folders** in PWD, presented as the possible repositories.
- A reminder that `build-<distro>` folders are **build output, not repositories**.
  Avoid treating them as source.
- A precedence note: **`AGENTS.md` takes precedence over `README.md`** for
  developer documentation.
- The **contents of `gaia/AGENTS.md`** (when it exists), so Mimir follows the
  project's own build instructions and warnings.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MIMIR_API_URL` | `https://phobos.dev.br:8000` | Base URL of the Mimir API. |
| `MIMIR_NO_COLOR` | off | Disable ANSI color output (CLI). |
| `MIMIR_AUTO_RETRY` | off | Enable auto-execute + error-retry in the CLI. |

## File map

| Path | Role |
|------|------|
| `scripts/bitcook/utils/claudeAPI.ts` | Core client: API calls, NDJSON parsing, context, history, Markdown→ANSI. |
| `scripts/bitcook/mimirOpentui.ts` | Current full-screen TUI (OpenTUI). |
| `scripts/bitcook/mimir.ts` | Earlier Melker-based TUI entry. |
| `scripts/bitcook/utils/mimirUtils.ts` | Shared TUI logic: command loop, auto-execute, retry, stop, context. |
| `scripts/bitcook/utils/mimir.melker`, `melkerAnsi.ts`, `melkerTerminal.ts`, `melkerUtils.ts` | Melker UI definition and terminal components. |
| `scripts/bitcook/mimir-cli.ts` | One-shot CLI mode. |
| `scripts/bitcook/mimirCI.ts` | CI / line-oriented interactive mode. |

## Safety

- Mimir **proposes** commands; it does not run them unless you explicitly enable
  auto-execution.
- Commands run by Mimir execute in your shell environment. Treat a proposed
  command the way you would any command you type.
- Use `/stop` to abort a long-running answer or command at any time.
