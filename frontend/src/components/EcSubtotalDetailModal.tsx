import { useState } from 'react'
import Modal from './Modal'
import { useShortcut } from '../utils/useShortcut'
import type { SubtotalDetail } from './EcSortSubtotalModal'

/**
 * '정렬/소계/합계 설정' 창 [상세설정] 의 '설정' 이 여는 창(외근현황 E070255, 2026-10-13 실측).
 *
 * <ul>
 *   <li><b>소계상세설정</b>(소계를 켠 줄): 소계표시명 · 소계기준 ◉월 ◯일(기준이 일자일 때만) ·
 *       상위 소계명 포함여부 ◯포함 ◉포함안함(첫 소계 줄은 위가 없어 막힘) · 건 수 표시 ◯표시 ◉표시안함.</li>
 *   <li><b>합계상세설정</b>(합계영역): 합계표시명 하나.</li>
 * </ul>
 * 원본 출력물: 소계표시명 'QA소' + 건수 → 'K5[H] QA소 (2 건)', 일자 ◉일 → '2026/10/07 계',
 * 포함 → 'K5[H] / 2026/10/07 계', 합계표시명 'QA합' → 'QA합'. 이름은 {@link subtotalLabel} 이 만든다.
 */
export default function EcSubtotalDetailModal({ kind, value, isDate, parentLocked, onApply, onClose }: {
  kind: 'sub' | 'total'
  value: SubtotalDetail
  /** 기준이 일자 — [소계기준] 월 · 일 줄을 그린다. */
  isDate?: boolean
  /** 위에 소계 줄이 없다 — 상위 소계명 포함여부를 막는다. */
  parentLocked?: boolean
  onApply: (v: SubtotalDetail) => void
  onClose: () => void
}) {
  const [v, setV] = useState<SubtotalDetail>(value)
  useShortcut('F8', () => onApply(v))
  const title = kind === 'sub' ? '소계상세설정' : '합계상세설정'
  const pair = (name: string, a: string, b: string, on: boolean, set: (on: boolean) => void, disabled = false) => (
    <span className="inline-flex gap-[10px]">
      <label className="inline-flex items-center gap-[3px] cursor-pointer">
        <input type="radio" name={name} disabled={disabled} checked={on} onChange={() => set(true)} />{a}
      </label>
      <label className="inline-flex items-center gap-[3px] cursor-pointer">
        <input type="radio" name={name} disabled={disabled} checked={!on} onChange={() => set(false)} />{b}
      </label>
    </span>
  )
  return (
    <Modal open title={title} width={780} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[10px]">{title}</div>
      <ul className="ec-form">
        <li className="wide">
          <div className="title">{kind === 'sub' ? '소계표시명' : '합계표시명'}</div>
          <div className="form">
            <input className="ec-input flex-1" placeholder={kind === 'sub' ? '소계표시명' : '합계표시명'} value={v.name ?? ''}
                   onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
        </li>
        {kind === 'sub' && isDate && (
          <li className="wide">
            <div className="title">소계기준</div>
            <div className="form">{pair('detail-unit', '월', '일', !v.byDay, (on) => setV({ ...v, byDay: !on }))}</div>
          </li>
        )}
        {kind === 'sub' && (
          <>
            <li className="wide">
              <div className="title">상위 소계명 포함여부</div>
              <div className="form">{pair('detail-parent', '포함', '포함안함', !parentLocked && !!v.withParent, (on) => setV({ ...v, withParent: on }), parentLocked)}</div>
            </li>
            <li className="wide">
              <div className="title">건 수 표시</div>
              <div className="form">{pair('detail-count', '표시', '표시안함', !!v.count, (on) => setV({ ...v, count: on }))}</div>
            </li>
          </>
        )}
      </ul>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply(v)}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/**
 * 소계 줄 이름 — '값 계', 소계표시명이 있으면 '값 이름', 건수를 켜면 ' (n 건)', 상위 소계명을 포함하면 앞에 '위값 / '.
 *
 * @param parents 위쪽 소계 기준들의 값(바깥부터)
 */
export function subtotalLabel(value: string, d: SubtotalDetail | undefined, count: number, parents: string[] = []): string {
  const head = d?.withParent && parents.length ? `${parents.join(' / ')} / ` : ''
  return `${head}${value} ${d?.name?.trim() || '계'}${d?.count ? ` (${count} 건)` : ''}`
}
