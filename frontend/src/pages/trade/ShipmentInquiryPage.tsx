import { useEffect, useMemo, useState, Fragment } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/**
 * 영업 > 출하조회 (E040226) — 전표(출하) 단위 조회. 행 클릭 시 품목 상세 펼침.
 * 판매조회/구매조회(TradeInquiryPage)의 출하판. 출하현황(ShipmentPage)이 상태 집계 뷰라면
 * 이 화면은 기준일자 범위·발송여부 검색폼 + 라인 상세를 가진 전표 조회다.
 * 백엔드 무변경 — `/shipments` 가 이미 라인까지 반환한다.
 * 원본 Search 패널의 창고·프로젝트·관리항목은 Shipment 엔티티에 필드가 없어 의도적 제외(구매현황 선례).
 */
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
const STATUS_COLOR: Record<ShipStatus, string> = { READY: '#b6791b', SHIPPED: '#1c7c3c', CANCELED: '#8a929c' }

interface ShipLine { itemCode: string; itemName: string; unit: string; quantity: number; unitPrice: number; amount: number }
interface Shipment {
  id: number; shipNo: string; partnerName: string; shipDate: string
  salesOrderNo: string | null
  status: ShipStatus; statusName: string; totalQuantity: number; totalAmount: number
  remark: string | null; createdBy: string | null; lines: ShipLine[]
}

// 이카운트 출하조회 '발송여부' 필터 = 우리 상태로 매핑.
const SEND_TABS = ['전체', '미발송', '발송', '취소'] as const
type SendTab = (typeof SEND_TABS)[number]
const TAB_STATUS: Record<Exclude<SendTab, '전체'>, ShipStatus> = { 미발송: 'READY', 발송: 'SHIPPED', 취소: 'CANCELED' }

const won = (n: number) => n.toLocaleString('ko-KR')

export default function ShipmentInquiryPage() {
  const [rows, setRows] = useState<Shipment[]>([])
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState<SendTab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true); setError('')
    api.get<Shipment[]>('/shipments')
      .then((res) => setRows(res.data))
      .catch((err) => { setError(extractErrorMessage(err)); setRows([]) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => rows
    .filter((r) => tab === '전체' || r.status === TAB_STATUS[tab])
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.shipNo.includes(keyword) || r.lines.some((l) => l.itemName.includes(keyword)))
    .filter((r) => !from || r.shipDate >= from)
    .filter((r) => !to || r.shipDate <= to)
    .sort((a, b) => b.shipDate.localeCompare(a.shipDate) || b.id - a.id), [rows, keyword, from, to, tab])

  const tabCount = (t: SendTab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length
  const totals = useMemo(() => shown.reduce((a, r) => ({ qty: a.qty + r.totalQuantity, amount: a.amount + r.totalAmount }), { qty: 0, amount: 0 }), [shown])

  return (
    <EcListShell title="출하조회" search={keyword} onSearchChange={setKeyword} onSearch={load} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기준일자</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>총 {shown.length}건 · 행을 클릭하면 품목 상세가 펼쳐집니다.</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {SEND_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent',
            color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({tabCount(t)})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>출하번호 ▼</th><th>출하일 ▼</th><th style={{ width: 130 }}>근거주문</th><th>거래처 ▼</th><th>품목</th>
            <th style={{ textAlign: 'right' }}>출하수량</th><th style={{ textAlign: 'right' }}>출하금액</th>
            <th style={{ textAlign: 'center' }}>발송여부</th><th>담당</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조회 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <Fragment key={r.id}>
              <tr onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{openId === r.id ? '▾ ' : '▸ '}{r.shipNo}</td>
                <td>{r.shipDate}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: r.salesOrderNo ? 'var(--ec-blue-dark)' : '#b6bcc4' }}>{r.salesOrderNo ?? '직접등록'}</td>
                <td>{r.partnerName}</td>
                <td>{r.lines[0]?.itemName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
                <td style={{ textAlign: 'right' }}>{won(r.totalQuantity)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
                <td style={{ textAlign: 'center', color: STATUS_COLOR[r.status], fontWeight: 700 }}>{r.statusName}</td>
                <td>{r.createdBy ?? ''}</td>
              </tr>
              {openId === r.id && (
                <tr className="no-ec">
                  <td colSpan={10} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr><th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>금액</th></tr>
                      </thead>
                      <tbody>
                        {r.lines.map((l, li) => (
                          <tr key={li}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{li + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.remark && <div style={{ padding: '2px 10px 8px', fontSize: 12, color: '#5a626e' }}>비고: {r.remark}</div>}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right' }}>{won(totals.qty)}</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
