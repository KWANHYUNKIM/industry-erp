import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { PartnerBalance } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')

export default function LedgerPage() {
  const [rows, setRows] = useState<PartnerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<PartnerBalance[]>('/ledger/partner-balances')
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const totalReceivable = rows.reduce((a, r) => a + r.receivable, 0)
  const totalPayable = rows.reduce((a, r) => a + r.payable, 0)

  return (
    <EcListShell title="거래처별 채권·채무 현황" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      {/* 요약 박스 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#f7f9ff', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--ec-blue-dark)' }}>총 채권 (받을 돈)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ec-blue)' }}>{won(totalReceivable)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
        </div>
        <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#f4faf5', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#1c6b32' }}>총 채무 (줄 돈)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2f8401' }}>{won(totalPayable)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>거래처코드 ▼</th>
            <th>상호 ▼</th>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th style={{ textAlign: 'right' }}>채권 (외상매출금)</th>
            <th style={{ textAlign: 'right' }}>채무 (외상매입금)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>거래처가 없습니다.</td></tr>
          ) : rows.map((r, idx) => (
            <tr key={r.partnerId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
              <td style={{ textAlign: 'center' }}>{r.typeName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.receivable > 0 ? 'var(--ec-blue)' : '#bbb' }}>{won(r.receivable)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.payable > 0 ? '#2f8401' : '#bbb' }}>{won(r.payable)}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={4} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totalReceivable)}</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{won(totalPayable)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      <p style={{ marginTop: 10, fontSize: 11.5, color: '#9aa1ab' }}>
        ※ 채권 = 판매 합계, 채무 = 구매 합계. 수금/지급은 「거래처별 수금/지급(정산)」 화면에서 처리합니다.
      </p>
    </EcListShell>
  )
}
