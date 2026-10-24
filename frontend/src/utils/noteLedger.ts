/**
 * 받을어음거래내역 · 지급어음거래내역의 묶음과 잔액.
 *
 * <p>어음 한 장은 받은(발행한) 날 <b>증가</b>, 손을 떠난 날(만기결제 · 할인 · 부도) <b>감소</b>를 남긴다.
 * 잔액은 <b>기간 첫날 들고 있던 어음(이월잔액)</b>에서 시작해야 한다 — 기간 안 증감만 더하면, 기간 앞에 받아 기간 안에
 * 결제된 어음은 감소만 남아 잔액이 음수가 되고, 기간 내내 들고만 있던 어음은 아예 안 보인다.
 * 수령수표거래내역(원본 실측)이 같은 모양으로 '이월잔액' 줄을 둔다.
 */

export type NoteLedgerBasis = '거래처별' | '거래처/어음번호별'

export interface LedgerNote {
  noteNo: string
  partnerName: string
  issueDate: string
  closedDate: string | null
  amount: number
}

export interface NoteLedgerLine<N> { date: string; kind: '증가' | '감소'; note: N; inc: number; dec: number; bal: number }
export interface NoteLedgerGroup<N> { key: string; opening: number; lines: NoteLedgerLine<N>[]; inc: number; dec: number; bal: number }

/** 기간 첫날(from) 아침에 들고 있던 어음인가 — 그 전에 받았고, 아직 안 닫혔거나 첫날 이후에 닫혔다. */
export function heldAtStart(n: LedgerNote, from: string): boolean {
  return n.issueDate < from && (!n.closedDate || n.closedDate >= from)
}

export function noteLedgerGroups<N extends LedgerNote>(notes: N[], from: string, to: string, basis: NoteLedgerBasis): NoteLedgerGroup<N>[] {
  const keyOf = (n: N) => (basis === '거래처별' ? n.partnerName : `${n.partnerName} / ${n.noteNo}`)
  const by = new Map<string, { opening: number; moves: { date: string; kind: '증가' | '감소'; note: N }[] }>()
  const slot = (k: string) => {
    let g = by.get(k)
    if (!g) { g = { opening: 0, moves: [] }; by.set(k, g) }
    return g
  }
  for (const n of notes) {
    if (n.issueDate > to) continue
    const k = keyOf(n)
    if (heldAtStart(n, from)) slot(k).opening += Number(n.amount)
    if (n.issueDate >= from && n.issueDate <= to) slot(k).moves.push({ date: n.issueDate, kind: '증가', note: n })
    if (n.closedDate && n.closedDate >= from && n.closedDate <= to) slot(k).moves.push({ date: n.closedDate, kind: '감소', note: n })
  }
  return [...by.entries()]
    .filter(([, g]) => g.opening !== 0 || g.moves.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, g]) => {
      g.moves.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1
        : a.kind === b.kind ? a.note.noteNo.localeCompare(b.note.noteNo) : a.kind === '증가' ? -1 : 1))
      let bal = g.opening
      const lines = g.moves.map((m) => {
        const amt = Number(m.note.amount)
        const inc = m.kind === '증가' ? amt : 0
        const dec = m.kind === '감소' ? amt : 0
        bal += inc - dec
        return { ...m, inc, dec, bal }
      })
      return {
        key, opening: g.opening, lines,
        inc: lines.reduce((s, l) => s + l.inc, 0),
        dec: lines.reduce((s, l) => s + l.dec, 0),
        bal,
      }
    })
}
