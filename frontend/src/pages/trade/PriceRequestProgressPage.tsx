import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'

/**
 * 구매관리 > 단가요청진행단계 (이카운트 E040323)
 * 단가요청(=발주 파이프라인 문서)이 지금 어느 단계인지 문서 단위로 추적한다.
 * 발주요청→발주계획→단가확정→발주확정→입고전환 스테퍼로 현재 단계를 표시.
 * 단가요청현황(PurchaseRequestStatusPage)이 '상태별로 묶어 라인 목록'을 보여주는 반면,
 * 이 화면은 '문서 하나가 파이프라인 어디까지 왔나'를 한 줄로 본다.
 * 백엔드 무변경(GET /api/purchase-orders). 원본의 수취금액·이력 컬럼은 별도 추적 테이블이
 * 없어 제외(확정금액=현재 전표금액만), 구매현황 선례와 동일한 의도적 제외.
 */
const PIPELINE: PurchaseOrderStatus[] = ['REQUESTED', 'PLANNED', 'PRICED', 'ORDERED', 'RECEIVED']
const LABEL: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '발주요청', PLANNED: '발주계획', PRICED: '단가확정',
  ORDERED: '발주확정', RECEIVED: '입고전환', CANCELLED: '취소',
}
const COLOR: Record<PurchaseOrderStatus, string> = {
  REQUESTED: '#c07a00', PLANNED: '#8a929c', PRICED: '#7a5bb5',
  ORDERED: 'var(--ec-blue)', RECEIVED: '#1c7c3c', CANCELLED: '#c60a2e',
}
const won = (n: number) => n.toLocaleString('ko-KR')

/** 문서의 파이프라인 진행 위치를 점으로 표시. 취소는 별도 표기. */
function Stepper({ status }: { status: PurchaseOrderStatus }) {
  if (status === 'CANCELLED') return <span style={{ color: COLOR.CANCELLED, fontWeight: 700 }}>취소됨</span>
  const idx = PIPELINE.indexOf(status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {PIPELINE.map((st, i) => (
        <span key={st} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span title={LABEL[st]} style={{
            width: 9, height: 9, borderRadius: '50%',
            background: i <= idx ? COLOR[status] : '#e2e6eb',
            border: i === idx ? `2px solid ${COLOR[status]}` : 'none',
            boxSizing: 'content-box',
          }} />
          {i < PIPELINE.length - 1 && <span style={{ width: 14, height: 2, background: i < idx ? COLOR[status] : '#e2e6eb' }} />}
        </span>
      ))}
      <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: COLOR[status] }}>{LABEL[status]}</span>
    </div>
  )
}

export default function PriceRequestProgressPage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [statusFilter, setStatusFilter] = useState<'ALL' | PurchaseOrderStatus>('ALL')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try { setRows((await api.get<PurchaseOrder[]>('/purchase-orders')).data) }
    catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => rows
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.orderNo.includes(keyword) || r.lines.some((l) => l.itemName.includes(keyword)))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.id - a.id),
  [rows, statusFilter, keyword])

  /*
   * 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. 머리를 안 누른 동안은 위의 기본 차례
   * (요청일 내림차순)를 그대로 쓴다.
   */
  const sort = useTableSort(shown, {
    단가요청번호: (r) => r.orderNo,
    요청일: (r) => r.orderDate,
  })

  const count = (s: 'ALL' | PurchaseOrderStatus) => (s === 'ALL' ? rows.length : rows.filter((r) => r.status === s).length)
  const totalAmount = useMemo(() => shown.reduce((a, r) => a + r.totalAmount, 0), [shown])

  return (
    <EcListShell title="단가요청진행단계" search={keyword} onSearchChange={setKeyword} onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['ALL', ...PIPELINE, 'CANCELLED'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: statusFilter === s ? 'var(--ec-blue)' : '#fff', color: statusFilter === s ? '#fff' : '#3a4453', fontWeight: statusFilter === s ? 700 : 400,
          }}>{s === 'ALL' ? '전체' : LABEL[s]} ({count(s)})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12.5, color: '#5a626e' }}>
          확정금액 합계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totalAmount)}</b>
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('단가요청번호')}>단가요청번호 {sort.mark('단가요청번호')}</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('요청일')}>요청일 {sort.mark('요청일')}</th><th>거래처</th><th>품목</th>
            <th style={{ width: 320 }}>진행단계</th>
            <th style={{ textAlign: 'right' }}>확정금액</th><th>담당</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue-dark)', fontWeight: 600 }}>{r.orderNo}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderDate}</td>
              <td>{r.partnerName}</td>
              <td>{r.lines[0]?.itemName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
              <td><Stepper status={r.status} /></td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
              <td>{r.employeeName ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
