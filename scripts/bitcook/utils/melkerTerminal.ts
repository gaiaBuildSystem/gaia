import {
    Element,
    registerComponent,
    type Bounds,
    type DualBuffer,
    type Cell,
    type IntrinsicSizeContext,
    type SelectionBounds,
    type Wheelable,
} from '@melker/melker/lib'
// @xterm/headless ships a CJS bundle whose named exports aren't statically
// analyzable (dynamic `for (var n in i) r[n] = i[n]` re-export), so Deno's
// npm interop only exposes it as a default export — destructure from that.
import xtermHeadless from '@xterm/headless'
import type { Terminal as TerminalType } from '@xterm/headless'
const { Terminal } = xtermHeadless as unknown as { Terminal: typeof TerminalType }
import { packRGBA, ansi256ToRgb } from './melkerAnsi.ts'

export interface TerminalProps {
    text?: string
    // deno-lint-ignore no-explicit-any
    style?: Record<string, any>
    id?: string
    /** Lines kept in xterm's own scrollback ring above the live viewport. Default 2000. */
    scrollback?: number
    /** Max rows claimed from the layout at once; content beyond this is reached
     * via the element's own internal scroll (mouse wheel), not by growing
     * taller. Default 20. */
    maxVisibleRows?: number
}

function mapColor (isRGB: boolean, isPalette: boolean, isDefault: boolean, value: number): number | undefined {
    if (isDefault) return undefined
    if (isRGB) return packRGBA((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF)
    if (isPalette) return packRGBA(...ansi256ToRgb(value))
    return undefined
}

/**
 * Internal viewport row count, decoupled from the reported layout height.
 * This just needs to be tall enough that cursor-up redraws (e.g. docker's
 * multi-layer progress lines) never scroll a line out of reach; the actual
 * height reported to the layout engine is the real content height (see
 * _contentHeight), not this constant.
 */
const VIEWPORT_ROWS = 200

const DEFAULT_MAX_VISIBLE_ROWS = 20

/**
 * Renders subprocess output through a real VT100 emulator (xterm.js headless
 * core) instead of treating it as flat text. Unlike RawAnsiElement this
 * understands `\r`, cursor movement, and erase sequences, so in-place
 * progress redraws (e.g. `docker pull` layer progress) render as a real
 * terminal would instead of stacking up as garbled repeated lines.
 *
 * Caps its own reported height at maxVisibleRows (default 20) instead of
 * claiming its full content height — a long command's output is reached via
 * this element's own internal scroll (mouse wheel), not by growing the
 * ancestor logsContainer's scroll region. This is a fixed, layout-independent
 * cap (not derived from IntrinsicSizeContext.availableSpace): an earlier
 * attempt to cap height dynamically from availableSpace broke logsContainer's
 * auto-scroll-to-bottom, because that value's real meaning inside a scrollable
 * flex ancestor didn't match what was assumed. A fixed cap sidesteps that
 * entirely — logsContainer always sees a small, constant contribution from
 * this element, regardless of how much output it's actually holding.
 */
export class TerminalElement extends Element implements Wheelable {
    private _term: TerminalType
    private _lastTextLength = 0
    private _priorText = ''
    private _cols = 80
    private _rows = VIEWPORT_ROWS
    private _maxVisibleRows: number
    /**
     * Rows scrolled up from the live tail (0 = showing the most recent
     * output, like a real terminal auto-following new writes; increasing
     * values move further back into this element's own history). See
     * handleWheel/render.
     */
    private _scrollOffset = 0
    private _lastViewportHeight = 0
    private _lastRenderStartRow = 0
    /**
     * Terminal.write() flushes asynchronously (on a macrotask, not even a
     * microtask) even for tiny chunks, so a render() called right after
     * _ensureFed() can miss content that hasn't parsed yet. Callers that need
     * the final chunk of a finished stream to actually reach the screen
     * should await whenIdle() once, then trigger one more render.
     */
    private _pendingWrite: Promise<void> = Promise.resolve()

    constructor (props: TerminalProps, children?: Element[]) {
        super('terminal', props, children)
        this._maxVisibleRows = Math.max(1, props.maxVisibleRows ?? DEFAULT_MAX_VISIBLE_ROWS)
        this._term = new Terminal({
            cols: this._cols,
            rows: this._rows,
            scrollback: props.scrollback ?? 5000,
            allowProposedApi: true,
            // Subprocess stdout here is a plain pipe, not a PTY, so child
            // processes emit bare '\n' per Unix convention — there's no
            // kernel tty layer to translate it to '\r\n' the way a real
            // terminal's PTY would. Without this, xterm treats bare '\n' per
            // strict VT100 semantics (cursor down, same column), staircasing
            // every line instead of returning to column 0.
            convertEol: true,
        })
    }

    private _ensureFed (): void {
        const text = this.props.text ?? ''
        if (text.length === this._lastTextLength) return

        if (text.length < this._lastTextLength || !text.startsWith(this._priorText)) {
            // props.text was replaced wholesale rather than appended-to —
            // xterm's parser must see the full stream from a clean state.
            this._term.reset()
            this._pendingWrite = new Promise((resolve) => this._term.write(text, resolve))
        } else {
            this._pendingWrite = new Promise((resolve) => this._term.write(text.slice(this._lastTextLength), resolve))
        }
        this._lastTextLength = text.length
        this._priorText = text
        // New output snaps the view back to live, like `tail -f` — otherwise
        // a user who scrolled up to review history would get stuck mid-scroll
        // forever once more output arrives, with no way back to the tail
        // short of wheeling all the way down manually.
        this._scrollOffset = 0
    }

    /** Resolves once every write fed so far has actually parsed into the buffer. */
    whenIdle (): Promise<void> {
        return this._pendingWrite
    }

    private _toFiniteSize (value: number, fallback: number): number {
        return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback
    }

    /** Resize only tracks container width (for line-wrapping); the internal
     * viewport row count stays fixed at VIEWPORT_ROWS regardless of layout. */
    private _ensureSized (cols: number): void {
        cols = this._toFiniteSize(cols, this._cols)
        if (cols === this._cols) return
        this._cols = cols
        this._term.resize(cols, this._rows)
    }

    /** Real content height in rows, spanning xterm's full buffer (scrollback
     * included, not just the live VIEWPORT_ROWS window) so the layout engine
     * sees — and its parent container can scroll through — the entire
     * history, the same way RawAnsiElement reports its full wrapped line
     * count rather than a fixed viewport slice. Trailing blank rows aren't
     * counted, so the element reports only as tall as its actual output. */
    private _contentHeight (): number {
        const active = this._term.buffer.active
        for (let row = active.length - 1; row >= 0; row--) {
            const line = active.getLine(row)
            if (line && line.translateToString(true).length > 0) return row + 1
        }
        return 1
    }

    intrinsicSize (context: IntrinsicSizeContext): { width: number; height: number } {
        this._ensureFed()
        const width = this._toFiniteSize(context.availableSpace.width, this._cols || 80)
        this._ensureSized(width)
        return { width, height: Math.min(this._contentHeight(), this._maxVisibleRows) }
    }

    render (bounds: Bounds, style: Partial<Cell>, buffer: DualBuffer): void {
        if (bounds.width <= 0 || bounds.height <= 0) return
        this._ensureFed()
        this._ensureSized(bounds.width)

        const active = this._term.buffer.active
        const reusableCell = active.getNullCell()

        const contentHeight = this._contentHeight()
        const maxScrollOffset = Math.max(0, contentHeight - bounds.height)
        // Clamp in case content shrank or the viewport resized since the
        // last wheel scroll.
        this._scrollOffset = Math.min(this._scrollOffset, maxScrollOffset)
        this._lastViewportHeight = bounds.height

        const startRow = Math.max(0, contentHeight - bounds.height - this._scrollOffset)
        this._lastRenderStartRow = startRow
        const rowsToDraw = Math.min(bounds.height, contentHeight - startRow)

        for (let row = 0; row < rowsToDraw; row++) {
            // Absolute buffer index within the current scroll window — see
            // _scrollOffset/startRow above.
            const line = active.getLine(startRow + row)
            if (!line) continue
            for (let col = 0; col < bounds.width; col++) {
                const c = line.getCell(col, reusableCell)
                if (!c || c.getWidth() === 0) continue // trailing half of a wide char

                const cell: Cell = {
                    char: c.getChars() || ' ',
                    foreground: mapColor(c.isFgRGB(), c.isFgPalette(), c.isFgDefault(), c.getFgColor()) ?? style.foreground,
                    background: mapColor(c.isBgRGB(), c.isBgPalette(), c.isBgDefault(), c.getBgColor()) ?? style.background,
                    bold: c.isBold() !== 0 || undefined,
                    dim: c.isDim() !== 0 || undefined,
                    italic: c.isItalic() !== 0 || undefined,
                    underline: c.isUnderline() !== 0 || undefined,
                    reverse: c.isInverse() !== 0 || undefined,
                    width: (c.getWidth() as 1 | 2) || 1,
                }
                buffer.currentBuffer.setCell(bounds.x + col, bounds.y + row, cell)
            }
        }
    }

    /** Marks this element as text-selectable so drag-select uses component-scoped
     * selection (which calls getSelectableText below) instead of falling back to
     * Melker's global rectangular buffer selection, which has no wrap awareness. */
    isTextSelectable (): boolean {
        return true
    }

    /**
     * Returns the underlying source text for the selected region, joining
     * xterm-soft-wrapped rows back together (no separator) and only
     * inserting '\n' at real line breaks. selectionBounds' y is element-
     * relative to what's actually on screen (RenderingEngine subtracts the
     * component's own bounds before calling this), and since render() draws
     * a scrolled window rather than always the top of history, row 0 here
     * means "first visible row of the current scroll position" — every
     * absolute buffer row is offset by _lastRenderStartRow to match.
     */
    getSelectableText (selectionBounds?: SelectionBounds): string {
        const active = this._term.buffer.active
        const startRow = this._lastRenderStartRow
        const totalRows = Math.min(this._contentHeight() - startRow, this._lastViewportHeight || Infinity)

        const joinedLine = (y: number, startCol: number, endCol: number): string => {
            const line = active.getLine(startRow + y)
            return line ? line.translateToString(false, Math.max(0, startCol), endCol + 1) : ''
        }

        const isNextWrapped = (y: number): boolean => {
            const nextLine = active.getLine(startRow + y + 1)
            return !!nextLine && nextLine.isWrapped
        }

        if (!selectionBounds || selectionBounds.startY === undefined || selectionBounds.endY === undefined) {
            let result = ''
            for (let row = 0; row < totalRows; row++) {
                const line = active.getLine(startRow + row)
                result += line ? line.translateToString(true) : ''
                if (row < totalRows - 1 && !isNextWrapped(row)) result += '\n'
            }
            return result
        }

        const { startX, endX, startY, endY } = selectionBounds
        const firstY = Math.min(startY, endY)
        const lastY = Math.max(startY, endY)
        const isSingleRow = firstY === lastY

        let result = ''
        for (let y = firstY; y <= lastY && y < totalRows; y++) {
            const line = active.getLine(startRow + y)
            const lineLength = line ? line.translateToString(true).length : 0
            let lineStartX: number
            let lineEndX: number

            if (isSingleRow) {
                lineStartX = Math.min(startX, endX)
                lineEndX = Math.max(startX, endX)
            } else if (y === firstY) {
                lineStartX = startY <= endY ? startX : endX
                lineEndX = lineLength - 1
            } else if (y === lastY) {
                lineStartX = 0
                lineEndX = startY <= endY ? endX : startX
            } else {
                lineStartX = 0
                lineEndX = lineLength - 1
            }

            result += joinedLine(y, lineStartX, lineEndX)

            if (y < lastY && !isNextWrapped(y)) {
                result += '\n'
            }
        }
        return result
    }

    /** Lets mouse wheel scroll this element directly (see handleWheel), instead
     * of falling through to the ancestor scrollable container's own wheel
     * handling — melker dispatches wheel events to a Wheelable hit-test target
     * before any ancestor gets a chance. */
    canHandleWheel (_x: number, _y: number): boolean {
        return true
    }

    handleWheel (_deltaX: number, deltaY: number): boolean {
        const contentHeight = this._contentHeight()
        const maxScrollOffset = Math.max(0, contentHeight - this._lastViewportHeight)
        // deltaY > 0 is "scroll down" (DOM wheel convention) — that moves
        // back toward the tail, i.e. decreases _scrollOffset; scrolling up
        // increases it, moving further into history.
        const newOffset = Math.max(0, Math.min(maxScrollOffset, this._scrollOffset - deltaY))
        if (newOffset === this._scrollOffset) return false
        this._scrollOffset = newOffset
        return true
    }
}

export function installTerminalComponent (): void {
    registerComponent({
        type: 'terminal',
        componentClass: TerminalElement,
    })
}
