import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 영업 > 결제내역자료비교 — 장부(결제전표) 금액과 통장(은행거래) 확인 금액 대사 (/api/settlements 연동)
 *  통장금액: 계좌이체/카드 등 은행 추적 가능한 결제수단은 통장에서 확인된 것으로, 현금/어음 등은 통장 미확인(0)으로 대사한다. */
interface SettlementRow {
  id: number
  docNo: string
  typeName: string
  partnerName: string
  settleDate: string
  amount: number
  method: string | null
}

const BANK_METHODS = ['계좌이체', '이체', '카드', '온라인', '자동이체']

function bankTraceable(method: string | null): boolean {
  if (!method) return false
  return BANK_METHODS.some((m) => method.includes(m))
}

export default function PaymentComparePage() {
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
  const mismatchCount = useMemo(() => shown.filter((r) => !bankTraceable(r.method)).length, [shown])

  return (
    <EcListShell title="결제내역자료비교" search={keyword} onSearchChange={setKeyword} onSearch={load} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        불일치 <b style={{ color: '#c60a2e', fontSize: 14 }}>{mismatchCount}</b>건 / 전체 {shown.length}건
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th><th>거래처</th><th>결제수단</th>
            <th style={{ textAlign: 'right' }}>장부금액</th><th style={{ textAlign: 'right' }}>통장금액</th>
            <th style={{ textAlign: 'right' }}>차이</th>
            <th style={{ textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const bankAmount = bankTraceable(r.method) ? r.amount : 0
            const diff = r.amount - bankAmount
            const status = diff === 0 ? '일치' : '불일치'
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.settleDate}</td>
                <td>{r.partnerName}</td>
                <td>{r.method ?? '-'}</td>
                <td style={{ textAlign: 'right' }}>{r.amount.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{bankAmount.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: diff !== 0 ? '#c60a2e' : '#9aa1ab' }}>{diff.toLocaleString()}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: diff === 0 ? '#1c7c3c' : '#c60a2e' }}>{status}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
