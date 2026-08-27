import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useItemFlags } from '../../utils/useInactiveItems'

/**
 * 회계 > 표준원가현황 (/api/costs)
 *
 * <p>원본 조건 판 실측(사본):
 *   기준월 · 품목 · 생산공정 · [기타] 결재방표시 · 수량관리제외품목포함 ·
 *   <b>사용중단품목포함</b> · <b>단가0포함</b> · 정렬/소계기준 · <b>합계표시</b>
 * 우리는 기간 드롭다운 하나가 전부였고, 사용중단 품목과 원가 0 인 품목이 늘 섞여 나왔다.
 * 원본은 그 둘을 <b>기본으로 빼고</b> 보여 준다 — 체크를 켜야 나온다.
 *
 * <p>[수량관리제외품목포함]은 예전에 "우리 원가에 그 값이 없어" 만들지 않았는데,
 * 품목이 이제 재고수량관리를 든다. 재고를 잡지 않는 품목(용역·운반비)에 표준원가를
 * 매기는 것은 뜻이 없어 기본으로 뺀다 — 원본도 그렇다.
 *
 * <p>생산공정·결재방표시는 여전히 우리 원가에 그 값이 없어 칸을 만들지 않는다.
 */
interface Cost {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  period: string
  materialCost: number
  laborCost: number
  overheadCost: number
  standardTotal: number
}

export default function StandardCostPage() {
  const [rows, setRows] = useState<Cost[]>([])
  const [keyword, setKeyword] = useState('')
  const [period, setPeriod] = useState('전체')
  const [withInactive, setWithInactive] = useState(false)
  const [withZero, setWithZero] = useState(false)
  const [showTotal, setShowTotal] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { inactive, untracked } = useItemFlags()
  /**
   * 원본 조건 판 [기타]의 <b>수량관리제외품목포함</b>. 기본은 꺼져 있다 —
   * 재고를 잡지 않는 품목(용역·운반비)에 표준원가를 매기는 것은 뜻이 없어서,
   * 원본도 체크를 켜야 보여 준다.
   */
  const [withUntracked, setWithUntracked] = useState(false)

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
    .filter((r) => withUntracked || !untracked.has(r.itemId))
    .filter((r) => withZero || r.standardTotal !== 0)
  const total = useMemo(() => shown.reduce((s, r) => s + r.standardTotal, 0), [shown])

  return (
    <EcListShell title="표준원가현황" search={keyword} onSearchChange={setKeyword}
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
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} />
            수량관리제외품목포함
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withZero} onChange={(e) => setWithZero(e.target.checked)} />
            단가0포함
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showTotal} onChange={(e) => setShowTotal(e.target.checked)} />
            합계표시
          </label>
        </EcCond>
      </ul>
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        품목 <b style={{ color: '#3c4553' }}>{shown.length}</b>개
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString('ko-KR')}</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 90 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ width: 80 }}>기간</th>
            <th style={{ textAlign: 'right' }}>표준재료비</th>
            <th style={{ textAlign: 'right' }}>표준노무비</th>
            <th style={{ textAlign: 'right' }}>표준경비</th>
            <th style={{ textAlign: 'right' }}>표준원가</th>
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
              <td style={{ textAlign: 'right' }}>{r.materialCost.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.laborCost.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.overheadCost.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.standardTotal.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        {showTotal && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({shown.length}품목)</td>
              <td style={{ textAlign: 'right' }}>{shown.reduce((n, r) => n + r.materialCost, 0).toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right' }}>{shown.reduce((n, r) => n + r.laborCost, 0).toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right' }}>{shown.reduce((n, r) => n + r.overheadCost, 0).toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{total.toLocaleString('ko-KR')}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
