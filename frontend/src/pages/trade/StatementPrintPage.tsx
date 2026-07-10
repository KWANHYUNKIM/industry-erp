import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, SalesDoc } from '../../api/types'

/** 영업 > 거래명세서인쇄 — 거래처·기간별 판매 전표를 명세서 단위로 조회/인쇄 (/api/sales + /api/partners 연동) */
interface Row {
  id: number
  date: string
  statementNo: string
  partner: string
  itemCount: number
  supplyAmount: number
  vat: number
}

export default function StatementPrintPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [salesRes, partnerRes] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<Partner[]>('/partners'),
      ])
      setPartners(partnerRes.data)
      const mapped: Row[] = salesRes.data.map((d) => ({
        id: d.id,
        date: d.saleDate,
        statementNo: d.docNo,
        partner: d.partnerName,
        itemCount: d.lines.length,
        supplyAmount: d.supplyAmount,
        vat: d.vatAmount,
      }))
      mapped.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      setRows(mapped)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedPartner = partners.find((p) => p.id === partnerId)
  const shown = rows.filter((r) =>
    (!selectedPartner || r.partner === selectedPartner.name)
    && (!fromDate || r.date >= fromDate)
    && (!toDate || r.date <= toDate)
    && (!keyword || r.partner.includes(keyword) || r.statementNo.includes(keyword)))
  const total = useMemo(() => shown.reduce((s, r) => s + r.supplyAmount + r.vat, 0), [shown])

  return (
    <EcListShell
      title="거래명세서인쇄"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '인쇄', onClick: () => window.print() }, { label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5a626e' }}>거래처</span>
        <select
          className="ec-input"
          style={{ width: 200 }}
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">전체</option>
          {partners.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: '#5a626e', marginLeft: 6 }}>기간</span>
        <input type="date" className="ec-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <span style={{ color: '#9aa1ab' }}>~</span>
        <input type="date" className="ec-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th><th>명세서번호</th><th>거래처</th>
            <th style={{ textAlign: 'right' }}>품목수</th>
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th>
            <th style={{ textAlign: 'right' }}>합계</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>발행할 명세서가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const sum = r.supplyAmount + r.vat
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.statementNo}</td>
                <td>{r.partner}</td>
                <td style={{ textAlign: 'right' }}>{r.itemCount.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.supplyAmount.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.vat.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{sum.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
