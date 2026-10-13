import { useState } from 'react'
import Modal from '../../../components/Modal'
import { useShortcut } from '../../../utils/useShortcut'

export type RepeatScope = 'ONE' | 'FOLLOWING' | 'ALL'

/**
 * 원본 반복 일정의 [수정] · [삭제] 가 먼저 띄우는 창(E070201, 2026-10-13 실측) — 제목은 두 경우 모두 '반복일정삭제' 다.
 * 공용품관리(E070204)는 [수정] 이면 '반복일정수정' 이다(같은 날 실측) — title 로 바꾼다.
 * '기존에 등록된 반복일정을 수정할 대상 기간을 선택합니다.' ◉이번 일정만 ○향후 모든 일정 ○전체 반복일정, [적용(F8)][취소].
 */
export default function RepeatScopeModal({ onApply, onClose, title = '반복일정삭제' }: {
  onApply: (s: RepeatScope) => void; onClose: () => void; title?: string
}) {
  const [scope, setScope] = useState<RepeatScope>('ONE')
  useShortcut('F8', () => onApply(scope))
  return (
    <Modal open title={title} width={780} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[12px]">{title}</div>
      <div className="text-[12px] mb-[6px]">⊙ {title}</div>
      <p className="text-[12px] mt-0 mb-[6px] ml-[8px]">기존에 등록된 반복일정을 수정할 대상 기간을 선택합니다.</p>
      <div className="flex gap-[12px] ml-[8px] text-[12px]">
        {([['ONE', '이번 일정만'], ['FOLLOWING', '향후 모든 일정'], ['ALL', '전체 반복일정']] as const).map(([k, l]) => (
          <label key={k} className="inline-flex items-center gap-[4px] cursor-pointer">
            <input type="radio" name="repeatScope" checked={scope === k} onChange={() => setScope(k)} />{l}
          </label>
        ))}
      </div>
      <div className="flex gap-[6px] mt-[120px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply(scope)}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>취소</button>
      </div>
    </Modal>
  )
}
