import { useState } from 'react'
import Modal from './Modal'
import { useShortcut } from '../utils/useShortcut'
import EcSubtotalDetailModal from './EcSubtotalDetailModal'

/** 정렬/소계기준 한 줄 — key 가 '' 이면 '없음'. */
export interface SortLine { key: string; desc: boolean; subtotal: boolean; /** 페이지분할 — 인쇄에서 그 기준이 바뀔 때 쪽을 넘긴다. */ pageBreak?: boolean }
/**
 * ⊙소계/합계 표시항목 — 숫자 열마다 소계 · 합계 줄에 값을 찍을지. custom 이 false(기본설정)면 전부 찍는다.
 * 외근현황 E070255 실측(2026-10-13): ◯기본설정 ◉직접설정, 격자 [열…] × [소계][합계] 체크(기본설정이면 전부 체크된 채 막힘).
 */
export interface SubtotalItems { custom: boolean; sub: Record<string, boolean>; total: Record<string, boolean> }
/**
 * [상세설정] '설정' 창 값 — 소계상세설정(줄마다: 소계표시명 · 일자 월/일 · 상위 소계명 포함 · 건수) · 합계상세설정(합계표시명).
 * 외근현황 E070255 실측(2026-10-13). details[i] 는 lines[i] 의 것.
 */
export interface SubtotalDetail { name?: string; byDay?: boolean; withParent?: boolean; count?: boolean }
export interface SortSubtotal { lines: SortLine[]; total: boolean; items?: SubtotalItems; details?: SubtotalDetail[]; totalName?: string }

/** 이 열을 소계(kind='sub') · 합계(kind='total') 줄에 찍나. */
export const showsItem = (v: SortSubtotal, kind: 'sub' | 'total', col: string) =>
  !v.items || !v.items.custom || v.items[kind][col] !== false

export const emptySortSubtotal = (first = ''): SortSubtotal => ({
  lines: [{ key: first, desc: false, subtotal: false }, { key: '', desc: false, subtotal: false }, { key: '', desc: false, subtotal: false }],
  total: false,
})

/**
 * 원본 현황 화면 조건 판의 [정렬/소계기준 설정] 이 여는 '정렬/소계/합계 설정' 창(설문조사현황 E070258, 2026-10-13 실측).
 * ⊙기본설정 [올림][내림][선택삭제], 격자 순서 1~3 · 정렬/소계기준(없음 + 화면 기준들) · 정렬방법(↓↑ 단추) ·
 * 소계/합계라인(◯표시 ◉표시안함 — 기준이 없음이면 막힘) · 상세설정, 아래 '합계영역' 줄. ⊙소계/합계 표시항목, [적용(F8)▲ 적용/저장][닫기].
 * 소계 · 합계를 표시로 바꾸면 그 줄 상세설정에 '설정' 이 붙고, 누르면 소계상세설정 · 합계상세설정 창(EcSubtotalDetailModal)이 뜬다.
 */
export default function EcSortSubtotalModal({ keys, itemCols, pageSplit, totalLocked, width = 780, value, onApply, onSave, onClose }: {
  keys: string[]
  /**
   * [페이지분할] 열을 그린다(기준이 없음이면 막힘). 원가 화면(표준원가현황 E040808 · 실제원가현황 E040804, 2026-10-13 실측)에 있다.
   */
  pageSplit?: boolean
  /**
   * 합계영역을 ◉표시 로 막는다 — 실제원가현황 원가집계표는 맨 아래 '누계' 가 늘 서서 원본도 막혀 있고(상세설정 없음),
   * 표시항목 판에도 [소계] 줄만 있다.
   */
  totalLocked?: boolean
  /** 창 폭 — 표시항목 열이 열둘인 실제원가현황은 원본 창이 1,067 이다. */
  width?: number
  /** 주면 아래 '⊙ 소계/합계 표시항목' 판을 그린다(숫자 열 이름). */
  itemCols?: string[]
  value: SortSubtotal
  onApply: (v: SortSubtotal) => void
  /** [적용(F8)▲] › 적용/저장 — 다음에 열 때도 그 기준으로. */
  onSave?: (v: SortSubtotal) => void
  onClose: () => void
}) {
  const [v, setV] = useState<SortSubtotal>(value)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [menu, setMenu] = useState(false)
  /** 열린 상세설정 창 — 줄 번호, 합계영역은 -1. */
  const [detail, setDetail] = useState<number | null>(null)
  const setLine = (i: number, patch: Partial<SortLine>) =>
    setV((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch, ...(patch.key === '' ? { subtotal: false, pageBreak: false } : {}) } : l)) }))
  const move = (dir: -1 | 1) => {
    const [i] = [...checked]
    if (checked.size !== 1 || i + dir < 0 || i + dir >= v.lines.length) return
    const lines = [...v.lines];
    [lines[i], lines[i + dir]] = [lines[i + dir], lines[i]]
    const details = [...(v.details ?? [])];
    [details[i], details[i + dir]] = [details[i + dir], details[i]]
    setV({ ...v, lines, details })
    setChecked(new Set([i + dir]))
  }
  const removeChecked = () => {
    setV({ ...v, lines: v.lines.map((l, i) => (checked.has(i) ? { key: '', desc: false, subtotal: false, pageBreak: false } : l)) })
    setChecked(new Set())
  }
  useShortcut('F8', () => onApply(v), detail === null)

  const radio = (name: string, on: boolean, disabled: boolean, set: (on: boolean) => void) => (
    <span className="inline-flex gap-[10px]">
      <label className="inline-flex items-center gap-[3px] cursor-pointer">
        <input type="radio" name={name} disabled={disabled} checked={on} onChange={() => set(true)} />표시
      </label>
      <label className="inline-flex items-center gap-[3px] cursor-pointer">
        <input type="radio" name={name} disabled={disabled} checked={!on} onChange={() => set(false)} />표시안함
      </label>
    </span>
  )
  const detailBtn = (i: number) => (
    <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy" aria-label={i < 0 ? '합계영역 상세설정' : `상세설정 ${i + 1}`}
            onClick={() => setDetail(i)}>설정</button>
  )
  /** 이 줄 위에 소계를 켠 줄이 있나 — 없으면 '상위 소계명 포함여부' 가 막힌다. */
  const hasParent = (i: number) => v.lines.slice(0, i).some((l) => l.key && l.subtotal)

  return (
    <Modal open title="정렬/소계/합계 설정" width={width} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[10px]">정렬/소계/합계 설정</div>
      <div className="text-[12px] mb-[6px]">⊙ 기본설정</div>
      <div className="flex gap-[4px] mb-[6px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => move(-1)}>올림</button>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => move(1)}>내림</button>
        <button type="button" className="ec-btn ec-btn-sm" onClick={removeChecked}>선택삭제</button>
      </div>
      <table className="w-full" aria-label="정렬/소계기준">
        <thead>
          <tr><th className="w-[34px]" /><th className="w-[50px] text-center">순서</th><th className="text-center">정렬/소계기준</th>
            <th className="w-[80px] text-center">정렬방법</th>
            {pageSplit && <th className="w-[80px] text-center">페이지분할</th>}
            <th className="w-[170px] text-center">소계/합계라인</th><th className="w-[80px] text-center">상세설정</th></tr>
        </thead>
        <tbody>
          {v.lines.map((l, i) => (
            <tr key={i}>
              <td className={`text-center cursor-pointer select-none ${checked.has(i) ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'text-ec-hint'}`}
                  onClick={() => setChecked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })}>{i + 1}</td>
              <td className="text-center">{i + 1}</td>
              <td>
                <select className="ec-input w-full" aria-label={`정렬/소계기준 ${i + 1}`} value={l.key} onChange={(e) => setLine(i, { key: e.target.value })}>
                  <option value="">없음</option>
                  {keys.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </td>
              <td className="text-center">
                <button type="button" className="ec-btn ec-btn-sm disabled:opacity-45" disabled={!l.key} aria-label={`정렬방법 ${i + 1}`}
                        title={l.desc ? '내림차순' : '올림차순'} onClick={() => setLine(i, { desc: !l.desc })}>{l.desc ? '↑↓' : '↓↑'}</button>
              </td>
              {pageSplit && (
                <td className="text-center">
                  <input type="checkbox" aria-label={`페이지분할 ${i + 1}`} disabled={!l.key} checked={!!l.pageBreak}
                         onChange={(e) => setLine(i, { pageBreak: e.target.checked })} />
                </td>
              )}
              <td className="text-center">{radio(`subtotal-${i}`, l.subtotal, !l.key, (on) => setLine(i, { subtotal: on }))}</td>
              <td className="text-center">{l.subtotal ? detailBtn(i) : ''}</td>
            </tr>
          ))}
          <tr className="bg-ec-page">
            <td colSpan={pageSplit ? 5 : 4} className="text-center">합계영역</td>
            <td className="text-center">{radio('total', totalLocked || v.total, !!totalLocked, (on) => setV({ ...v, total: on }))}</td>
            <td className="text-center">{v.total && !totalLocked ? detailBtn(-1) : ''}</td>
          </tr>
        </tbody>
      </table>
      {itemCols && itemCols.length > 0 && (() => {
        const items: SubtotalItems = v.items ?? { custom: false, sub: {}, total: {} }
        const setItems = (patch: Partial<SubtotalItems>) => setV({ ...v, items: { ...items, ...patch } })
        const box = (kind: 'sub' | 'total', col: string) => (
          <input type="checkbox" aria-label={`${kind === 'sub' ? '소계' : '합계'} ${col}`} disabled={!items.custom}
                 checked={!items.custom || items[kind][col] !== false}
                 onChange={(e) => setItems({ [kind]: { ...items[kind], [col]: e.target.checked } })} />
        )
        return (
          <>
            <div className="text-[12px] mt-[14px] mb-[6px]">⊙ 소계/합계 표시항목</div>
            <div className="flex gap-[10px] mb-[6px] text-[12px]">
              <label className="inline-flex items-center gap-[3px] cursor-pointer">
                <input type="radio" name="items-mode" checked={!items.custom} onChange={() => setItems({ custom: false })} />기본설정
              </label>
              <label className="inline-flex items-center gap-[3px] cursor-pointer">
                <input type="radio" name="items-mode" checked={items.custom} onChange={() => setItems({ custom: true })} />직접설정
              </label>
            </div>
            <table className="w-full" aria-label="소계/합계 표시항목">
              <thead><tr><th />{itemCols.map((c) => <th key={c} className="text-center">{c}</th>)}</tr></thead>
              <tbody>
                <tr><td className="text-center">소계</td>{itemCols.map((c) => <td key={c} className="text-center">{box('sub', c)}</td>)}</tr>
                {!totalLocked && <tr><td className="text-center">합계</td>{itemCols.map((c) => <td key={c} className="text-center">{box('total', c)}</td>)}</tr>}
              </tbody>
            </table>
          </>
        )
      })()}
      <div className="flex gap-[6px] mt-[14px]">
        <span className="ec-btn-group relative">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply(v)}>적용(F8)</button>
          <button type="button" className="ec-btn ec-btn-primary ec-btn-arrow" aria-label="적용 더보기" onClick={() => setMenu((m) => !m)}>▴</button>
          {menu && (
            <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[110px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
              <button type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                      onClick={() => { setMenu(false); onSave?.(v); onApply(v) }}>적용/저장</button>
            </div>
          )}
        </span>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
      {detail !== null && (
        <EcSubtotalDetailModal kind={detail < 0 ? 'total' : 'sub'}
                               value={detail < 0 ? { name: v.totalName } : (v.details?.[detail] ?? {})}
                               isDate={detail >= 0 && /일자$/.test(v.lines[detail]?.key ?? '')}
                               parentLocked={detail >= 0 && !hasParent(detail)}
                               onApply={(d) => {
                                 if (detail < 0) setV({ ...v, totalName: d.name })
                                 else { const details = [...(v.details ?? [])]; details[detail] = d; setV({ ...v, details }) }
                                 setDetail(null)
                               }}
                               onClose={() => setDetail(null)} />
      )}
    </Modal>
  )
}

/** 정한 기준대로 줄을 세운다(빈 값은 늘 뒤). */
export function sortBySubtotal<T>(rows: T[], v: SortSubtotal, get: (row: T, key: string) => string | number | null | undefined): T[] {
  const active = v.lines.filter((l) => l.key)
  return [...rows].sort((a, b) => {
    for (const l of active) {
      const x = get(a, l.key) ?? '', y = get(b, l.key) ?? ''
      if (x === y) continue
      if (x === '') return 1
      if (y === '') return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')
      return l.desc ? -c : c
    }
    return 0
  })
}

/** 소계 줄을 낀 격자 줄 — 줄 그대로이거나, 그 기준 값의 '값 계' 줄. */
export type SubtotalOut<T> = { kind: 'row'; row: T } | { kind: 'sub'; label: string; list: T[]; key: string }

/**
 * 정렬하고 소계를 켠 기준마다, 그 기준까지의 값이 바뀌면 <b>안쪽 기준부터</b> '값 계' 줄을 끼운다
 * (외근현황 E070255 실측 — 1 사용자명 · 2 일자 둘 다 켜면 '2026/10 계' → '변종호 계').
 *
 * @param get 정렬에 쓰는 값
 * @param label 소계를 가르는 값이자 '… 계' 앞에 적는 이름(안 주면 get 의 값)
 */
export function withSubtotals<T>(rows: T[], v: SortSubtotal, get: (row: T, key: string) => string | number | null | undefined,
  label: (row: T, key: string) => string = (r, k) => String(get(r, k) ?? '')): SubtotalOut<T>[] {
  const lines = v.lines
  const ordered = sortBySubtotal(rows, v, get)
  const subs = lines.map((l, i) => ({ l, i })).filter((x) => x.l.key && x.l.subtotal)
  const prefix = (r: T, upto: number) => lines.slice(0, upto + 1).filter((l) => l.key).map((l) => label(r, l.key)).join('\u0001')
  const res: SubtotalOut<T>[] = []
  let acc = subs.map(() => ({ key: '', label: '', list: [] as T[] }))
  const close = (from: number) => {
    for (let j = subs.length - 1; j >= from; j--) {
      if (acc[j].list.length) res.push({ kind: 'sub', label: acc[j].label, list: acc[j].list, key: `${j}:${acc[j].key}` })
      acc[j] = { key: '', label: '', list: [] }
    }
  }
  for (const r of ordered) {
    const changed = subs.findIndex((x, j) => acc[j].list.length > 0 && prefix(r, x.i) !== acc[j].key)
    if (changed >= 0) close(changed)
    acc = acc.map((a, j) => (a.list.length ? a : { key: prefix(r, subs[j].i), label: label(r, subs[j].l.key), list: [] }))
    acc.forEach((a) => a.list.push(r))
    res.push({ kind: 'row', row: r })
  }
  close(0)
  return res
}
