import Modal from '../../../components/Modal'
import EcRowCap, { capRows } from '../../../components/EcRowCap'
import type { SalesDoc, PurchaseDoc } from '../../../types/api'
import { fmtNumber } from '../../../utils/format'
import SourceDocSearch from '../../slipload/components/SourceDocSearch'
import { dateNo } from '../../../utils/dateNo'
import { dateText } from '../../../utils/dateText'
import { ecAlert } from '../../../components/EcDialog'
import { SlipMenuHistoryModal } from '../../sliphistory/SlipMenuHistoryModal'
import SalesOrderPickModal, { type SalesOrderLite } from '../../salesorder/components/SalesOrderPickModal'
import { ORDER_LOAD_TABS, ORDER_STATUS_LABEL, PO_LOAD_TABS, type LoadableLine, type OrderLoadTab, type Mode, type TradeEntryCfg } from '../tradeEntryConfig'
import type { ReactNode, Dispatch, SetStateAction } from 'react'

/** 불러오기 창 — 지난 전표 · 근거전표([주문]/[발주]) · 발주서 이력 · 주문서검색. TradeEntry 에서 몸통 그대로 옮겼다. */
export default function TradeLoadModals({
  applyLoadPicked,
  applyOrdersToPurchase,
  cfg,
  copyFromDoc,
  docs,
  error,
  loadByLine,
  loadDocPicked,
  loadDocsShown,
  loadLineTable,
  loadOnlyPartner,
  loadOpen,
  loadQuery,
  loadRows,
  loadTab,
  mode,
  orderPickOpen,
  partnerId,
  poHistoryOpen,
  setLoadByLine,
  setLoadDocPicked,
  setLoadOnlyPartner,
  setLoadOpen,
  setLoadQuery,
  setLoadTab,
  setOrderPickOpen,
  setPoHistoryOpen,
  setSlipLoadOpen,
  slipLoadOpen,
}: {
  applyLoadPicked: () => void
  applyOrdersToPurchase: (orders: SalesOrderLite[]) => void
  cfg: TradeEntryCfg
  copyFromDoc: (d: SalesDoc | PurchaseDoc, close: () => void) => void
  docs: (SalesDoc | PurchaseDoc)[]
  error: string
  loadByLine: boolean
  loadDocPicked: Record<number, boolean>
  loadDocsShown: { orderId: number; lines: LoadableLine[]; first: LoadableLine; status: string; total: number; created: boolean; lineCount: number; }[]
  loadLineTable: ReactNode
  loadOnlyPartner: boolean
  loadOpen: boolean
  loadQuery: string
  loadRows: LoadableLine[] | null
  loadTab: OrderLoadTab
  mode: Mode
  orderPickOpen: boolean
  partnerId: string
  poHistoryOpen: boolean
  setLoadByLine: Dispatch<SetStateAction<boolean>>
  setLoadDocPicked: Dispatch<SetStateAction<Record<number, boolean>>>
  setLoadOnlyPartner: Dispatch<SetStateAction<boolean>>
  setLoadOpen: Dispatch<SetStateAction<boolean>>
  setLoadQuery: Dispatch<SetStateAction<string>>
  setLoadTab: Dispatch<SetStateAction<OrderLoadTab>>
  setOrderPickOpen: Dispatch<SetStateAction<boolean>>
  setPoHistoryOpen: Dispatch<SetStateAction<boolean>>
  setSlipLoadOpen: Dispatch<SetStateAction<boolean>>
  slipLoadOpen: boolean
}) {
  return (
    <>
      {/* ── 지난 전표 불러오기 (Option 메뉴) — 거래처 상관없이 지난 전표를 복사 ── */}
      <Modal error={error} open={slipLoadOpen} title={`전표불러오기 (${cfg.lineTab})`} width={760} onClose={() => setSlipLoadOpen(false)}>
        <p className="text-[12px] text-ec-label mt-0">
          지난 {cfg.lineTab} 전표입니다. 행을 누르면 그 전표의 품목·수량·단가를 지금 명세로 가져오고,
          거래처도 그 전표의 것으로 맞춰집니다. (거래처별로 보려면 툴바 [거래내역보기]를 쓰세요.)
        </p>
        <div className="max-h-[380px] overflow-y-auto border border-ec-line border-solid">
          {/* 고르는 창이라 합계가 없다 — 몇 중 몇인지만 적는다. 안 적으면 찾는 전표가
              없다고 읽는다. */}
          <EcRowCap capped={docs.length > 50} shown={50} total={docs.length} sums={false}
                    hint="전표번호로 찾아 보세요." />
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>전표번호</th><th>일자</th><th>{cfg.partnerLabel}</th><th>품목</th>
                <th className="text-right">합계</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-ec-hint p-[16px]">등록된 데이터가 없습니다.</td></tr>
              ) : capRows(docs, 50).rows.map((d) => (
                <tr key={d.id} className="cursor-pointer" onClick={() => copyFromDoc(d, () => setSlipLoadOpen(false))}>
                  <td>{d.docNo}</td>
                  <td>{(d as SalesDoc).saleDate ?? (d as PurchaseDoc).purchaseDate}</td>
                  <td>{d.partnerName}</td>
                  <td>{d.lines[0]?.itemName}{d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: cfg.accent }}>{fmtNumber(d.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* ── 근거전표 불러오기 (원본 [주문]/[발주]) ────────── */}
      <Modal error={error} open={loadOpen} title={cfg.loadTitle} width={960} onClose={() => setLoadOpen(false)}>
        {loadRows === null ? (
          <p className="text-[12.5px] text-ec-hint m-0">불러오는 중…</p>
        ) : mode === 'sales' ? (
          /*
           * 원본 판매입력 [주문] = '주문서검색창(조회)'(2026-10-28 loginaa 실측): 알약 전체 · 결재중 · C-Portal · 미확인 · 확인 · 진행중 · 완료,
           * 머리 검색칸, 전표 단위 열 일자-No. · 거래처명 · 사원(담당)명 · 품목명(요약) · 납기일자 · 주문금액합계 · 진행상태 · 생성한전표 · 인쇄,
           * 아래 라인별 ▾ · 잔량적용(F8) · 전체적용 · 신규(F2) · 리스트 · 닫기. 판매 일자보다 늦은 주문은 없다.
           */
          <SourceDocSearch
            tabs={ORDER_LOAD_TABS} tab={loadTab} onTab={setLoadTab}
            query={loadQuery} onQuery={setLoadQuery}
            date2Label="납기일자" totalLabel="주문금액합계"
            docs={loadDocsShown.map((d) => ({
              key: d.orderId, dateNo: dateNo(d.first.date, d.first.docNo), partnerName: d.first.partnerName,
              employeeName: d.first.employeeName ?? '',
              itemSummary: `${d.first.itemName}${d.first.spec ? ` [${d.first.spec}]` : ''}${d.lineCount > 1 ? ` 외 ${d.lineCount - 1}건` : ''}`,
              date2: dateText(d.first.dueDate ?? '') || '', total: d.total,
              statusLabel: ORDER_STATUS_LABEL[d.status] ?? d.first.statusName, created: d.created,
            }))}
            picked={loadDocPicked} onPicked={setLoadDocPicked}
            createdTitle="생성한 전표는 주문서조회의 [생성한전표] 에서 봅니다."
            byLine={loadByLine} onToggleByLine={() => setLoadByLine((v) => !v)}
            lineView={(
              <>
                {partnerId && (
                  <label className="text-[12.5px] inline-flex items-center gap-[4px] mb-[6px]">
                    <input type="checkbox" checked={loadOnlyPartner} onChange={(e) => setLoadOnlyPartner(e.target.checked)} />
                    이 전표 거래처만
                  </label>
                )}
                {loadLineTable}
              </>
            )}
            onApply={applyLoadPicked}
            applyAllTitle="주문 수량 전체를 담는 [전체적용] 은 원본 동작을 아직 재지 않았습니다."
            onNew={() => window.open('/sales/order-entry', '_blank')}
            onList={() => window.open('/sales/orders', '_blank')}
            onClose={() => setLoadOpen(false)}
          />
        ) : (
          /*
           * 원본 구매입력 [발주] = '발주서조회'(2026-10-31 loginad 구매 QA): 알약 전체 · 결재중 · 미확인 · 확인 ▸ 진행중 ▸ 완료, 머리 검색칸,
           * 열 일자-No. · 거래처명 · 담당자명 · 품목명[규격명] · 납기일자 · 발주금액합계 · 진행상태 · 생성한전표 · 인쇄,
           * 아래 [라인별▾] [잔량적용(F8)▲] [Excel] [닫기] [이력조회]. 담는 것은 예전 '발주 불러오기(미입고 잔량)' 그대로 — 발주확정의 미구매 잔량.
           * [잔량적용(F8)▲] 의 ▲ 안 항목은 원본에서 못 봤다 — 판매 주문서검색창의 [전체적용] 을 그 자리에 둔다(동작 미측정 안내).
           */
          <SourceDocSearch
            tabs={PO_LOAD_TABS} tab={loadTab} onTab={setLoadTab}
            query={loadQuery} onQuery={setLoadQuery}
            date2Label="납기일자" totalLabel="발주금액합계" employeeLabel="담당자명" itemLabel="품목명[규격명]"
            docs={loadDocsShown.map((d) => ({
              key: d.orderId, dateNo: dateNo(d.first.date, d.first.docNo), partnerName: d.first.partnerName,
              employeeName: d.first.employeeName ?? '',
              itemSummary: `${d.first.itemName}${d.first.spec ? `[${d.first.spec}]` : ''}${d.lineCount > 1 ? ` 외 ${d.lineCount - 1}건` : ''}`,
              date2: dateText(d.first.dueDate ?? '') || '', total: d.total,
              statusLabel: ORDER_STATUS_LABEL[d.status] ?? d.first.statusName, created: d.created,
            }))}
            picked={loadDocPicked} onPicked={setLoadDocPicked}
            createdTitle="생성한 전표는 발주서조회의 [진행상태] '조회' 에서 봅니다."
            byLine={loadByLine} onToggleByLine={() => setLoadByLine((v) => !v)}
            lineView={(
              <>
                {partnerId && (
                  <label className="text-[12.5px] inline-flex items-center gap-[4px] mb-[6px]">
                    <input type="checkbox" checked={loadOnlyPartner} onChange={(e) => setLoadOnlyPartner(e.target.checked)} />
                    이 전표 거래처만
                  </label>
                )}
                {loadLineTable}
              </>
            )}
            onApply={applyLoadPicked}
            applyMenu={[{ label: '전체적용', onClick: () => void ecAlert('발주 수량 전체를 담는 [전체적용] 은 원본 동작을 아직 재지 않았습니다.') }]}
            beforeClose={<button type="button" className="ec-btn" onClick={() => void ecAlert('Excel 내려받기는 [발주서조회] 화면에서 합니다.')}>Excel</button>}
            afterClose={<button type="button" className="ec-btn" onClick={() => setPoHistoryOpen(true)}>이력조회</button>}
            onClose={() => setLoadOpen(false)}
          />
        )}
      </Modal>

      {poHistoryOpen && <SlipMenuHistoryModal menu="발주서" statusLabel="확인" onClose={() => setPoHistoryOpen(false)} />}
      {/* 구매 툴바 [주문] = 원본 '주문서검색창(조회)' — 작업지시서입력 [주문] 과 같은 창(SalesOrderPickModal). */}
      {mode === 'purchase' && <SalesOrderPickModal open={orderPickOpen} onClose={() => setOrderPickOpen(false)} onApply={applyOrdersToPurchase} />}
    </>
  )
}
