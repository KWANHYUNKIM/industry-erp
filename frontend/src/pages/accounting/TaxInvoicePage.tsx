import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { TaxInvoice, TaxInvoiceStatus, TaxInvoiceType } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const won = (n: number) => n.toLocaleString('ko-KR')
const firstOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => ymd(new Date())

const STATUS_TABS = ['전체', '작성', '발행', '전송', '승인'] as const
type Tab = (typeof STATUS_TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, TaxInvoiceStatus> = {
  작성: 'DRAFT', 발행: 'ISSUED', 전송: 'SENT', 승인: 'APPROVED',
}
const statusColor = (s: TaxInvoiceStatus) =>
  s === 'APPROVED' ? '#1c7c3c' : s === 'SENT' ? '#1a4d8f' : s === 'ISSUED' ? 'var(--ec-blue)' : '#8a929c'
const NEXT_LABEL: Record<TaxInvoiceStatus, string | null> = {
  DRAFT: '발행', ISSUED: '전송', SENT: '승인', APPROVED: null,
}

/** (세금)계산서진행단계 — 매출/매입 세금계산서를 작성→발행→전송→승인으로 진행. */
export default function TaxInvoicePage({ type }: { type: TaxInvoiceType }) {
  const [rows, setRows] = useState<TaxInvoice[]>([])
  const [from, setFrom] = useState(firstOfYear())
  const [to, setTo] = useState(today())
  const [tab, setTab] = useState<Tab>('전체')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const title = type === 'SALES' ? '매출 세금계산서' : '매입 세금계산서'

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<TaxInvoice[]>('/tax-invoices', { params: { type, from, to } })
      .then((r) => setRows(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    load()
    setTab('전체')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  async function advance(t: TaxInvoice) {
    try {
      await api.post(`/tax-invoices/${t.id}/advance`)
      flash(`${t.invoiceNo} → ${NEXT_LABEL[t.status]}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function remove(t: TaxInvoice) {
    if (!window.confirm(`${t.invoiceNo} 세금계산서를 삭제할까요?`)) return
    try {
      await api.delete(`/tax-invoices/${t.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = useMemo(() => rows.filter((r) => tab === '전체' || r.status === TAB_STATUS[tab]), [rows, tab])
  const tabCount = (t: Tab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length
  const totals = shown.reduce((a, r) => ({ supply: a.supply + r.supplyAmount, vat: a.vat + r.vatAmount, total: a.total + r.totalAmount }), { supply: 0, vat: 0, total: 0 })

  const reset = () => { setFrom(firstOfYear()); setTo(today()) }

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS}
        dateLabel="기간"
      />

      <p style={{ marginBottom: 8, fontSize: 12, color: '#9aa1ab' }}>
        {type === 'SALES' ? '판매조회 화면에서 발행합니다.' : '구매조회 화면에서 발행합니다.'}
      </p>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>계산서번호</th><th>발행일</th><th>거래처</th><th>근거전표</th>
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>세액</th><th style={{ textAlign: 'right' }}>합계</th>
            <th style={{ textAlign: 'center' }}>진행단계</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{r.invoiceNo}</td>
              <td>{dateText(r.issueDate)}</td>
              <td>{r.partnerName}</td>
              <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{r.sourceDocNo}</td>
              <td style={{ textAlign: 'right' }}>{won(r.supplyAmount)}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.vatAmount)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.totalAmount)}</td>
              <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(r.status), fontWeight: 600 }}>{r.statusName}</span></td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', gap: 3 }}>
                  {NEXT_LABEL[r.status] && (
                    <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => advance(r)}>{NEXT_LABEL[r.status]}</button>
                  )}
                  {r.status !== 'APPROVED' && (
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right' }}>{won(totals.supply)}</td>
            <td style={{ textAlign: 'right' }}>{won(totals.vat)}</td>
            <td style={{ textAlign: 'right' }}>{won(totals.total)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
