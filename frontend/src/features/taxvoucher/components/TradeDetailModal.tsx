import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import { EcReportFoot, EcReportHead } from '../../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../../api/client'
import { dateNo } from '../../../utils/dateNo'
import DropUpButton from './DropUpButton'
import { fmtAmount } from '../../../utils/format'

interface Line { itemName: string; spec: string | null; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }
interface Slip { id: number; docNo: string; partnerName: string; lines: Line[]; saleDate?: string; purchaseDate?: string }


/**
 * (세금)계산서조회(세무)의 [내역보기] 창 '거래내역보기' — 계산서가 된 판매 · 구매 전표의 줄을 보인다(2026-10-22 loginaa 실측).
 * 머리: 검색칸 '입력 후 [Enter]' · [Option ▾](양식설정) / 제목 '거래내역보기' / 회사명 · '회계전표 : 일자 -No.'
 * 열 [☐ · 회계전표일자-No. · 일자-No.(전표일자 -번호 -줄) · 품목명[규격] · 수량 · 단가 · 공급가액 · 부가세 · 합계 · 거래처명],
 * 날짜마다 '일자 계' 줄, 끝 [P.1] · 출력한 때, 하단 [인쇄 ▴] [Excel] [재고전표연결 ▴(미청구재고전표연결 · 신규재고전표연결)] [연결전표찾기] [닫기].
 */
export default function TradeDetailModal({ side, entryDate, entryNo, slipId, onClose }: {
  side: '매출' | '매입'; entryDate: string; entryNo: string; slipId: number | null; onClose: () => void
}) {
  const [slip, setSlip] = useState<Slip | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [optOpen, setOptOpen] = useState(false)
  useEffect(() => {
    if (slipId == null) return
    api.get<Slip[]>(side === '매출' ? '/sales' : '/purchases', { params: { from: entryDate, to: entryDate } })
      .then((r) => setSlip(r.data.find((x) => x.id === slipId) ?? null))
      .catch((e) => setError(extractErrorMessage(e)))
  }, [side, entryDate, slipId])
  const slipDate = slip?.saleDate ?? slip?.purchaseDate ?? entryDate
  const jno = dateNo(entryDate, entryNo)
  const rows = (slip?.lines ?? []).map((l, i) => ({ l, no: `${dateNo(slipDate, slip!.docNo)} -${i + 1}`, partner: slip!.partnerName }))
    .filter((r) => !q.trim() || `${r.l.itemName}${r.l.spec ?? ''}${r.partner}${r.no}`.includes(q.trim()))
  const sum = rows.reduce((a, r) => ({ q: a.q + Number(r.l.quantity), s: a.s + Number(r.l.supplyAmount), v: a.v + Number(r.l.vatAmount) }), { q: 0, s: 0, v: 0 })
  return (
    <Modal open title="거래내역보기" width={940} error={error} onClose={onClose}>
      <div className="flex items-center mb-[8px]">
        <b className="text-[14px]">거래내역보기</b>
        <span className="flex-1" />
        <input className="ec-input w-[150px] mr-[6px]" placeholder="입력 후 [Enter]" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="relative">
          <button type="button" className="ec-btn" onClick={() => setOptOpen((v) => !v)}>Option</button>
          {optOpen && <div className="ec-menu absolute right-0 top-[28px] z-[5]"><button type="button" onClick={() => setOptOpen(false)}>양식설정</button></div>}
        </span>
      </div>
      <EcReportHead title="거래내역보기" period={`회계전표 : ${jno}`} />
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[30px]"><input type="checkbox" aria-label="전체 선택" /></th>
            <th>회계전표일자-No.</th><th>일자-No.</th><th>품목명[규격]</th>
            <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
            <th>거래처명</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.no}>
              <td className="text-center whitespace-nowrap"><input type="checkbox" aria-label={`${i + 1}줄 선택`} /> {i + 1}</td>
              <td className="text-center">{jno}</td>
              <td className="text-center text-ec-blue">{r.no}</td>
              <td>{r.l.itemName}{r.l.spec ? `[${r.l.spec}]` : ''}</td>
              <td className="text-right">{fmtAmount(r.l.quantity)}</td><td className="text-right">{fmtAmount(r.l.unitPrice)}</td>
              <td className="text-right">{fmtAmount(r.l.supplyAmount)}</td><td className="text-right">{fmtAmount(r.l.vatAmount)}</td>
              <td className="text-right">{fmtAmount(Number(r.l.supplyAmount) + Number(r.l.vatAmount))}</td>
              <td>{r.partner}</td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="font-bold">
              <td colSpan={4} className="text-center">{slipDate.replaceAll('-', '/')} 계</td>
              <td className="text-right">{fmtAmount(sum.q)}</td><td className="text-right">{rows.length === 1 ? fmtAmount(rows[0].l.unitPrice) : ''}</td>
              <td className="text-right">{fmtAmount(sum.s)}</td><td className="text-right">{fmtAmount(sum.v)}</td><td className="text-right">{fmtAmount(sum.s + sum.v)}</td><td />
            </tr>
          )}
          {rows.length === 0 && <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
        </tbody>
      </table>
      <EcReportFoot />
      <div className="flex gap-[6px] mt-[10px]">
        <DropUpButton label="인쇄" primary items={[{ label: 'PDF' }, { label: '인쇄설정' }, { label: '프린트문제해결' }, { label: '인쇄' }]} />
        <button type="button" className="ec-btn">Excel</button>
        <DropUpButton label="재고전표연결" items={[{ label: '미청구재고전표연결' }, { label: '신규재고전표연결' }]} />
        <button type="button" className="ec-btn">연결전표찾기</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
