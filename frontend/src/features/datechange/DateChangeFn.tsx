import { useState } from 'react'
import EcDateField from '../../components/EcDateField'
import Modal from '../../components/Modal'
import { ecAlert } from '../../components/EcDialog'
import { extractErrorMessage } from '../../api/client'

/**
 * 일자-No. 옆 [Fn] → [일자변경] 작은 창(견적서 · 주문서 · 출하지시서 수정 화면).
 * 원본(판매 수정 창, 2026-10-28 실측): 일자 칸은 잠겨 있고 이 창(기존일자 · 변경일자)에서만 바꾼다.
 * 저장은 `onSubmit(변경일자)` — 서버가 새 날짜의 다음 번호로 번호를 다시 매긴다.
 */
export default function DateChangeFn({ date, onSubmit }: { date: string; onSubmit: (newDate: string) => Promise<void> }) {
  const [fnOpen, setFnOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')

  async function save() {
    if (!to || to === date) { void ecAlert('변경일자를 기존일자와 다르게 입력하세요.'); return }
    try {
      await onSubmit(to)
      setOpen(false)
      void ecAlert('정상적으로 변경되었습니다.')
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  return (
    <>
      <span className="relative inline-block ml-[4px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFnOpen((o) => !o)}>Fn</button>
        {fnOpen && (
          <span className="absolute left-0 top-full z-20 bg-white border border-ec-line rounded-ec min-w-[90px]">
            <button type="button" className="ec-btn ec-btn-sm w-full"
                    onClick={() => { setFnOpen(false); setTo(date); setOpen(true) }}>일자변경</button>
          </span>
        )}
      </span>
      <Modal error={null} open={open} title="일자변경" width={360} onClose={() => setOpen(false)}>
        <div className="ec-form">
          <div className="flex items-center gap-[8px] mb-[6px]">
            <span className="w-[70px]">기존일자</span>
            <input className="ec-input" readOnly aria-label="기존일자" value={date} />
          </div>
          <div className="flex items-center gap-[8px] mb-[6px]">
            <span className="w-[70px]">변경일자</span>
            <EcDateField value={to} onChange={setTo} />
          </div>
          <div className="flex gap-[4px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
