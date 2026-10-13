import { useState } from 'react'
import Modal from './Modal'
import { useShortcut } from '../utils/useShortcut'

/** 정렬/소계기준 한 줄 — key 가 '' 이면 '없음'. */
export interface SortLine { key: string; desc: boolean; subtotal: boolean }
export interface SortSubtotal { lines: SortLine[]; total: boolean }

export const emptySortSubtotal = (first = ''): SortSubtotal => ({
  lines: [{ key: first, desc: false, subtotal: false }, { key: '', desc: false, subtotal: false }, { key: '', desc: false, subtotal: false }],
  total: false,
})

/**
 * 원본 현황 화면 조건 판의 [정렬/소계기준 설정] 이 여는 '정렬/소계/합계 설정' 창(설문조사현황 E070258, 2026-10-13 실측).
 * ⊙기본설정 [올림][내림][선택삭제], 격자 순서 1~3 · 정렬/소계기준(없음 + 화면 기준들) · 정렬방법(↓↑ 단추) ·
 * 소계/합계라인(◯표시 ◉표시안함 — 기준이 없음이면 막힘) · 상세설정, 아래 '합계영역' 줄. ⊙소계/합계 표시항목, [적용(F8)▲ 적용/저장][닫기].
 * 소계 · 합계를 표시로 바꾸면 그 줄 상세설정에 '설정' 이 붙는다 — 그 창은 재지 못해 두지 않았다.
 */
export default function EcSortSubtotalModal({ keys, value, onApply, onSave, onClose }: {
  keys: string[]
  value: SortSubtotal
  onApply: (v: SortSubtotal) => void
  /** [적용(F8)▲] › 적용/저장 — 다음에 열 때도 그 기준으로. */
  onSave?: (v: SortSubtotal) => void
  onClose: () => void
}) {
  const [v, setV] = useState<SortSubtotal>(value)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [menu, setMenu] = useState(false)
  const setLine = (i: number, patch: Partial<SortLine>) =>
    setV((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch, ...(patch.key === '' ? { subtotal: false } : {}) } : l)) }))
  const move = (dir: -1 | 1) => {
    const [i] = [...checked]
    if (checked.size !== 1 || i + dir < 0 || i + dir >= v.lines.length) return
    const lines = [...v.lines];
    [lines[i], lines[i + dir]] = [lines[i + dir], lines[i]]
    setV({ ...v, lines })
    setChecked(new Set([i + dir]))
  }
  const removeChecked = () => {
    setV({ ...v, lines: v.lines.map((l, i) => (checked.has(i) ? { key: '', desc: false, subtotal: false } : l)) })
    setChecked(new Set())
  }
  useShortcut('F8', () => onApply(v))

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

  return (
    <Modal open title="정렬/소계/합계 설정" width={780} onClose={onClose}>
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
            <th className="w-[80px] text-center">정렬방법</th><th className="w-[170px] text-center">소계/합계라인</th><th className="w-[80px] text-center">상세설정</th></tr>
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
              <td className="text-center">{radio(`subtotal-${i}`, l.subtotal, !l.key, (on) => setLine(i, { subtotal: on }))}</td>
              <td className="text-center">{l.subtotal ? <span className="text-ec-navy">설정</span> : ''}</td>
            </tr>
          ))}
          <tr className="bg-ec-page">
            <td colSpan={4} className="text-center">합계영역</td>
            <td className="text-center">{radio('total', v.total, false, (on) => setV({ ...v, total: on }))}</td>
            <td className="text-center">{v.total ? <span className="text-ec-navy">설정</span> : ''}</td>
          </tr>
        </tbody>
      </table>
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
