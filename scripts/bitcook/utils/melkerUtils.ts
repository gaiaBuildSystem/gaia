import type { MelkerEngine } from "@melker/melker/lib"

function writeOsc52 (text: string): void {
    const b64 = btoa(unescape(encodeURIComponent(text))) // UTF-8 safe base64
    let seq = `\x1b]52;c;${b64}\x07`

    // tmux swallows OSC 52 by default — wrap it in a DCS passthrough sequence.
    // Requires `set -g allow-passthrough on` in tmux.conf (tmux >= 3.3).
    if (Deno.env.get('TMUX')) {
        // deno-lint-ignore no-control-regex
        seq = `\x1bPtmux;${seq.replace(/\x1b/g, '\x1b\x1b')}\x1b\\`
    }

    Deno.stdout.writeSync(new TextEncoder().encode(seq))
}

export function installOsc52Clipboard (engine: MelkerEngine): void {
    // deno-lint-ignore no-explicit-any
    engine.eventManager?.addGlobalEventListener('keydown', (event: any) => {
        const isCopyShortcut = event.altKey && (event.key === 'c' || event.key === 'n')
        if (!isCopyShortcut) return

        const { selectedText } = engine.getTextSelection()
        if (!selectedText) return

        writeOsc52(selectedText)
        // Optional: prevent the engine's own Alt+C handler (pbcopy/xclip/etc.)
        // from also running and showing its own failure toast.
        // event.preventDefault = true;
    })

    engine.eventManager?.addGlobalEventListener('mouseup', () => {
        queueMicrotask(() => {
            const { selectedText } = engine.getTextSelection()
            if (selectedText) writeOsc52(selectedText)
        })
    })
}
