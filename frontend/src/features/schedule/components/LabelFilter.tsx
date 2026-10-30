import { useState, type ReactNode } from 'react'
import LabelChip from '../../board/components/LabelChip'
import { LABEL_PALETTE } from '../../board/labels'
import { ecAlert } from '../../../components/EcDialog'

type Label = { id: number; code: string; name: string; color: string; active: boolean }

/** '라벨없음' 칸의 값 — 라벨이 안 붙은 일정. */
export const NO_LABEL = ''

/**
 * 일정관리 머리 [라벨] — 원본 quickLabel(2026-10-30 loginaa 실측).
 * 펼치면 판(폭 135 · 둥글기 20): 맨 위 [□ 전체](회색 줄), 그 아래 [□ 라벨없음] 과 라벨마다 [□ 칩], 바닥 [↵][+][×].
 * ↵ 적용 — 고른 라벨의 일정만 달력에 남긴다. 하나도 안 골랐으면 '1개 이상 선택해야 합니다.'.
 * + 는 라벨 마스터('라벨조회'), × 는 닫기. 처음엔 아무것도 안 걸려 다 보인다(체크도 다 꺼져 있다).
 */
export default function LabelFilter({ labels, value, onApply, onManage }: {
  labels: Label[]
  /** 적용된 거르기. null 이면 걸지 않았다. */
  value: Set<string> | null
  onApply: (v: Set<string>) => void
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const codes = [NO_LABEL, ...labels.map((l) => l.code)]
  const all = codes.every((c) => picked.has(c))

  const toggle = (c: string) => setPicked((p) => { const n = new Set(p); if (n.has(c)) n.delete(c); else n.add(c); return n })
  const show = () => { setPicked(new Set(value ?? [])); setOpen((v) => !v) }
  const apply = () => {
    if (picked.size === 0) { ecAlert('1개 이상 선택해야 합니다.'); return }
    onApply(new Set(picked))
    setOpen(false)
  }

  const row = (code: string, chip: ReactNode) => (
    <label key={code || 'none'} className="flex items-center gap-[6px] py-[4.5px] px-[9px] cursor-pointer">
      <input type="checkbox" checked={picked.has(code)} onChange={() => toggle(code)}
             aria-label={code === NO_LABEL ? '라벨없음' : labels.find((l) => l.code === code)?.name} />
      {chip}
    </label>
  )

  return (
    <span className="relative inline-flex">
      <button type="button" className="ec-btn" aria-haspopup="menu" aria-expanded={open} onClick={show}>라벨</button>
      {open && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setOpen(false)} />
          <div className="ec-menu left-0 right-auto w-[135px] p-0 overflow-hidden" role="menu" aria-label="라벨 거르기">
            <label className="flex items-center gap-[6px] h-[30px] px-[9px] bg-ec-page cursor-pointer">
              <input type="checkbox" checked={all} aria-label="전체"
                     onChange={() => setPicked(all ? new Set() : new Set(codes))} />
              전체
            </label>
            <div className="max-h-[220px] overflow-y-auto">
              {row(NO_LABEL, <LabelChip name="라벨없음" color={LABEL_PALETTE[0][0]} />)}
              {labels.map((l) => row(l.code, <LabelChip name={l.name} color={l.color} />))}
            </div>
            <div className="flex items-center justify-around py-[4.5px]">
              <button type="button" className="ec-btn ec-btn-primary ec-btn-sm" aria-label="적용" onClick={apply}>↵</button>
              <button type="button" className="no-ec bg-transparent border-0 cursor-pointer text-ec-hint" aria-label="라벨조회"
                      onClick={() => { setOpen(false); onManage() }}>+</button>
              <button type="button" className="no-ec bg-transparent border-0 cursor-pointer text-ec-hint" aria-label="닫기"
                      onClick={() => setOpen(false)}>×</button>
            </div>
          </div>
        </>
      )}
    </span>
  )
}
