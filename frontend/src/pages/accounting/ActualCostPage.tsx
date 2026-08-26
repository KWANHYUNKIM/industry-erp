import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useInactiveItems } from '../../utils/useInactiveItems'

/**
 * 회계 > 실제원가현황 (/api/costs)
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 원가집계표 | 증가내역 | 감소내역 | 수율차이 | 노무비배부액 | 경비배부액
 *   기준월 · 품목 · 생산공정 · [기타] 결재방표시 · 수량관리제외품목포함 · <b>사용중단품목포함</b>
 *
 * <p>[구분]의 여섯 갈래는 증감내역·수율·배부액 자료가 있어야 하는데 우리에겐 아직 없다.
 * 지금 만든 것은 그중 '원가집계표' 하나에 해당한다. 조건 중 우리 자료로 실제 거를 수 있는
 * 기준월·품목·사용중단품목포함만 둔다.
 */
interface Cost {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  period: string
  actualMaterial: number
  actualLabor: number
  actualOverhead: number
  actualTotal: number
}

export default function ActualCostPage() {
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
  const total = useMemo(() => shown.reduce((s, r) => s + r.actualTotal, 0), [shown])

  return (
    <EcListShell title="실제원가현황" search={keyword} onSearchChange={setKeyword}
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
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 90 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ width: 80 }}>기간</th>
            <th style={{ textAlign: 'right' }}>실제재료비</th>
            <th style={{ textAlign: 'right' }}>실제노무비</th>
            <th style={{ textAlign: 'right' }}>실제경비</th>
            <th style={{ textAlign: 'right' }}>실제원가</th>
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
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.period}</td>
              <td style={{ textAlign: 'right' }}>{r.actualMaterial.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.actualLabor.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.actualOverhead.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.actualTotal.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
