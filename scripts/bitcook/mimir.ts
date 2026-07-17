#!/usr/bin/env -S deno run --allow-all

import process from "node:process"
import {
    createApp,
    melker
} from "@melker/melker/lib"
import { installOsc52Clipboard } from "./utils/melkerUtils.ts"
import { handleCommand, loop, updateCommandHint } from "./utils/mimirUtils.ts"

process.env.COLORTERM = "truecolor"
const VERSION = "0.1.0"

// load from .melker template
const tuiDef = Deno.readTextFileSync(
    `${import.meta.dirname}/utils/mimir.melker`
)

const tui = melker(Object.assign(
    [tuiDef],
    {
        raw: [tuiDef]
    }
))

const app = await createApp(tui, {
    colorSupport: "256",
    hideCursor: true,
    enableMouse: true,
    autoRender: true
})

// try to use native terminal clipboard
installOsc52Clipboard(app)

// backend assignments
const messageInput = app.document.getElementById("messageInput")
const welcome = app.document.getElementById("welcome")
const welcomeContainer = app.document.getElementById("welcomeContainer")

welcome!.props.text = `
    Mimir knows everything about Gaia, Bitcook, DeimOS and PhobOS.
    Version: ${VERSION}
`

messageInput!.props.placeholder = "Type your message here..."

// deno-lint-ignore no-explicit-any
messageInput!.props.onChange = (ev: any) => {
    updateCommandHint(app, ev.value)
}

// deno-lint-ignore no-explicit-any
messageInput!.props.onKeyPress = async (ev: any) => {
    if (ev.key === "Enter" && messageInput!.props.value !== "") {
        welcomeContainer!.props.visible = false
        const _input = messageInput!.props.value

        if (await handleCommand(_input, app)) {
            return
        }

        await loop(_input, app)
    }
}

app.focusElement("messageInput")

// run Forest run
app.render()
