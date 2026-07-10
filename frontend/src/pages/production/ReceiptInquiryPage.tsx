import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 생산입고조회 — 완제품 생산입고 내역 조회 (/api/productions 연동) */
interface Row {
  id: number
  prodNo: string
  workOrderNo: string
  productCode: string
  productName: string
  productUnit: string
  warehouseName: string
  producedQty: number
  productionDate: string
}

export default function ReceiptInquiryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Row[]>('/productions')
      setRows([...res.data].sort((a, b) => (a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.productName.includes(keyword) || r.prodNo.includes(keyword) || r.workOrderNo.includes(keyword))

  return (
    <EcListShell
      title="생산입고조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th>
            <th>입고번호</th>
            <th>작업지시번호</th>
            <th>완제품명</th>
            <th style={{ textAlign: 'right' }}>입고수량</th>
            <th>단위</th>
            <th>입고창고</th>
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
              <td style={{ fontFamily: 'monospace' }}>{r.productionDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.prodNo}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo}</td>
              <td>[{r.productCode}] {r.productName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.producedQty.toLocaleString()}</td>
              <td>{r.productUnit}</td>
              <td>{r.warehouseName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
