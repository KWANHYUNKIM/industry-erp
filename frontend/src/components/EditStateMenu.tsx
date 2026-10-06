import { useState } from 'react'

export type StateOp = '사용중단' | '삭제' | '재사용'

/**
 * 마스터 수정 창 아래 [사용중단/재사용 ▲](원본 근태항목 · 휴가항목 · 부서 · 반영기준 · 수당/공제그룹 수정 창, 2026-10-04 실측).
 * 지금 쓰는 항목이면 사용중단 · 삭제, 사용중단된 항목이면 재사용 · 삭제를 위로 펼친다(프로젝트등록과 같은 꼴).
 */
export default function EditStateMenu({ active, onPick }: { active: boolean; onPick: (op: StateOp) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button type="button" className="ec-btn" onClick={() => setOpen((v) => !v)}>사용중단/재사용 ▲</button>
      {open && (
        <div className="ec-menu top-auto bottom-[calc(100%+4px)] left-0 right-auto">
          {(active ? ['사용중단', '삭제'] as const : ['재사용', '삭제'] as const)
            .map((op) => <button key={op} type="button" onClick={() => { setOpen(false); onPick(op) }}>{op}</button>)}
        </div>
      )}
    </span>
  )
}
