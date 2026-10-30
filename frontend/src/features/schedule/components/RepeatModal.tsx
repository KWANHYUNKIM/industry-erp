import { useState } from 'react'
import Modal from '../../../components/Modal'
import { useShortcut } from '../../../utils/useShortcut'
import {
  ORDINALS, UNIT_LABEL, WEEKDAYS, repeatProblem, repeatSummary, type RepeatRule, type RepeatUnit,
} from '../../../utils/scheduleRepeat'
import EcDateInput from '../../../components/ui/EcDateInput'

/**
 * 원본 일정관리등록의 [반복설정] 이 여는 '반복설정' 창(E070201, 2026-10-13 실측).
 * 시작일자 · 반복설정(반복주기 N + 일/주/개월/년 …) · 종료일자(◉날짜 ○횟수) · 요약보기, 하단 [적용(F8)][삭제][닫기].
 * [삭제]는 반복을 걷어 낸다. 횟수가 0 이면 그 칸에 말풍선.
 */
export default function RepeatModal({ value, onApply, onRemove, onClose }: {
  value: RepeatRule
  onApply: (r: RepeatRule | null) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [r, setR] = useState<RepeatRule>(value)
  const [tip, setTip] = useState('')
  const set = <K extends keyof RepeatRule>(k: K, v: RepeatRule[K]) => { setR((x) => ({ ...x, [k]: v })); setTip('') }
  const toggleDay = (w: number) => set('weekdays', r.weekdays.includes(w) ? r.weekdays.filter((x) => x !== w) : [...r.weekdays, w])

  function apply() {
    const p = repeatProblem(r)
    if (p === 'none') return onApply(null)
    if (p) return setTip(p)
    onApply(r)
  }
  useShortcut('F8', apply)

  const dayBoxes = (
    <span className="inline-flex flex-wrap gap-[8px]">
      {WEEKDAYS.map((d, w) => (
        <label key={d} className="inline-flex items-center gap-[3px] cursor-pointer">
          <input type="checkbox" aria-label={`${d}요일`} checked={r.weekdays.includes(w)} onChange={() => toggleDay(w)} />{d}
        </label>
      ))}
    </span>
  )

  return (
    <Modal open title="반복설정" width={780} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[8px]">반복설정</div>
      <div className="ec-form">
        <div className="grid grid-cols-[100px_1fr] gap-y-[8px] items-center text-[12px]">
          <span>시작일자</span>
          <span><EcDateInput className="ec-input w-[150px]" aria-label="시작일자" value={r.startDate} onChange={(e) => set('startDate', e.target.value)} /></span>

          <span>반복설정</span>
          <span className="flex flex-col gap-[6px]">
            <span className="flex items-center gap-[6px]">
              <span className="rounded-ec bg-ec-page py-[2px] px-[6px] whitespace-nowrap">반복주기</span>
              <input type="number" min={1} className="ec-input flex-1 text-right" aria-label="반복주기" value={r.interval}
                     onChange={(e) => set('interval', Math.max(1, Number(e.target.value) || 1))} />
              <select className="ec-input flex-1" aria-label="반복단위" value={r.unit} onChange={(e) => set('unit', e.target.value as RepeatUnit)}>
                {(Object.keys(UNIT_LABEL) as RepeatUnit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
              </select>
            </span>
            {r.unit === 'WEEK' && <span className="flex items-center gap-[6px]"><span className="rounded-ec bg-ec-page py-[2px] px-[6px] whitespace-nowrap">요일</span>{dayBoxes}</span>}
            {r.unit === 'MONTH' && (
              <>
                <span className="flex items-center gap-[8px]">
                  <span className="rounded-ec bg-ec-page py-[2px] px-[6px] whitespace-nowrap">기준</span>
                  {(['DAY', 'WEEK'] as const).map((b) => (
                    <label key={b} className="inline-flex items-center gap-[3px] cursor-pointer">
                      <input type="radio" name="monthBasis" checked={r.monthBasis === b} onChange={() => set('monthBasis', b)} />{b === 'DAY' ? '일' : '주'}
                    </label>
                  ))}
                </span>
                {r.monthBasis === 'DAY' ? (
                  <span className="flex items-center gap-[6px]">
                    <span className="rounded-ec bg-ec-page py-[2px] px-[6px] whitespace-nowrap">일자</span>
                    <select className="ec-input flex-1" aria-label="일자" value={r.monthDay} onChange={(e) => set('monthDay', Number(e.target.value))}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>일
                  </span>
                ) : (
                  <span className="flex items-center gap-[6px]">
                    <span className="rounded-ec bg-ec-page py-[2px] px-[6px] whitespace-nowrap">요일</span>
                    <select className="ec-input flex-1" aria-label="몇째" value={r.weekOrdinal} onChange={(e) => set('weekOrdinal', Number(e.target.value))}>
                      {ORDINALS.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                    </select>
                    {dayBoxes}
                  </span>
                )}
              </>
            )}
            {r.unit === 'YEAR' && (
              <span className="flex items-center gap-[6px]">
                <span className="rounded-ec bg-ec-page py-[2px] px-[6px] whitespace-nowrap">일자</span>
                <select className="ec-input flex-1" aria-label="월" value={r.yearMonth} onChange={(e) => set('yearMonth', Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
                </select>
                <select className="ec-input flex-1" aria-label="일" value={r.yearDay} onChange={(e) => set('yearDay', Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>일
              </span>
            )}
          </span>

          <span>종료일자</span>
          <span className="flex flex-col gap-[6px]">
            <span className="flex items-center gap-[8px]">
              {(['DATE', 'COUNT'] as const).map((t) => (
                <label key={t} className="inline-flex items-center gap-[3px] cursor-pointer">
                  <input type="radio" name="endType" checked={r.endType === t} onChange={() => set('endType', t)} />{t === 'DATE' ? '날짜' : '횟수'}
                </label>
              ))}
            </span>
            {r.endType === 'DATE' ? (
              <span className="flex items-center gap-[6px]">
                <span className="rounded-ec bg-ec-page py-[2px] px-[6px] whitespace-nowrap">종료일자</span>
                <EcDateInput className="ec-input w-[150px]" aria-label="종료일자" value={r.endDate} onChange={(e) => set('endDate', e.target.value)} />
              </span>
            ) : (
              <span className="relative flex items-center gap-[6px]">
                <span className="rounded-ec bg-ec-page py-[2px] px-[6px] whitespace-nowrap">횟수</span>
                {tip && (
                  <span role="tooltip" className="absolute right-[40px] bottom-full mb-[4px] z-10 whitespace-pre py-[6px] px-[12px] text-[12px] bg-ec-panel border border-ec-line border-solid rounded-ec-panel">{tip}</span>
                )}
                <input type="number" min={0} className={`ec-input flex-1 text-right ${tip ? 'border-ec-danger' : ''}`} aria-label="횟수"
                       value={r.count} onChange={(e) => set('count', Math.max(0, Number(e.target.value) || 0))} />회
              </span>
            )}
            {tip && r.endType === 'DATE' && <span className="text-ec-danger">{tip}</span>}
          </span>

          <span>요약보기</span>
          <span aria-label="요약보기">{repeatSummary(r)}</span>
        </div>
      </div>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onRemove}>삭제</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
