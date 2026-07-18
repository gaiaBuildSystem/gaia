import {
    Element,
    registerComponent,
    type Bounds,
    type DualBuffer,
    type Cell,
    type SelectionBounds,
    type IntrinsicSizeContext,
} from '@melker/melker/lib'

export const ANSI_16: [number, number, number][] = [
    [0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0], [0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
    [127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0], [92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
]

export function packRGBA (r: number, g: number, b: number, a = 255): number {
    return ((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((b & 0xFF) << 8) | (a & 0xFF)
}

export function ansi256ToRgb (n: number): [number, number, number] {
    if (n < 16) return ANSI_16[n]
    if (n < 232) {
        const i = n - 16
        const scale = (v: number) => (v === 0 ? 0 : 55 + v * 40)
        return [scale(Math.floor(i / 36)), scale(Math.floor((i % 36) / 6)), scale(i % 6)]
    }
    const g = 8 + (n - 232) * 10
    return [g, g, g]
}

interface PenState {
    fg?: number
    bg?: number
    bold?: boolean
    dim?: boolean
    italic?: boolean
    underline?: boolean
    reverse?: boolean
}

function applySgr (codes: number[], pen: PenState): void {
    let i = 0
    while (i < codes.length) {
        const c = codes[i]
        // deno-lint-ignore no-explicit-any
        if (c === 0) { for (const k of Object.keys(pen)) delete (pen as any)[k] }
        else if (c === 1) pen.bold = true
        else if (c === 2) pen.dim = true
        else if (c === 3) pen.italic = true
        else if (c === 4) pen.underline = true
        else if (c === 7) pen.reverse = true
        else if (c === 22) { pen.bold = false; pen.dim = false }
        else if (c === 23) pen.italic = false
        else if (c === 24) pen.underline = false
        else if (c === 27) pen.reverse = false
        else if (c >= 30 && c <= 37) pen.fg = packRGBA(...ANSI_16[c - 30])
        else if (c === 38) {
            if (codes[i + 1] === 5) { pen.fg = packRGBA(...ansi256ToRgb(codes[i + 2])); i += 2 }
            else if (codes[i + 1] === 2) { pen.fg = packRGBA(codes[i + 2], codes[i + 3], codes[i + 4]); i += 4 }
        }
        else if (c === 39) pen.fg = undefined
        else if (c >= 40 && c <= 47) pen.bg = packRGBA(...ANSI_16[c - 40])
        else if (c === 48) {
            if (codes[i + 1] === 5) { pen.bg = packRGBA(...ansi256ToRgb(codes[i + 2])); i += 2 }
            else if (codes[i + 1] === 2) { pen.bg = packRGBA(codes[i + 2], codes[i + 3], codes[i + 4]); i += 4 }
        }
        else if (c === 49) pen.bg = undefined
        else if (c >= 90 && c <= 97) pen.fg = packRGBA(...ANSI_16[8 + (c - 90)])
        else if (c >= 100 && c <= 107) pen.bg = packRGBA(...ANSI_16[8 + (c - 100)])
        i++
    }
}

// deno-lint-ignore no-control-regex
const SGR_RE = /\x1b\[([0-9;]*)m/g

/** One row of cells: char + resolved style, already split on grapheme-ish boundaries. */
function tokenizeLine (line: string): { char: string; pen: PenState }[] {
    const cells: { char: string; pen: PenState }[] = []
    // deno-lint-ignore prefer-const
    let pen: PenState = {}
    let lastIndex = 0
    let match: RegExpExecArray | null
    SGR_RE.lastIndex = 0

    const pushPlain = (text: string) => {
        for (const ch of text) cells.push({ char: ch, pen: { ...pen } })
    }

    while ((match = SGR_RE.exec(line)) !== null) {
        pushPlain(line.slice(lastIndex, match.index))
        const codes = match[1].length ? match[1].split(';').map(Number) : [0]
        applySgr(codes, pen)
        lastIndex = SGR_RE.lastIndex
    }
    pushPlain(line.slice(lastIndex))
    return cells
}

export interface RawAnsiProps {
    text?: string
    // deno-lint-ignore no-explicit-any
    style?: Record<string, any>
    id?: string
    /** Max source lines kept, oldest dropped first — like a terminal's scrollback limit. Default 5000. */
    maxLines?: number
}

const DEFAULT_MAX_LINES = 1000

type AnsiCell = { char: string; pen: PenState }

/** One rendered screen row. `isContinuation` = true if it's a soft-wrap of the previous row, not a real source newline. */
interface WrappedRow {
    cells: AnsiCell[]
    isContinuation: boolean
}

/**
 * Renders raw ANSI-coded text verbatim, cell-by-cell, preserving exact
 * column alignment and colors from the source CLI output. Soft-wraps at
 * the container width like a real terminal (character wrap, not word
 * wrap — matches native terminal behavior). Implements SelectableTextProvider
 * so Alt+C copy returns the original un-wrapped source lines instead of
 * text broken at every soft-wrap point.
 */
export class RawAnsiElement extends Element {
    private _lines: AnsiCell[][] = []
    private _lastText: string | undefined
    private _wrappedRows: WrappedRow[] = []
    private _wrapWidth = -1

    constructor (props: RawAnsiProps, children?: Element[]) {
        super('raw-ansi', props, children)
    }

    /** Marks this element as text-selectable so drag-select uses component-scoped
     * selection (which calls getSelectableText below) instead of falling back to
     * Melker's global rectangular buffer selection, which has no wrap awareness. */
    isTextSelectable (): boolean {
        return true
    }

    private _ensureParsed (): void {
        const text = this.props.text ?? ''
        if (text === this._lastText) return
        this._lastText = text
        const lines = text.split('\n')
        const maxLines = this.props.maxLines ?? DEFAULT_MAX_LINES
        const capped = lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines
        this._lines = capped.map(tokenizeLine)
        this._wrapWidth = -1 // force rewrap on next render
    }

    private _ensureWrapped (width: number): void {
        this._ensureParsed()
        if (width === this._wrapWidth) return
        this._wrapWidth = width
        this._wrappedRows = []

        const w = Math.max(1, width)
        for (const line of this._lines) {
            if (line.length === 0) {
                this._wrappedRows.push({ cells: [], isContinuation: false })
                continue
            }
            for (let offset = 0; offset < line.length; offset += w) {
                this._wrappedRows.push({
                    cells: line.slice(offset, offset + w),
                    isContinuation: offset > 0,
                })
            }
        }
    }

    intrinsicSize (context: IntrinsicSizeContext): { width: number; height: number } {
        this._ensureParsed()
        const naturalWidth = this._lines.reduce((m, l) => Math.max(m, l.length), 0)
        const available = context.availableSpace.width || naturalWidth || 80

        // Wrap at the space actually available so height matches what render()
        // will produce — otherwise the layout box is too short and content
        // gets clipped away almost entirely.
        this._ensureWrapped(available)
        return { width: Math.min(naturalWidth, available), height: this._wrappedRows.length }
    }

    render (bounds: Bounds, style: Partial<Cell>, buffer: DualBuffer): void {
        if (bounds.width <= 0 || bounds.height <= 0) return
        this._ensureWrapped(bounds.width)

        for (let row = 0; row < this._wrappedRows.length && row < bounds.height; row++) {
            const { cells } = this._wrappedRows[row]
            for (let col = 0; col < cells.length && col < bounds.width; col++) {
                const { char, pen } = cells[col]
                const cell: Cell = {
                    char,
                    // Fall back to the resolved theme/container style whenever
                    // the ANSI stream itself didn't set a color for this cell —
                    // otherwise uncolored output shows the terminal's native
                    // background instead of the app's theme.
                    foreground: pen.fg ?? style.foreground,
                    background: pen.bg ?? style.background,
                    bold: pen.bold,
                    dim: pen.dim,
                    italic: pen.italic,
                    underline: pen.underline,
                    reverse: pen.reverse,
                }
                buffer.currentBuffer.setCell(bounds.x + col, bounds.y + row, cell)
            }
        }
    }

    /**
     * Returns the original source text for the selected region, joining
     * soft-wrapped rows back together (no separator) and only inserting
     * '\n' at real source line breaks — so copy comes back as one line
     * even though it was displayed wrapped across several screen rows.
     */
    getSelectableText (selectionBounds?: SelectionBounds): string {
        // Wrap state reflects the last rendered width, which is what the
        // selection's x/y coordinates (from the on-screen buffer) are in terms of.
        if (!selectionBounds || selectionBounds.startY === undefined || selectionBounds.endY === undefined) {
            return this._lines.map(l => l.map(c => c.char).join('')).join('\n')
        }

        const { startX, endX, startY, endY } = selectionBounds
        const firstY = Math.min(startY, endY)
        const lastY = Math.max(startY, endY)
        const isSingleRow = firstY === lastY

        let result = ''
        for (let y = firstY; y <= lastY && y < this._wrappedRows.length; y++) {
            const row = this._wrappedRows[y]
            let lineStartX: number
            let lineEndX: number

            if (isSingleRow) {
                lineStartX = Math.min(startX, endX)
                lineEndX = Math.max(startX, endX)
            } else if (y === firstY) {
                lineStartX = startY <= endY ? startX : endX
                lineEndX = row.cells.length - 1
            } else if (y === lastY) {
                lineStartX = 0
                lineEndX = startY <= endY ? endX : startX
            } else {
                lineStartX = 0
                lineEndX = row.cells.length - 1
            }

            const text = row.cells.slice(Math.max(0, lineStartX), lineEndX + 1).map(c => c.char).join('')
            result += text

            // Only break to a new copied line where the NEXT row is a real
            // source line break, not a soft-wrap continuation of this one.
            const nextRow = this._wrappedRows[y + 1]
            if (y < lastY && (!nextRow || !nextRow.isContinuation)) {
                result += '\n'
            }
        }
        return result
    }
}

export function installRawAnsiComponent (): void {
    registerComponent({
        type: 'raw-ansi',
        componentClass: RawAnsiElement,
    })
}
