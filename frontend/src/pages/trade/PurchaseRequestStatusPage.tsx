import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../api/types'

/**
 * 구매관리 > 발주 파이프라인 현황 — 한 컴포넌트를 진입 상태만 바꿔 재사용한다.
 *   발주요청현황 (E040318, 기본 REQUESTED)
 *   발주계획현황 (E041015, 기본 PLANNED)
 *   단가요청현황 (E040325, 기본 PRICED — 백엔드 /prices 가 "단가요청 결과 반영"으로 PRICED 를 매긴다)
 * 상단에 상태별 집계 카드(클릭해 상태 전환), 하단에 선택 상태의 발주서를 라인 단위로 펼친다.
 *
 * 백엔드: 이 화면을 위해 서버사이드 조회를 추가했다 —
 *   GET /api/purchase-orders/summary          → 상태별 집계(건수·금액)
 *   GET /api/purchase-orders?status=REQUESTED  → 특정 상태만 조회
 * (집계·필터를 프론트에서 매번 계산하지 않고 서버가 소유한다. 새 테이블/컬럼이 없어 마이그레이션은 없다.)
 */

/** 파이프라인 표시 순서 */
const PIPELINE: PurchaseOrderStatus[] = ['REQUESTED', 'PLANNED', 'PRICED', 'ORDERED', 'RECEIVED', 'CANCELLED']
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '발주요청', PLANNED: '발주계획', PRICED: '단가확정',
  ORDERED: '발주확정', RECEIVED: '입고전환', CANCELLED: '취소',
}
const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '#c07a00', PLANNED: '#8a929c', PRICED: '#7a5bb5',
  ORDERED: 'var(--ec-blue)', RECEIVED: '#1c7c3c', CANCELLED: '#9aa1ab',
}

interface SummaryRow {
  status: PurchaseOrderStatus
  statusName: string
  count: number
  supplyAmount: number
  vatAmount: number
  totalAmount: number
}

interface Row {
  key: string
  date: string
  dueDate: string | null
  orderNo: string
  partner: string
  warehouse: string
  employee: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
}

export default function PurchaseRequestStatusPage({
  defaultStatus = 'REQUESTED', title = '발주요청현황',
}: {
  defaultStatus?: PurchaseOrderStatus
  title?: string
}) {
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [status, setStatus] = useState<PurchaseOrderStatus>(defaultStatus)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function loadSummary() {
    try {
      const res = await api.get<SummaryRow[]>('/purchase-orders/summary')
      setSummary(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function loadList(st: PurchaseOrderStatus) {
    setLoading(true)
    try {
      const res = await api.get<PurchaseOrder[]>('/purchase-orders', { params: { status: st } })
      const flat: Row[] = []
      for (const o of res.data) {
        o.lines.forEach((l) => flat.push({
          key: `${o.id}-${l.id}`,
          date: o.orderDate,
          dueDate: o.dueDate,
          orderNo: o.orderNo,
          partner: o.partnerName,
          warehouse: o.warehouseName ?? '',
          employee: o.employeeName ?? '',
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
        }))
      }
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSummary() }, [])
  useEffect(() => { loadList(status) }, [status])

  const reload = () => { loadSummary(); loadList(status) }

  const shown = useMemo(() => {
    const kw = keyword.trim()
    if (!kw) return rows
    return rows.filter((r) => r.partner.includes(kw) || r.itemName.includes(kw) || r.orderNo.includes(kw))
  }, [rows, keyword])

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ qty: s.qty + r.qty, supply: s.supply + r.supply, vat: s.vat + r.vat }),
    { qty: 0, supply: 0, vat: 0 },
  ), [shown])

  return (
    <EcListShell
      title={title}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={reload}
      actions={[{ label: '새로고침', onClick: reload }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 발주 파이프라인 집계 카드 — 클릭하면 해당 상태로 전환 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {PIPELINE.map((st) => {
          const s = summary.find((x) => x.status === st)
          const active = st === status
          return (
            <button
              key={st}
              onClick={() => setStatus(st)}
              style={{
                flex: '1 1 0', minWidth: 130, textAlign: 'left', cursor: 'pointer',
                border: active ? `1.5px solid ${STATUS_COLOR[st]}` : '1px solid #d9dee5',
                background: active ? '#fff' : '#fbfcfe',
                borderRadius: 5, padding: '8px 12px',
                boxShadow: active ? `0 1px 4px ${STATUS_COLOR[st]}22` : 'none',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: STATUS_COLOR[st], marginBottom: 3 }}>
                {STATUS_LABEL[st]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#3c4553', lineHeight: 1 }}>
                {(s?.count ?? 0).toLocaleString()}<span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> 건</span>
              </div>
              <div style={{ fontSize: 11, color: '#8a929c', marginTop: 3 }}>
                {(s?.supplyAmount ?? 0).toLocaleString()}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        <span style={{ color: STATUS_COLOR[status], fontWeight: 700 }}>{STATUS_LABEL[status]}</span>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        수량 <b style={{ color: '#3c4553', fontSize: 14 }}>{totals.qty.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        공급가액 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: '#1c6b32', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>발주일자 ▼</th>
            <th>납기</th>
            <th>발주번호</th>
            <th>매입처</th>
            <th>창고</th>
            <th>담당자</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? `${STATUS_LABEL[status]} 상태의 발주서가 없습니다.` : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace', color: r.dueDate ? '#5a626e' : '#c5cbd3' }}>{r.dueDate ?? '-'}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
              <td>{r.partner}</td>
              <td style={{ color: r.warehouse ? undefined : '#c5cbd3' }}>{r.warehouse || '-'}</td>
              <td style={{ color: r.employee ? undefined : '#c5cbd3' }}>{r.employee || '-'}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1c6b32' }}>{r.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.vat.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
