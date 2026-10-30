import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/CodePickerField'
import { EcCond } from '../../../components/EcStatusPanel'
import { periodOf } from '../../../utils/periods'
import { useCondPickers } from '../../../utils/useCondPickers'
import EcDateInput from '../../../components/ui/EcDateInput'

/**
 * 원본 재고조정진행단계 [재고조정] 이 여는 <b>단계별재고조정</b> 창 (2026-10-13 loginaa 실측).
 *
 * <p>칸: 기준일자(열면 <b>전월 말일</b> — 10/13 에 열어 2026/09/30) · 창고(코드도움, 고른 창고가 알약으로 붙는다) · 적요 ·
 * 참고 [실수량을 변경하지 않은 품목의 수량 0으로 조정](꺼짐). 단추 [저장(F8) · 다시 작성 · 닫기].
 *
 * <p>저장하면 그 기준일자의 단계별 실사가 재고조정이 된다 — 실사 포장김치 본사창고 100(장부 348) → 기준일자 10/13 · 본사창고 저장 →
 * 재고조정조회 '단계별 · 26/10/13-2 · 본사창고 · 포장김치 [1KG] · 248', 알림 '요청된 [단계별재고조정] 작업이 완료되었습니다.'
 */
export default function StagedAdjustDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const pickers = useCondPickers(['warehouses'])
  const [date, setDate] = useState(() => periodOf('전월')!.to)
  const [warehouse, setWarehouse] = useState('')
  const [reason, setReason] = useState('')
  const [zero, setZero] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reset = () => { setDate(periodOf('전월')!.to); setWarehouse(''); setReason(''); setZero(false); setError('') }
  useEffect(() => { if (open) reset() }, [open])

  async function save() {
    setSaving(true); setError('')
    try {
      await api.post('/staged-adjustments/adjust', {
        date, warehouseIds: warehouse ? [Number(warehouse)] : [], reason: reason || null, zeroUncounted: zero,
      })
      onDone?.(); onClose()
    } catch (e) { setError(extractErrorMessage(e)) } finally { setSaving(false) }
  }

  return createPortal(
    <Modal open={open} title="단계별재고조정" onClose={onClose} width={720} error={error || null}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateInput className="ec-input w-[145px]" value={date} onChange={(e) => setDate(e.target.value)} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={260} emptyLabel="" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-full" placeholder="적요" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </EcCond>
        <EcCond label="참고">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} /> 실수량을 변경하지 않은 품목의 수량 0으로 조정
          </label>
        </EcCond>
      </ul>
      <div className="flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>,
    document.body,
  )
}
