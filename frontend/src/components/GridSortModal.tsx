import { useState } from 'react'
import Modal from './Modal'

/**
 * 입력 격자 [정렬](원본 근무입력 · 일용근로 근무입력, 2026-10-04 실측) — '정렬기준' 창.
 * 정렬기준 두 칸(처음 값은 화면이 준다 — 원본은 사원 · 수당항목) · 정렬방법 오름차순(처음) · 내림차순 · 적용 · 닫기.
 * 채운 줄만 다시 늘어놓고 빈 줄은 끝에 둔다.
 */
export default function GridSortModal<R, K extends string>({ open, keys, initial, rows, keyOf, isFilled, onApply, onClose, error }: {
  open: boolean
  keys: readonly K[]
  initial: [K, K]
  rows: R[]
  keyOf: (row: R, key: K) => string
  isFilled: (row: R) => boolean
  onApply: (sorted: R[]) => void
  onClose: () => void
  error?: string
}) {
  const [sortKeys, setSortKeys] = useState<[K, K]>(initial)
  const [desc, setDesc] = useState(false)

  function apply() {
    const filled = rows.filter(isFilled)
    const empty = rows.filter((r) => !isFilled(r))
    const sign = desc ? -1 : 1
    filled.sort((a, b) => sign * (keyOf(a, sortKeys[0]).localeCompare(keyOf(b, sortKeys[0]))
      || keyOf(a, sortKeys[1]).localeCompare(keyOf(b, sortKeys[1]))))
    onApply([...filled, ...empty])
  }

  return (
    <Modal error={error} open={open} title="정렬기준" width={560} onClose={onClose}>
      <ul className="ec-form">
        <li className="wide">
          <span className="title">정렬기준</span>
          <div className="form flex gap-[6px]">
            {[0, 1].map((i) => (
              <select key={i} className="ec-input w-[180px]" aria-label={`정렬기준${i + 1}`} value={sortKeys[i]}
                      onChange={(e) => setSortKeys((k) => (i === 0 ? [e.target.value as K, k[1]] : [k[0], e.target.value as K]))}>
                {keys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            ))}
          </div>
        </li>
        <li className="wide">
          <span className="title">정렬방법</span>
          <div className="form flex gap-[12px]">
            {([[false, '오름차순'], [true, '내림차순']] as const).map(([v, l]) => (
              <label key={l} className="inline-flex items-center gap-[4px]">
                <input type="radio" name="grid-sort-dir" checked={desc === v} onChange={() => setDesc(v)} /> {l}
              </label>
            ))}
          </div>
        </li>
      </ul>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
