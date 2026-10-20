import { useRef } from 'react'
import Modal from '../../../components/Modal'
import { fillAndPrint, openPrintWindow } from '../../../utils/print'
import TaxInvoicePaper, { type PaperParty, type PaperVoucher } from './TaxInvoicePaper'

/**
 * '청구서' 창 — (세금)계산서발행/수령(E030202) 줄 [인쇄] · [저장/청구서인쇄] 와 매출(세금)계산서조회(세무)(E030203) 줄 [인쇄] 가
 * 같은 창을 띄운다(2026-10-20 원본 실측: 조회(세무)의 '회계 I' 줄도 일련번호 20261020 - 0002 · 공급가액 · 세액이 든 같은 두 장).
 */
export default function TaxInvoicePaperModal({ v, supplier, buyer, onClose }: {
  v: PaperVoucher; supplier: PaperParty; buyer: PaperParty; onClose: () => void
}) {
  const paperRef = useRef<HTMLDivElement>(null)
  const printPaper = () => {
    const el = paperRef.current
    const win = el && openPrintWindow()
    if (!el || !win) return
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('')
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>청구서</title>${styles}</head><body>${el.innerHTML}</body></html>`)
  }
  return (
    <Modal open title="청구서" width={660} onClose={onClose}>
      <div ref={paperRef}>
        <TaxInvoicePaper v={v} supplier={supplier} buyer={buyer} />
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button className="ec-btn ec-btn-primary" onClick={printPaper}>인쇄</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
