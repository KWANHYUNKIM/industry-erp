import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 생산관리 > 작업소요시간(BOR) — 공정 표준시간 기준 로트 소요시간 산출 (백엔드 /api/processes 연동) */
interface ProductionProcess {
  id: number
  code: string
  name: string
  workcenter: string | null
  stdTimeMin: number
  costPerHr: number
  active: boolean
}

export default function BorPage() {
  const [rows, setRows] = useState<ProductionProcess[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [lotSize, setLotSize] = useState('100')

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

  const lot = lotSize === '' ? 0 : Number(lotSize)
  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword) || (r.workcenter ?? '').includes(keyword))

  return (
    <EcListShell
      title="작업소요시간(BOR)"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 12.5, color: '#5a626e' }}>로트수량</label>
        <input type="number" step="any" className="ec-input" style={{ width: 120, textAlign: 'right' }} value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
        <span style={{ fontSize: 11.5, color: '#8a929c' }}>공정 표준시간 × 로트수량으로 총소요시간을 계산합니다.</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>공정코드</th>
            <th>공정명</th>
            <th>작업장</th>
            <th style={{ textAlign: 'right' }}>개당시간(분)</th>
            <th style={{ textAlign: 'right' }}>로트수량</th>
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
            const total = r.stdTimeMin * lot
            const h = Math.floor(total / 60)
            const m = total % 60
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
                <td>{r.name}</td>
                <td>{r.workcenter ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{r.stdTimeMin.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{lot.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{total.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{`${h}:${String(m).padStart(2, '0')}`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
