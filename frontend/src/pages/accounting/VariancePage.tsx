import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useInactiveItems } from '../../utils/useInactiveItems'

/** 회계 > 원가차이분석 (실제 연동: /api/costs) */
interface Cost {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  period: string
  standardTotal: number
  actualTotal: number
  variance: number
  varianceRate: number
}

export default function VariancePage() {
  const [rows, setRows] = useState<Cost[]>([])
  const [keyword, setKeyword] = useState('')
  const [period, setPeriod] = useState('전체')
  const [withInactive, setWithInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const inactive = useInactiveItems()

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Cost[]>('/costs')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const periods = useMemo(() => Array.from(new Set(rows.map((r) => r.period))), [rows])
  const shown = rows
    .filter((r) => period === '전체' || r.period === period)
    .filter((r) => !keyword || r.itemName.includes(keyword) || r.itemCode.includes(keyword))
    .filter((r) => withInactive || !inactive.has(r.itemId))
  const total = useMemo(() => shown.reduce((s, r) => s + r.variance, 0), [shown])

  return (
    <EcListShell title="원가차이분석" search={keyword} onSearchChange={setKeyword}
      newLabel="새로고침" onNew={load} actions={[{ label: 'Excel' }]}>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준월">
          <select className="ec-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 140 }}>
            <option>전체</option>
            {periods.map((p) => <option key={p}>{p}</option>)}
          </select>
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단품목포함
          </label>
        </EcCond>
      </ul>
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        품목 <b style={{ color: '#3c4553' }}>{shown.length}</b>개
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        <span>
          차이합계 <b style={{ color: total > 0 ? '#c60a2e' : total < 0 ? '#1c7c3c' : 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 90 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ width: 80 }}>기간</th>
            <th style={{ textAlign: 'right' }}>표준원가</th>
            <th style={{ textAlign: 'right' }}>실제원가</th>
            <th style={{ textAlign: 'right' }}>차이금액</th>
            <th style={{ textAlign: 'right' }}>차이율(%)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const color = r.variance > 0 ? '#c60a2e' : r.variance < 0 ? '#1c7c3c' : undefined
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.period}</td>
                <td style={{ textAlign: 'right' }}>{r.standardTotal.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.actualTotal.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color }}>{r.variance.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color }}>{r.varianceRate}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
