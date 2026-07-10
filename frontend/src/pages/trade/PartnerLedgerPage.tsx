import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PartnerBalance } from '../../api/types'

/** 영업 > 거래처관리대장 — 거래처별 채권/채무 잔액 대장 (/api/ledger/partner-balances) */
export default function PartnerLedgerPage() {
  const [rows, setRows] = useState<PartnerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<PartnerBalance[]>('/ledger/partner-balances')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword))
  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ receivable: s.receivable + r.receivable, payable: s.payable + r.payable }),
    { receivable: 0, payable: 0 },
  ), [shown])

  return (
    <EcListShell title="거래처관리대장" search={keyword} onSearchChange={setKeyword} onSearch={load} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>거래처코드 ▼</th>
            <th>거래처명 ▼</th>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th style={{ textAlign: 'right' }}>채권(미수)</th>
            <th style={{ textAlign: 'right' }}>채무(미지급)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>거래처가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.partnerId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
              <td style={{ textAlign: 'center' }}>{r.typeName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.receivable > 0 ? 'var(--ec-blue)' : '#bbb' }}>{r.receivable.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.payable > 0 ? '#2f8401' : '#bbb' }}>{r.payable.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={4} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: 'var(--ec-blue)' }}>{totals.receivable.toLocaleString()}</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{totals.payable.toLocaleString()}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
