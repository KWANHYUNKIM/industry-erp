import { api, extractErrorMessage } from '../../api/client'
import type { SalesDoc, PurchaseDoc } from '../../types/api'
import { dateText } from '../../utils/dateText'
import { fmtNumber } from '../../utils/format'
import type { SalesOrderLite } from '../salesorder/components/SalesOrderPickModal'
import { type LoadableLine, type UnsoldLite, emptyLine, ORDER_TAB_MATCH, num, type LineInput, type OrderLoadTab, type Mode } from './tradeEntryConfig'
import type { Dispatch, SetStateAction } from 'react'

/** 근거전표 · 지난 전표 불러오기 — TradeEntry 에서 몸통 그대로 옮겼다(같은 자리에서 부른다). */
export function useSlipLoad({ addItemLine, adjDraft, currencyCode, date, discountTotal, flash, foreign, isAdjust, lines, loadByLine, loadDocPicked, loadOnlyPartner, loadOrderMeta, loadPicked, loadQuery, loadRows, loadTab, mode, partnerId, projectId, setAdjDraft, setAdjOpen, setCols, setCurrencyCode, setDiscountTotal, setEmployeeId, setError, setExchangeRate, setForeign, setLines, setLoadByLine, setLoadDocPicked, setLoadOpen, setLoadOrderMeta, setLoadPicked, setLoadQuery, setLoadRows, setLoadTab, setOrderPickOpen, setPartnerId, setProjectId, setVatBySlip, setWarehouseId, vatBySlip, warehouseId }: {
  addItemLine: (itemId: string, qty?: number) => boolean
  adjDraft: string
  currencyCode: string
  date: string
  discountTotal: number
  flash: (msg: string) => void
  foreign: boolean
  isAdjust: boolean
  lines: LineInput[]
  loadByLine: boolean
  loadDocPicked: Record<number, boolean>
  loadOnlyPartner: boolean
  loadOrderMeta: Map<number, { total: number; status: string; lineCount: number; }>
  loadPicked: Record<string, boolean>
  loadQuery: string
  loadRows: LoadableLine[] | null
  loadTab: OrderLoadTab
  mode: Mode
  partnerId: string
  projectId: string
  setAdjDraft: Dispatch<SetStateAction<string>>
  setAdjOpen: Dispatch<SetStateAction<boolean>>
  setCols: Dispatch<SetStateAction<Record<"stockAll" | "stockWh" | "unit" | "priceVat" | "lineTotal" | "mgmtItem" | "srcType" | "srcDate" | "srcNo" | "qcRequest", boolean>>>
  setCurrencyCode: Dispatch<SetStateAction<string>>
  setDiscountTotal: Dispatch<SetStateAction<number>>
  setEmployeeId: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string>>
  setExchangeRate: Dispatch<SetStateAction<string>>
  setForeign: Dispatch<SetStateAction<boolean>>
  setLines: Dispatch<SetStateAction<LineInput[]>>
  setLoadByLine: Dispatch<SetStateAction<boolean>>
  setLoadDocPicked: Dispatch<SetStateAction<Record<number, boolean>>>
  setLoadOpen: Dispatch<SetStateAction<boolean>>
  setLoadOrderMeta: Dispatch<SetStateAction<Map<number, { total: number; status: string; lineCount: number; }>>>
  setLoadPicked: Dispatch<SetStateAction<Record<string, boolean>>>
  setLoadQuery: Dispatch<SetStateAction<string>>
  setLoadRows: Dispatch<SetStateAction<LoadableLine[] | null>>
  setLoadTab: Dispatch<SetStateAction<OrderLoadTab>>
  setOrderPickOpen: Dispatch<SetStateAction<boolean>>
  setPartnerId: Dispatch<SetStateAction<string>>
  setProjectId: Dispatch<SetStateAction<string>>
  setVatBySlip: Dispatch<SetStateAction<boolean>>
  setWarehouseId: Dispatch<SetStateAction<string>>
  vatBySlip: boolean
  warehouseId: string
}) {
  async function openLoadSource() {
    setLoadOpen(true)
    setLoadPicked({})
    setLoadDocPicked({})
    setLoadByLine(false)
    setLoadTab('ALL')
    setLoadQuery('')
    setLoadRows(null)
    try {
      const rows: LoadableLine[] = []
      if (mode === 'sales') {
        /* 원본은 판매 일자보다 늦은 주문을 띄우지 않는다(10/28 판매에 11월 주문 0건, 2026-10-28 실측) — to=판매 일자. */
        const r = await api.get<UnsoldLite[]>('/sales-orders/unsold', { params: { to: date } })
        r.data.forEach((l) => rows.push({
          key: `${l.orderId}-${l.orderLineId}`, orderId: l.orderId, docType: '주문서',
          docNo: l.orderNo, date: l.orderDate,
          partnerId: l.partnerId, partnerName: l.partnerName, statusName: l.statusName,
          warehouseId: l.warehouseId ?? null, projectId: l.projectId ?? null, employeeId: l.employeeId ?? null,
          employeeName: l.employeeName ?? null, dueDate: l.dueDate ?? null, spec: l.spec ?? null,
          itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
          orderedQty: l.orderQty, doneQty: l.soldQty, restQty: l.unsoldQty, unitPrice: l.unitPrice,
        }))
        const from = rows.reduce((m, x) => (x.date < m ? x.date : m), date)
        const meta = new Map<number, { total: number; status: string; lineCount: number }>()
        if (rows.length > 0) {
          const o = await api.get<{ id: number; status: string; totalAmount: number; lines: unknown[] }[]>('/sales-orders', { params: { from, to: date } })
          o.data.forEach((x) => meta.set(x.id, { total: x.totalAmount, status: x.status, lineCount: x.lines?.length ?? 0 }))
        }
        setLoadOrderMeta(meta)
      } else {
        /*
         * 미구매 잔량(발주 − 이미 구매)으로 담는다. 예전엔 발주수량 전체를 담아 100 중 60 을 입고한 뒤
         * 다시 불러오면 또 100 이 떴다(42회차) — 판매의 '주문 − 판매'(23회차 #70)와 같은 잣대.
         */
        const r = await api.get<{
          orderId: number; orderNo: string; orderLineId: number; orderDate: string
          partnerId: number; partnerName: string; statusName: string
          warehouseId: number | null; projectId: number | null
          itemId: number; itemCode: string; itemName: string; unit: string
          orderQty: number; boughtQty: number; restQty: number; unitPrice: number
          employeeId: number | null; spec: string | null
          currencyCode: string | null; exchangeRate: number | null; foreignPrice: number | null
        }[]>('/purchase-orders/unpurchased')
        /*
         * 원본 [발주] 검색창은 <b>발주서</b>만 띄운다 — 발주요청 · 발주계획은 다른 전표다(2026-10-20 실측).
         * 우리는 한 장이 상태로 지나가므로 발주확정만. 예전엔 요청 · 계획 · 단가확정 단계도 떠서 발주서 전에 구매가 됐다.
         */
        r.data.filter((l) => l.statusName === '발주확정').forEach((l) => rows.push({
          key: `${l.orderId}-${l.orderLineId}`, orderId: l.orderId, docType: '발주서',
          docNo: l.orderNo, date: l.orderDate,
          partnerId: l.partnerId, partnerName: l.partnerName, statusName: l.statusName,
          warehouseId: l.warehouseId ?? null, projectId: l.projectId ?? null, employeeId: l.employeeId ?? null,
          itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
          orderedQty: l.orderQty, doneQty: l.boughtQty, restQty: l.restQty, unitPrice: l.unitPrice,
          spec: l.spec ?? null,
          currencyCode: l.currencyCode ?? null, exchangeRate: l.exchangeRate ?? null, foreignPrice: l.foreignPrice ?? null,
        }))
        /*
         * '발주서조회' 창의 전표 단위 줄(담당자명 · 납기일자 · 발주금액합계 · 줄 수)은 발주서 목록에서 가져온다 — 미구매 응답은 남은 줄만 싣는다.
         * 판매 [주문] 의 주문서 목록과 같은 꼴. 담는 수량 · 단가는 위 미구매 잔량 그대로다.
         */
        const meta = new Map<number, { total: number; status: string; lineCount: number }>()
        if (rows.length > 0) {
          const o = await api.get<{ id: number; dueDate: string | null; employeeName: string | null; totalAmount: number; lines: unknown[] }[]>(
            '/purchase-orders', { params: { status: 'ORDERED' } }).catch(() => ({ data: [] }))
          const byId = new Map(o.data.map((x) => [x.id, x]))
          o.data.forEach((x) => meta.set(x.id, { total: x.totalAmount, status: 'IN_PROGRESS', lineCount: x.lines?.length ?? 0 }))
          rows.forEach((r) => {
            const po = byId.get(r.orderId)
            if (po) { r.dueDate = po.dueDate ?? null; r.employeeName = po.employeeName ?? null }
          })
        }
        setLoadOrderMeta(meta)
      }
      rows.sort((a, b) => b.date.localeCompare(a.date) || b.docNo.localeCompare(a.docNo))
      setLoadRows(rows)
    } catch (err) {
      setLoadRows([])
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 지난 전표의 명세를 지금 화면으로 복사한다.
   * 원본은 이 동작을 두 자리에서 준다 — 툴바 [거래내역보기](거래처별)와 [전표불러오기](전체).
   * 담는 규칙은 같으므로 한 곳에 둔다.
   */
  function copyFromDoc(d: SalesDoc | PurchaseDoc, close: () => void) {
    setLines([
      ...d.lines.map((ln) => ({
        ...emptyLine(),
        itemId: String(ln.itemId), quantity: String(ln.quantity), unitPrice: String(ln.unitPrice),
        spec: ln.spec ?? null,
        name: ln.itemName ?? null,
        remark: ln.remark ?? '',
      })),
      emptyLine(),
    ])
    // 전표불러오기는 거래처가 다를 수 있다 — 그 전표의 거래처로 맞춰 준다.
    if (String(d.partnerId) !== partnerId) setPartnerId(String(d.partnerId))
    close()
    flash(`${d.docNo} 의 명세 ${d.lines.length}건을 가져왔습니다.`)
  }

  /** 고른 근거전표 라인을 명세에 담는다. 거래처가 섞이면 막는다 — 한 전표는 한 거래처다. */
  const loadShown = (loadRows ?? []).filter((r) => {
    if (loadOnlyPartner && partnerId && String(r.partnerId) !== partnerId) return false
    // 판매 일자보다 늦은 주문은 뺀다(원본 실측) — 창을 연 뒤 일자를 바꿔도 따른다.
    if (mode === 'sales' && r.date > date) return false
    const q = loadQuery.trim().toLowerCase()
    return !q || [r.docNo, r.partnerName, r.itemCode, r.itemName, r.employeeName].some((v) => (v ?? '').toLowerCase().includes(q))
  })

  /** 주문서검색창의 전표 단위 줄 — 남은 줄을 주문 하나로 묶는다(최근 것부터, loadRows 차례 그대로). */
  const orderDocs = (() => {
    const by = new Map<number, LoadableLine[]>()
    loadShown.forEach((r) => { const g = by.get(r.orderId); if (g) g.push(r); else by.set(r.orderId, [r]) })
    return [...by.entries()].map(([orderId, ls]) => {
      const m = loadOrderMeta.get(orderId)
      const status = m?.status ?? (ls[0].statusName === '진행중' ? 'IN_PROGRESS' : ls[0].statusName === '완료' ? 'COMPLETED' : 'RECEIVED')
      return {
        orderId, lines: ls, first: ls[0], status,
        total: m?.total ?? ls.reduce((a, x) => a + x.orderedQty * x.unitPrice, 0),
        // 판매로 이어진 주문 — 다 판 줄은 미판매 응답에서 빠지므로 줄 수가 줄었거나 판 수량이 있으면.
        created: ls.some((x) => x.doneQty > 0) || (m != null && m.lineCount > ls.length),
        lineCount: m?.lineCount ?? ls.length,
      }
    })
  })()
  const loadDocsShown = orderDocs.filter((d) => ORDER_TAB_MATCH[loadTab](d.status))

  /** 근거전표 줄 단위 표 — 구매 [발주] 창과 판매 주문서검색창 [라인별] 이 같이 쓴다. */
  const loadLineTable = (
  <div className="max-h-[360px] overflow-y-auto border border-ec-line border-solid">
    <table className="w-full text-left">
      <thead>
        <tr>
          <th className="w-[30px]" />
          <th>{mode === 'sales' ? '주문No.' : '발주No.'}</th>
          <th className="w-[90px]">일자</th>
          <th>거래처</th>
          <th>품목</th>
          <th className="w-[70px] text-right">{mode === 'sales' ? '주문' : '발주'}</th>
          <th className="w-[60px] text-right">{mode === 'sales' ? '판매' : '입고'}</th>
          <th className="w-[70px] text-right">담을수량</th>
          <th className="w-[80px] text-right">단가</th>
          <th className="w-[70px]">상태</th>
        </tr>
      </thead>
      <tbody>
        {loadShown.map((r) => (
          <tr
            key={r.key}
            onClick={() => setLoadPicked((p) => ({ ...p, [r.key]: !p[r.key] }))}
            style={{ cursor: 'pointer', background: loadPicked[r.key] ? 'var(--ec-blue-light)' : undefined }}
          >
            <td className="text-center">
              <input type="checkbox" readOnly checked={!!loadPicked[r.key]} />
            </td>
            <td>{r.docNo}</td>
            <td>{dateText(r.date)}</td>
            <td>{r.partnerName}</td>
            <td>{r.itemName}</td>
            <td className="text-right">{fmtNumber(r.orderedQty)}</td>
            <td className="text-right text-ec-hint">{fmtNumber(r.doneQty)}</td>
            <td className="text-right font-bold">{fmtNumber(r.restQty)}</td>
            <td className="text-right">{fmtNumber(r.unitPrice)}</td>
            <td className="text-ec-hint">{r.statusName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  )

  /** [잔량적용(F8)] — 전표 단위면 체크한 주문의 남은 줄 전부, [라인별] 이면 체크한 줄. */
  function applyLoadPicked() {
    const byDoc = !loadByLine
    const picked = byDoc
      ? loadDocsShown.filter((d) => loadDocPicked[d.orderId]).flatMap((d) => d.lines)
      : (loadRows ?? []).filter((r) => loadPicked[r.key])
    if (picked.length === 0) return flash(byDoc ? '담을 주문을 체크하세요.' : '담을 행을 체크하세요.')
    const partnerIds = [...new Set(picked.map((r) => r.partnerId))]
    if (partnerIds.length > 1) return flash('거래처가 다른 행은 한 전표에 담을 수 없습니다.')
    if (partnerId && String(partnerIds[0]) !== partnerId) {
      return flash('지금 전표의 거래처와 다릅니다. 거래처를 비우거나 같은 거래처 행을 고르세요.')
    }
    /*
     * 외화 발주서를 담으면 구매도 외자 — 통화 · 환율을 이어받고 단가 칸에는 외화단가를 싣는다(구매 외자 줄과 같은 꼴).
     * 통화가 다른 발주(내자 · 외화 섞임 포함)는 한 전표에 담을 수 없다 — 원화금액을 정할 환율이 하나여야 한다.
     */
    const curs = [...new Set(picked.map((r) => r.currencyCode ?? ''))]
    if (curs.length > 1) return flash('통화가 다른 발주는 한 전표에 담을 수 없습니다. 통화별로 나눠 담으세요.')
    const fxCur = curs[0]
    if (mode === 'purchase' && lines.some((l) => l.itemId) && (fxCur ? !(foreign && currencyCode === fxCur) : foreign)) {
      return flash('지금 전표의 통화와 다른 발주입니다. 통화가 같은 발주를 고르세요.')
    }
    if (!partnerId) setPartnerId(String(partnerIds[0]))
    if (mode === 'purchase' && fxCur) {
      setForeign(true); setCurrencyCode(fxCur)
      const r0 = picked.find((r) => r.exchangeRate != null)?.exchangeRate
      if (r0 != null) setExchangeRate(String(r0))
    } else if (mode === 'purchase' && foreign) {
      setForeign(false); setCurrencyCode('')
    }

    /*
     * 근거전표의 프로젝트·창고도 이어받는다. 예전엔 거래처만 받아서, 수주를 불러와 만든 판매가
     * 프로젝트 없이 저장되고 <b>프로젝트별 손익에서 매출이 빠졌다</b>(2026-10-01, 프로젝트 여러 개로
     * 시연하다 발견). 프로젝트가 다른 주문을 한 전표에 섞으면 어느 프로젝트 매출인지 갈 수 없어 막는다.
     */
    const projIds = [...new Set(picked.map((r) => r.projectId).filter((x): x is number => x != null))]
    if (projIds.length > 1) return flash('프로젝트가 다른 주문은 한 전표에 담을 수 없습니다. 프로젝트별로 나눠 담으세요.')
    if (projIds.length === 1) {
      if (projectId && projectId !== String(projIds[0])) {
        return flash('지금 전표의 프로젝트와 다른 주문입니다. 프로젝트를 비우거나 같은 프로젝트 행을 고르세요.')
      }
      if (!projectId) setProjectId(String(projIds[0]))
    }
    /*
     * 창고는 화면을 열 때 기본값(마지막에 쓴 창고 등)이 이미 차 있어서 "비었으면 채운다" 로는 안 바뀐다 —
     * 주문은 본사창고인데 QA창고에서 출하하는 판매가 만들어졌다. 주문들의 창고가 하나면 그것으로 바꾸고 알린다.
     */
    /*
     * 원본은 발주의 담당자(P01 김현수) · 주문의 담당자(S04)가 머리에 찬다 — 이미 고른 담당자도 <b>덮어쓴다</b>
     * (주문 → 판매 Z20 → S04, 견적 → 주문 Z20 → Z12, 2026-10-28 루프 26 실측). 불러온 전표에 담당자가 없을 때는 미실측 — 그대로 둔다.
     * 일자는 머리 값 그대로다(원본도 판매입력의 처음 일자 '오늘' 이 그대로 남았다).
     */
    const emp = picked.find((r) => r.employeeId != null)?.employeeId
    if (emp != null) setEmployeeId(String(emp))
    const whIds = [...new Set(picked.map((r) => r.warehouseId).filter((x): x is number => x != null))]
    const whNote = whIds.length === 1 && warehouseId !== String(whIds[0])
    if (whNote) setWarehouseId(String(whIds[0]))

    setLines((ls) => {
      const kept = ls.filter((l) => l.itemId)
      const added = picked.map((r) => ({
        ...emptyLine(),
        itemId: String(r.itemId),
        quantity: String(r.restQty),
        unitPrice: String(fxCur && r.foreignPrice != null ? r.foreignPrice : r.unitPrice),
        spec: r.spec ?? null,
        name: r.itemName ?? null,
        // 적요에 "SO-… 불러옴" 이라고 적던 것을 근거전표 3열로 옮겼다. 적요는 사람 몫으로 비워 둔다.
        sourceOrderId: String(r.orderId),
        sourceDocType: r.docType,
        sourceDocDate: r.date,
        sourceDocNo: r.docNo,
      }))
      return [...kept, ...added, emptyLine()]
    })
    // 근거전표 열은 기본으로 숨어 있다(원본도 그렇다). 담은 순간에는 보여줘야 뭘 담았는지 안다.
    setCols((c) => ({ ...c, srcNo: true }))
    setLoadOpen(false)
    flash(`${picked.length}건을 명세에 담았습니다.${whNote ? ' 창고를 주문의 창고로 맞췄습니다.' : ''}`)
  }

  /**
   * 구매 [주문] 의 [적용(F8)] — 고른 주문서의 품목 · 수량을 구매 명세에 담는다. 단가는 주문의 판매단가가 아니라
   * 그 품목의 구매 기본단가(addItemLine — 툴바 바코드 · My품목과 같은 길)다. 주문서는 구매의 근거전표가 아니라 잇지 않는다
   * (구매 줄의 근거전표는 발주서만 받는다 — 저장 로직은 그대로).
   */
  function applyOrdersToPurchase(orders: SalesOrderLite[]) {
    let n = 0
    orders.forEach((o) => o.lines.forEach((l) => { if (addItemLine(String(l.itemId), Number(l.quantity))) n++ }))
    setOrderPickOpen(false)
    flash(`주문서 ${orders.length}건의 품목 ${n}줄을 명세에 담았습니다.`)
  }

  /* 원본 calcbySlip. 누를 때마다 켜고 끄며, 켜진 상태는 전표에 저장된다. 판매는 툴바, 구매는 ⌄ 아래 줄(원본 구매 툴바에 없음). */
  const vatBySlipButton = (
    <button
      type="button"
      className={`ec-btn ec-btn-sm${vatBySlip ? ' ec-btn-primary' : ''}`}
      title={vatBySlip
        ? '전표 합계에 한 번 반올림합니다. 눌러서 라인별 계산으로 되돌립니다.'
        : '라인마다 반올림합니다. 눌러서 전표 합계 기준으로 바꿉니다.'}
      onClick={() => setVatBySlip((v) => !v)}
    >
      {isAdjust ? '거래별계산' : '거래별부가세계산'}{vatBySlip ? ' ✓' : ''}
    </button>
  )

  const checkedIdx = lines.map((l, i) => (l.checked && l.itemId ? i : -1)).filter((i) => i >= 0)
  const targetIdx = () => (checkedIdx.length > 0 ? checkedIdx : lines.map((l, i) => (l.itemId ? i : -1)).filter((i) => i >= 0))

  /** [금액조정] — 품목이 없으면 원본처럼 '자료를 입력 바랍니다.' 만 띄운다. */
  function openAdjust() {
    if (!lines.some((l) => l.itemId)) { flash('자료를 입력 바랍니다.'); return }
    setAdjDraft(discountTotal ? String(discountTotal) : '')
    setAdjOpen(true)
  }
  function applyAmountAdjust() {
    setDiscountTotal(Math.max(0, Math.round(num(adjDraft))))
    setAdjOpen(false)
  }
  return { applyAmountAdjust, applyLoadPicked, applyOrdersToPurchase, checkedIdx, copyFromDoc, loadDocsShown, loadLineTable, openAdjust, openLoadSource, targetIdx, vatBySlipButton }
}
