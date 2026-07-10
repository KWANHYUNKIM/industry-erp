import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 소요시간계산 — 공정별 표준시간 × 생산수량 기준 총 소요시간 산출 (/api/processes 연동) */
interface ProductionProcess {
  id: number
  code: string
  name: string
  workcenter: string | null
  stdTimeMin: number
  costPerHr: number
  active: boolean
}

export default function TimeCalcPage() {
  const [rows, setRows] = useState<ProductionProcess[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [qtyMap, setQtyMap] = useState<Record<number, string>>({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<ProductionProcess[]>('/processes')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword))
  const grandTotal = shown.reduce((s, r) => s + (r.stdTimeMin ?? 0) * (Number(qtyMap[r.id]) || 0), 0)

  return (
    <EcListShell
      title="소요시간계산"
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
            <th>공정코드</th>
            <th>공정명</th>
            <th>작업장</th>
            <th style={{ textAlign: 'right', width: 120 }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>표준시간(분)</th>
            <th style={{ textAlign: 'right' }}>총소요시간(분)</th>
            <th style={{ textAlign: 'right' }}>소요시간(HH:MM)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 공정이 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const qty = Number(qtyMap[r.id]) || 0
            const total = Math.round((r.stdTimeMin ?? 0) * qty)
            const h = Math.floor(total / 60)
            const m = total % 60
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
                <td>{r.name}</td>
                <td>{r.workcenter ?? ''}</td>
                <td style={{ textAlign: 'right' }}>
                  <input
                    type="number"
                    min={0}
                    className="ec-input"
                    style={{ width: 100, textAlign: 'right' }}
                    value={qtyMap[r.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => setQtyMap({ ...qtyMap, [r.id]: e.target.value })}
                  />
                </td>
                <td style={{ textAlign: 'right' }}>{r.stdTimeMin.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{total.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{`${h}:${String(m).padStart(2, '0')}`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginTop: 6, color: '#6b7280' }}>
        총 소요시간 합계: <b>{grandTotal.toLocaleString()}</b> 분
      </div>
    </EcListShell>
  )
}
