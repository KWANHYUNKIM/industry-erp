import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { emptyLevel, type SortSetting } from './sortSubtotal'

/**
 * 창 '정렬/소계/합계 설정'(2026-10-22 loginaa 분개장 [정렬/소계기준 설정] 실측):
 * ⊙ 기본설정 — [올림] [내림] [선택삭제] · 표 ☐ · 순서 · 정렬/소계기준 · 정렬방법 · 페이지분할 · 소계/합계라인(◉표시 ○표시안함 —
 * 원본 처음 상태는 '표시안함' 쪽이고 기준을 고르기 전엔 잠김) · 상세설정, 끝줄 '합계영역 ◉표시 ○표시안함 설정'.
 * ⊙ 소계/합계 표시항목 — ◉기본설정 ○직접설정, 표 금액 칸 × 소계 · 합계 ☑(기본설정이면 잠김). 아래 [적용(F8)] [닫기].
 */
export default function SortSubtotalModal({ open, onClose, value, onApply, keys, amounts }: {
  open: boolean
  onClose: () => void
  value: SortSetting
  onApply: (s: SortSetting) => void
  /** 정렬/소계기준으로 고를 수 있는 열 [값, 이름] */
  keys: { value: string; name: string }[]
  /** 소계/합계 표시항목 금액 칸 [값, 이름] */
  amounts: { value: string; name: string }[]
}) {
  const [s, setS] = useState(value)
  const [checked, setChecked] = useState<boolean[]>([false, false, false])
  useEffect(() => { if (open) { setS(value); setChecked([false, false, false]) } }, [open, value])
  const setLevel = (i: number, p: Partial<SortSetting['levels'][number]>) =>
    setS((o) => ({ ...o, levels: o.levels.map((l, k) => (k === i ? { ...l, ...p } : l)) }))
  const move = (dir: -1 | 1) => {
    const i = checked.findIndex(Boolean)
    const j = i + dir
    if (i < 0 || j < 0 || j >= s.levels.length) return
    const levels = [...s.levels];
    [levels[i], levels[j]] = [levels[j], levels[i]]
    setS({ ...s, levels })
    setChecked(checked.map((_, k) => k === j))
  }
  const removeChecked = () => setS({
    ...s, levels: s.levels.map((l, k) => (checked[k] ? emptyLevel() : l)),
  })
  const apply = () => { onApply(s); onClose() }

  return (
    <Modal open={open} title="정렬/소계/합계 설정" width={800} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); apply() } }}>
        <h3 className="text-[14px] font-bold mb-[10px]">정렬/소계/합계 설정</h3>
        <p className="font-bold mb-[6px]">⊙ 기본설정</p>
        <div className="flex gap-[4px] mb-[6px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => move(-1)}>올림</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => move(1)}>내림</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={removeChecked}>선택삭제</button>
        </div>
        <table className="w-full mb-[12px]">
          <thead>
            <tr>
              <th className="w-[34px] text-center">
                <input type="checkbox" aria-label="전체 선택" checked={checked.every(Boolean)}
                       onChange={(e) => setChecked(checked.map(() => e.target.checked))} />
              </th>
              <th className="w-[44px] text-center">순서</th>
              <th className="text-center">정렬/소계기준</th>
              <th className="w-[70px] text-center">정렬방법</th>
              <th className="w-[70px] text-center">페이지분할</th>
              <th className="w-[160px] text-center">소계/합계라인</th>
              <th className="w-[70px] text-center">상세설정</th>
            </tr>
          </thead>
          <tbody>
            {s.levels.map((l, i) => (
              <tr key={i}>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${i + 1}순서 선택`} checked={checked[i]}
                         onChange={(e) => setChecked(checked.map((c, k) => (k === i ? e.target.checked : c)))} />
                </td>
                <td className="text-center">{i + 1}</td>
                <td>
                  <select className="ec-input w-full" aria-label={`${i + 1}순서 정렬/소계기준`} value={l.key}
                          onChange={(e) => setLevel(i, e.target.value ? { key: e.target.value } : emptyLevel())}>
                    <option value=""></option>
                    {keys.map((k) => <option key={k.value} value={k.value}>{k.name}</option>)}
                  </select>
                </td>
                <td className="text-center">
                  <button type="button" className="ec-btn ec-btn-sm" disabled={!l.key} aria-label={`${i + 1}순서 정렬방법`}
                          title={l.desc ? '내림차순' : '오름차순'} onClick={() => setLevel(i, { desc: !l.desc })}>{l.desc ? '↓' : '↑'}</button>
                </td>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${i + 1}순서 페이지분할`} disabled={!l.key} checked={l.pageBreak}
                         onChange={(e) => setLevel(i, { pageBreak: e.target.checked })} />
                </td>
                <td className="text-center">
                  <label className="mr-[8px]"><input type="radio" disabled={!l.key} checked={l.subtotal} onChange={() => setLevel(i, { subtotal: true })} /> 표시</label>
                  <label><input type="radio" disabled={!l.key} checked={!l.subtotal} onChange={() => setLevel(i, { subtotal: false })} /> 표시안함</label>
                </td>
                <td></td>
              </tr>
            ))}
            <tr className="bg-ec-page">
              <td colSpan={5} className="text-center">합계영역</td>
              <td className="text-center">
                <label className="mr-[8px]"><input type="radio" checked={s.total} onChange={() => setS({ ...s, total: true })} /> 표시</label>
                <label><input type="radio" checked={!s.total} onChange={() => setS({ ...s, total: false })} /> 표시안함</label>
              </td>
              <td className="text-center"><a className="text-ec-navy">설정</a></td>
            </tr>
          </tbody>
        </table>
        <p className="font-bold mb-[6px]">⊙ 소계/합계 표시항목</p>
        <div className="mb-[6px]">
          <label className="mr-[10px]"><input type="radio" checked={s.itemMode === 'default'} onChange={() => setS({ ...s, itemMode: 'default' })} /> 기본설정</label>
          <label><input type="radio" checked={s.itemMode === 'custom'} onChange={() => setS({ ...s, itemMode: 'custom' })} /> 직접설정</label>
        </div>
        <table className="w-full mb-[12px]">
          <thead>
            <tr><th className="w-[200px]"></th>{amounts.map((a) => <th key={a.value} className="text-center">{a.name}</th>)}</tr>
          </thead>
          <tbody>
            {(['sub', 'total'] as const).map((kind) => (
              <tr key={kind}>
                <td className="text-center font-bold">{kind === 'sub' ? '소계' : '합계'}</td>
                {amounts.map((a) => (
                  <td key={a.value} className="text-center">
                    <input type="checkbox" aria-label={`${kind === 'sub' ? '소계' : '합계'} ${a.name}`} disabled={s.itemMode === 'default'}
                           checked={s.itemMode === 'default' || !!s.items[a.value]?.[kind]}
                           onChange={(e) => setS({ ...s, items: { ...s.items, [a.value]: { ...(s.items[a.value] ?? { sub: true, total: true }), [kind]: e.target.checked } } })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}
