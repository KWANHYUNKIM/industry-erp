import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 재고 II > 수출관리 — 판매 전표를 수출 오더 관점으로 조회 (/api/sales 연동)
 *  별도 수출 스키마가 없어 판매 전표(docNo→Invoice, 거래처→Buyer)를 수출 뷰로 표시하고,
 *  진행상태는 판매일 경과에 따라 오더→통관진행→선적완료→입금완료로 표시한다. */
type Status = '오더' | '통관진행' | '선적완료' | '입금완료'

interface SalesLine { itemName: string; quantity: number }
interface SalesDoc {
  id: number
  docNo: string
  partnerName: string
  warehouseName: string
  saleDate: string
  totalAmount: number
  lines: SalesLine[]
}

const statusColor = (s: Status) => ({ 오더: '#c07a00', 통관진행: 'var(--ec-blue)', 선적완료: '#7a5cc0', 입금완료: '#1c7c3c' }[s])

function deriveStatus(saleDate: string): Status {
  const days = Math.floor((Date.now() - new Date(saleDate).getTime()) / 86400000)
  if (days <= 0) return '오더'
  if (days <= 3) return '통관진행'
  if (days <= 7) return '선적완료'
  return '입금완료'
}

export default function ExportPage() {
  const [docs, setDocs] = useState<SalesDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesDoc[]>('/sales')
      const list = [...res.data].sort((a, b) => (a.saleDate < b.saleDate ? 1 : a.saleDate > b.saleDate ? -1 : 0))
      setDocs(list)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = docs.filter((d) => !keyword || d.partnerName.includes(keyword) || d.docNo.includes(keyword))
  const total = useMemo(() => shown.reduce((s, d) => s + d.totalAmount, 0), [shown])

  return (
    <EcListShell
      title="수출관리"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Commercial Invoice' }, { label: 'Packing List' }, { label: '수출신고필증' }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b> 원
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>Invoice No. ▼</th>
            <th style={{ width: 100 }}>일자 ▼</th>
            <th>Buyer ▼</th>
            <th style={{ width: 120 }}>출고창고</th>
            <th style={{ width: 70, textAlign: 'right' }}>품목수</th>
            <th style={{ width: 130, textAlign: 'right' }}>금액(KRW)</th>
            <th style={{ width: 90, textAlign: 'center' }}>상태 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>수출 내역이 없습니다.</td></tr>
          ) : shown.map((d, i) => {
            const status = deriveStatus(d.saleDate)
            return (
              <tr key={d.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
                <td style={{ fontFamily: 'monospace' }}>{d.saleDate}</td>
                <td>{d.partnerName}</td>
                <td>{d.warehouseName}</td>
                <td style={{ textAlign: 'right' }}>{d.lines.length.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{d.totalAmount.toLocaleString()}</td>
                <td style={{ textAlign: 'center', color: statusColor(status), fontWeight: 700 }}>{status}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
