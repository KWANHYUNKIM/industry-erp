/**
 * 본문 편집기의 표 조작 — 칸 합치기 · 나누기 · 줄/칸 넣기 · 지우기 · 테두리.
 *
 * <p>HTML 표는 rowspan · colspan 때문에 "줄의 n 번째 td" 가 "n 번째 열" 이 아니다. 그래서 먼저 표를
 * 격자(행 × 열, 칸마다 그 자리를 차지한 td)로 펼쳐 놓고({@link buildGrid}) 모든 조작을 격자 좌표로 한다.
 * 펼치는 일은 td 모양({@link SpanCell})만 보므로 DOM 없이 시험한다(tableGrid.test.ts).
 */

export interface SpanCell { rowSpan: number; colSpan: number }

/** 칸이 격자에서 차지하는 자리 — 맨 위 줄 · 맨 왼쪽 열과 크기. */
export interface CellPos<T> { cell: T; row: number; col: number; rowSpan: number; colSpan: number }

export interface Rect { r0: number; c0: number; r1: number; c1: number }

/** 줄마다 칸 목록 → 격자. grid[r][c] 는 그 자리를 덮은 칸(빈 자리는 null). */
export function buildGrid<T extends SpanCell>(rows: readonly (readonly T[])[]): { grid: (T | null)[][]; pos: Map<T, CellPos<T>> } {
  const grid: (T | null)[][] = rows.map(() => [])
  const pos = new Map<T, CellPos<T>>()
  rows.forEach((cells, r) => {
    let c = 0
    for (const cell of cells) {
      while (grid[r][c]) c += 1
      const rs = Math.max(1, Math.min(cell.rowSpan || 1, rows.length - r))
      const cs = Math.max(1, cell.colSpan || 1)
      pos.set(cell, { cell, row: r, col: c, rowSpan: rs, colSpan: cs })
      for (let i = 0; i < rs; i += 1) for (let j = 0; j < cs; j += 1) grid[r + i][c + j] = cell
      c += cs
    }
  })
  const width = Math.max(0, ...grid.map((g) => g.length))
  for (const g of grid) for (let c = 0; c < width; c += 1) if (!g[c]) g[c] = null
  return { grid, pos }
}

/**
 * 고른 칸들을 다 덮는 직사각형. 걸친 칸(rowspan · colspan)이 밖으로 삐져나가면 그 칸까지 넓힌다 —
 * 엑셀처럼 합친 칸 반쪽만 고를 수는 없다.
 */
export function coverRect<T extends SpanCell>(g: { grid: (T | null)[][]; pos: Map<T, CellPos<T>> }, cells: readonly T[]): Rect | null {
  const ps = cells.map((c) => g.pos.get(c)).filter((p): p is CellPos<T> => !!p)
  if (ps.length === 0) return null
  const rect: Rect = {
    r0: Math.min(...ps.map((p) => p.row)), c0: Math.min(...ps.map((p) => p.col)),
    r1: Math.max(...ps.map((p) => p.row + p.rowSpan - 1)), c1: Math.max(...ps.map((p) => p.col + p.colSpan - 1)),
  }
  for (let grew = true; grew;) {
    grew = false
    for (let r = rect.r0; r <= rect.r1; r += 1) {
      for (let c = rect.c0; c <= rect.c1; c += 1) {
        const cell = g.grid[r]?.[c]
        const p = cell ? g.pos.get(cell) : undefined
        if (!p) continue
        if (p.row < rect.r0) { rect.r0 = p.row; grew = true }
        if (p.col < rect.c0) { rect.c0 = p.col; grew = true }
        if (p.row + p.rowSpan - 1 > rect.r1) { rect.r1 = p.row + p.rowSpan - 1; grew = true }
        if (p.col + p.colSpan - 1 > rect.c1) { rect.c1 = p.col + p.colSpan - 1; grew = true }
      }
    }
  }
  return rect
}

/** 직사각형 안의 칸들(한 번씩, 위 → 아래 · 왼 → 오 차례). */
export function cellsIn<T extends SpanCell>(g: { grid: (T | null)[][] }, rect: Rect): T[] {
  const out: T[] = []
  for (let r = rect.r0; r <= rect.r1; r += 1) {
    for (let c = rect.c0; c <= rect.c1; c += 1) {
      const cell = g.grid[r]?.[c]
      if (cell && !out.includes(cell)) out.push(cell)
    }
  }
  return out
}

// ───────────────────────── DOM ─────────────────────────

type Cell = HTMLTableCellElement

function rowsOf(table: HTMLTableElement): HTMLTableRowElement[] {
  return [...table.rows].filter((r) => r.closest('table') === table)
}

export function gridOf(table: HTMLTableElement) {
  return buildGrid<Cell>(rowsOf(table).map((r) => [...r.cells]))
}

/** 새 칸 — 기준 칸의 서식(style · 정렬)을 물려받고 내용은 비운다. */
function blankLike(ref: Cell | null, doc: Document): Cell {
  const td = doc.createElement(ref?.tagName === 'TH' ? 'th' : 'td') as Cell
  if (ref) {
    for (const a of [...ref.attributes]) {
      const n = a.name.toLowerCase()
      if (n !== 'rowspan' && n !== 'colspan' && n !== 'id' && n !== 'class') td.setAttribute(a.name, a.value)
    }
  }
  td.innerHTML = '&nbsp;'
  return td
}

/** row 줄에 '그 줄에서 시작하는' 칸 중 col 열보다 오른쪽에 있는 첫 칸 앞에 끼운다. */
function insertAtCol(tr: HTMLTableRowElement, td: Cell, col: number, pos: Map<Cell, CellPos<Cell>>) {
  const after = [...tr.cells].find((x) => pos.has(x) && pos.get(x)!.col >= col)
  tr.insertBefore(td, after ?? null)
}

const isBlank = (td: Cell) => td.textContent?.replace(/ /g, ' ').trim() === '' && !td.querySelector('img,table,hr')

/** 합치기 — 맨 왼쪽 위 칸이 넓어지고, 나머지 칸의 내용은 그 뒤에 붙는다. */
export function mergeCells(table: HTMLTableElement, cells: Cell[]): Cell | null {
  const g = gridOf(table)
  const rect = coverRect(g, cells)
  if (!rect) return null
  const all = cellsIn(g, rect)
  if (all.length < 2) return all[0] ?? null
  const keep = g.grid[rect.r0][rect.c0]!
  for (const td of all) {
    if (td === keep) continue
    if (!isBlank(td)) {
      if (isBlank(keep)) keep.innerHTML = ''
      else keep.appendChild(table.ownerDocument.createElement('br'))
      while (td.firstChild) keep.appendChild(td.firstChild)
    }
    td.remove()
  }
  keep.rowSpan = rect.r1 - rect.r0 + 1
  keep.colSpan = rect.c1 - rect.c0 + 1
  if (keep.rowSpan === 1) keep.removeAttribute('rowspan')
  if (keep.colSpan === 1) keep.removeAttribute('colspan')
  return keep
}

/** 나누기 — 합친 칸을 1×1 칸들로 되돌린다(내용은 맨 왼쪽 위 칸에 남는다). */
export function splitCell(table: HTMLTableElement, cell: Cell): void {
  const g = gridOf(table)
  const p = g.pos.get(cell)
  if (!p || (p.rowSpan === 1 && p.colSpan === 1)) return
  const rows = rowsOf(table)
  cell.removeAttribute('rowspan')
  cell.removeAttribute('colspan')
  let anchor: Element = cell
  for (let r = p.row; r < p.row + p.rowSpan; r += 1) {
    for (let c = p.col; c < p.col + p.colSpan; c += 1) {
      if (r === p.row && c === p.col) continue
      const td = blankLike(cell, table.ownerDocument)
      td.removeAttribute('width')
      td.style.removeProperty('width')
      if (r === p.row) { anchor.after(td); anchor = td }
      else insertAtCol(rows[r], td, c, g.pos)
    }
  }
}

/** 줄 넣기 — 기준 칸의 위(before) 또는 아래(after). 걸쳐 있는 세로 합친 칸은 넓힌다. */
export function insertRow(table: HTMLTableElement, cell: Cell, where: 'above' | 'below'): void {
  const g = gridOf(table)
  const p = g.pos.get(cell)
  if (!p) return
  const rows = rowsOf(table)
  const at = where === 'above' ? p.row : p.row + p.rowSpan          // 새 줄이 들어갈 줄 번호
  const ref = where === 'above' ? p.row : p.row + p.rowSpan - 1     // 모양을 물려줄 줄
  const tr = table.ownerDocument.createElement('tr')
  const seen = new Set<Cell>()
  for (const x of g.grid[ref]) {
    if (!x || seen.has(x)) continue
    seen.add(x)
    const q = g.pos.get(x)!
    if (q.row < at && q.row + q.rowSpan > at) { x.rowSpan = q.rowSpan + 1; continue }
    const td = blankLike(x, table.ownerDocument)
    if (q.colSpan > 1) td.colSpan = q.colSpan
    tr.appendChild(td)
  }
  const before = rows[at] ?? null
  const parent = (before ?? rows[rows.length - 1]).parentElement!
  parent.insertBefore(tr, before && before.parentElement === parent ? before : null)
}

/** 칸 넣기 — 기준 칸의 왼쪽 또는 오른쪽에 열 하나. */
export function insertCol(table: HTMLTableElement, cell: Cell, where: 'left' | 'right'): void {
  const g = gridOf(table)
  const p = g.pos.get(cell)
  if (!p) return
  const rows = rowsOf(table)
  const at = where === 'left' ? p.col : p.col + p.colSpan
  const ref = where === 'left' ? p.col : p.col + p.colSpan - 1
  const seen = new Set<Cell>()
  g.grid.forEach((line, r) => {
    const x = line[ref]
    if (!x || seen.has(x)) return
    seen.add(x)
    const q = g.pos.get(x)!
    if (q.col < at && q.col + q.colSpan > at) { x.colSpan = q.colSpan + 1; return }
    if (q.row !== r) return
    const td = blankLike(x, table.ownerDocument)
    td.removeAttribute('width')
    td.style.removeProperty('width')
    if (q.rowSpan > 1) td.rowSpan = q.rowSpan
    insertAtCol(rows[r], td, at, g.pos)
  })
}

/** 줄 지우기 — 고른 칸들이 걸친 줄 전부. 위에서 걸쳐 내려온 칸은 줄이고, 아래로 걸친 칸은 다음 줄로 옮긴다. */
export function deleteRows(table: HTMLTableElement, cells: Cell[]): void {
  const g = gridOf(table)
  const rect = coverRect(g, cells)
  if (!rect) return
  const rows = rowsOf(table)
  if (rect.r0 === 0 && rect.r1 >= rows.length - 1) { table.remove(); return }
  const moves: { td: Cell; col: number }[] = []
  for (const [td, q] of g.pos) {
    const last = q.row + q.rowSpan - 1
    const overlap = Math.max(0, Math.min(last, rect.r1) - Math.max(q.row, rect.r0) + 1)
    if (overlap === 0 || overlap === q.rowSpan) continue
    td.rowSpan = q.rowSpan - overlap
    if (q.row >= rect.r0) moves.push({ td, col: q.col })
  }
  const next = rows[rect.r1 + 1]
  for (const m of moves.sort((a, b) => a.col - b.col)) insertAtCol(next, m.td, m.col, g.pos)
  for (let r = rect.r0; r <= rect.r1; r += 1) rows[r].remove()
}

/** 칸(열) 지우기 — 고른 칸들이 걸친 열 전부. */
export function deleteCols(table: HTMLTableElement, cells: Cell[]): void {
  const g = gridOf(table)
  const rect = coverRect(g, cells)
  if (!rect) return
  const width = g.grid[0]?.length ?? 0
  if (rect.c0 === 0 && rect.c1 >= width - 1) { table.remove(); return }
  for (const [td, q] of g.pos) {
    const last = q.col + q.colSpan - 1
    const overlap = Math.max(0, Math.min(last, rect.c1) - Math.max(q.col, rect.c0) + 1)
    if (overlap === 0) continue
    if (overlap >= q.colSpan) td.remove()
    else td.colSpan = q.colSpan - overlap
  }
}

export type BorderKind = 'all' | 'outer' | 'inner' | 'top' | 'bottom' | 'left' | 'right' | 'none'

/** 테두리 — 고른 직사각형 기준으로 바깥 · 안쪽 · 한쪽 선을 긋거나 지운다. */
export function applyBorder(table: HTMLTableElement, cells: Cell[], kind: BorderKind, line: string): void {
  const g = gridOf(table)
  const rect = coverRect(g, cells)
  if (!rect) return
  const off = 'none'
  for (const td of cellsIn(g, rect)) {
    const q = g.pos.get(td)!
    const top = q.row === rect.r0, left = q.col === rect.c0
    const bottom = q.row + q.rowSpan - 1 === rect.r1, right = q.col + q.colSpan - 1 === rect.c1
    const set = (side: 'Top' | 'Bottom' | 'Left' | 'Right', v: string | null) => {
      if (v !== null) td.style[`border${side}`] = v
    }
    switch (kind) {
      case 'all': set('Top', line); set('Bottom', line); set('Left', line); set('Right', line); break
      case 'none': set('Top', off); set('Bottom', off); set('Left', off); set('Right', off); break
      case 'outer':
        set('Top', top ? line : null); set('Bottom', bottom ? line : null)
        set('Left', left ? line : null); set('Right', right ? line : null); break
      case 'inner':
        set('Top', top ? null : line); set('Bottom', bottom ? null : line)
        set('Left', left ? null : line); set('Right', right ? null : line); break
      case 'top': if (top) set('Top', line); break
      case 'bottom': if (bottom) set('Bottom', line); break
      case 'left': if (left) set('Left', line); break
      case 'right': if (right) set('Right', line); break
    }
  }
}

/** 새 표 HTML — 원본처럼 검은 1px 선 · 본문 폭(700)에 맞춘다. */
export function newTableHtml(rows: number, cols: number): string {
  const tr = `<tr>${'<td>&nbsp;</td>'.repeat(cols)}</tr>`
  return `<table class="no-ec" border="1" style="border-collapse:collapse;width:100%"><tbody>${tr.repeat(rows)}</tbody></table><p><br></p>`
}
