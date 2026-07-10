import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 영업 > 결제내역조회 — 거래처별 수금/지급 결제 이력 조회 (/api/settlements 연동) */
interface SettlementRow {
  id: number
  docNo: string
  typeName: string // 수금 | 지급
  partnerName: string
  settleDate: string
  amount: number
  method: string | null
  note: string | null
}

export default function PaymentHistoryPage() {
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SettlementRow[]>('/settlements')
      const list = [...res.data].sort((a, b) => (a.settleDate < b.settleDate ? 1 : a.settleDate > b.settleDate ? -1 : 0))
      setRows(list)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.partnerName.includes(keyword) || r.docNo.includes(keyword))
  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])

  return (
    <EcListShell title="결제내역조회" search={keyword} onSearchChange={setKeyword} onSearch={load} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b></div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th><th>전표번호</th><th>거래처</th>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th>결제수단</th>
            <th style={{ textAlign: 'right' }}>금액</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.settleDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
              <td>{r.partnerName}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.typeName === '수금' ? '#1c7c3c' : '#c60a2e' }}>{r.typeName}</td>
              <td>{r.method ?? '-'}</td>
              <td style={{ textAlign: 'right' }}>{r.amount.toLocaleString()}</td>
              <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
