import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 생산관리 > 생산불출현황 — 자재별 불출 집계 (백엔드 /api/material-issues 연동) */
interface MaterialIssue {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  qty: number
  issueDate: string
}

interface Agg {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  count: number
  totalQty: number
  lastDate: string
}

export default function IssueStatusPage() {
  const [rows, setRows] = useState<MaterialIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<MaterialIssue[]>('/material-issues')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const aggregated = useMemo<Agg[]>(() => {
    const map = new Map<number, Agg>()
    for (const r of rows) {
      const cur = map.get(r.itemId)
      if (cur) {
        cur.count += 1
        cur.totalQty += r.qty
        if (r.issueDate > cur.lastDate) cur.lastDate = r.issueDate
      } else {
        map.set(r.itemId, { itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, unit: r.unit, count: 1, totalQty: r.qty, lastDate: r.issueDate })
      }
    }
    return [...map.values()].sort((a, b) => b.totalQty - a.totalQty)
  }, [rows])

  const shown = aggregated.filter((r) => !keyword || r.itemName.includes(keyword) || r.itemCode.includes(keyword))
  const grandTotal = useMemo(() => shown.reduce((s, r) => s + r.totalQty, 0), [shown])

  return (
    <EcListShell
      title="생산불출현황"
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
            <th>자재코드</th>
            <th>자재명</th>
            <th>단위</th>
            <th style={{ textAlign: 'right' }}>불출건수</th>
            <th style={{ textAlign: 'right' }}>총불출수량</th>
            <th>최근불출일</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불출내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.itemId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td>{r.unit}</td>
              <td style={{ textAlign: 'right' }}>{r.count.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.totalQty.toLocaleString()}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.lastDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginTop: 6, color: '#6b7280' }}>
        총 불출수량 합계: <b>{grandTotal.toLocaleString()}</b>
      </div>
    </EcListShell>
  )
}
