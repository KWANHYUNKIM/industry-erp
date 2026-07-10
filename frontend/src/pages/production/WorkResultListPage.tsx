import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 작업내역현황 — 공정별 작업 실적 및 불량률 현황 (백엔드 /api/work-results 연동) */
interface WorkResult {
  id: number
  workOrderId: number | null
  workOrderNo: string | null
  process: string
  worker: string | null
  goodQty: number
  defectQty: number
  workTimeMin: number
  workDate: string
  note: string | null
}

export default function WorkResultListPage() {
  const [rows, setRows] = useState<WorkResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<WorkResult[]>('/work-results')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || (r.workOrderNo ?? '').includes(keyword) || r.process.includes(keyword) || (r.worker ?? '').includes(keyword))
  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ good: s.good + r.goodQty, defect: s.defect + r.defectQty, time: s.time + r.workTimeMin }),
    { good: 0, defect: 0, time: 0 },
  ), [shown])
  const totalRate = totals.good + totals.defect > 0 ? ((totals.defect / (totals.good + totals.defect)) * 100).toFixed(1) : '0.0'

  return (
    <EcListShell
      title="작업내역현황"
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
            <th>작업지시번호</th>
            <th>공정</th>
            <th>작업자</th>
            <th style={{ textAlign: 'right' }}>양품</th>
            <th style={{ textAlign: 'right' }}>불량</th>
            <th style={{ textAlign: 'right' }}>작업시간(분)</th>
            <th style={{ textAlign: 'right' }}>불량률(%)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>작업내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const totalQty = r.goodQty + r.defectQty
            const rate = totalQty > 0 ? ((r.defectQty / totalQty) * 100) : 0
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.workDate}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? '-'}</td>
                <td>{r.process}</td>
                <td>{r.worker ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{r.goodQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.defectQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.workTimeMin.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: rate > 0 ? '#c60a2e' : undefined }}>{rate.toFixed(1)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginTop: 6, color: '#6b7280' }}>
        양품 <b>{totals.good.toLocaleString()}</b> · 불량 <b>{totals.defect.toLocaleString()}</b> · 작업시간 <b>{totals.time.toLocaleString()}</b>분 · 평균 불량률 <b>{totalRate}</b>%
      </div>
    </EcListShell>
  )
}
