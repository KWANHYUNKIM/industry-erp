import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { StockRow, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'

/**
 * 재고 I > 기타이동 > 재고실사 (이카운트 E040612 단계별재고실사)
 * 창고를 골라 장부수량을 불러오고, 품목별 실사수량을 입력해 **차이만큼 재고조정(ADJUST)** 을 일괄 생성한다.
 *
 * 백엔드 무변경 — 기존 것만 조합한다:
 *   GET /api/stock                → 창고별 장부수량(StockRow)
 *   POST /api/stock-adjustments   → { type:'ADJUST', itemId, warehouseId, actualQty } 로 실사수량에 맞춰 조정
 *     (StockAdjustmentService 가 ADJUST 를 stockService.adjustTo(actualQty) 로 처리 → 차이만큼 증감)
 * 생성된 조정 내역은 기타이동 화면의 '재고조정' 탭에서 확인된다.
 *
 * 원본 Search 패널은 창고·담당자뿐. 담당자는 조정에 별도 필드가 없어(작성자로만 남음) 제외한다.
 */
const today = () => new Date().toISOString().slice(0, 10)
const num = (n: number) => n.toLocaleString('ko-KR')

interface CountRow extends StockRow {
  counted: string          // 실사수량 입력값(문자열; 빈값 = 미실사)
}

export default function StocktakePage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<number | ''>('')
  const [rows, setRows] = useState<CountRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [diffOnly, setDiffOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    api.get<Warehouse[]>('/warehouses')
      .then((r) => {
        setWarehouses(r.data)
        if (r.data.length > 0) setWarehouseId(r.data[0].id)
      })
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  // 창고를 고르면 그 창고의 장부수량을 불러와 실사표 초기화
  async function loadStock(wid: number) {
    setLoading(true); setError(''); setOk('')
    try {
      const res = await api.get<StockRow[]>('/stock')
      setRows(res.data.filter((s) => s.warehouseId === wid).map((s) => ({ ...s, counted: '' })))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (warehouseId !== '') loadStock(warehouseId) }, [warehouseId])

  const setCount = (itemId: number, v: string) =>
    setRows((rs) => rs.map((r) => (r.itemId === itemId ? { ...r, counted: v } : r)))

  const diffOf = (r: CountRow): number | null =>
    r.counted.trim() === '' ? null : Number(r.counted) - r.quantity

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (kw && !r.itemName.includes(kw) && !r.itemCode.includes(kw)) return false
      if (diffOnly) { const d = diffOf(r); if (d === null || d === 0) return false }
      return true
    })
  }, [rows, keyword, diffOnly])

  // 실사수량이 입력되고 장부와 다른 행 = 조정 대상
  const targets = useMemo(
    () => rows.filter((r) => { const d = diffOf(r); return d !== null && d !== 0 && !Number.isNaN(d) }),
    [rows],
  )
  const countedCount = useMemo(() => rows.filter((r) => r.counted.trim() !== '').length, [rows])

  async function apply() {
    if (warehouseId === '') return
    if (targets.length === 0) { setError('차이가 있는 실사수량이 없습니다.'); return }
    setSaving(true); setError(''); setOk('')
    try {
      const date = today()
      for (const r of targets) {
        await api.post('/stock-adjustments', {
          type: 'ADJUST',
          itemId: r.itemId,
          warehouseId,
          actualQty: Number(r.counted),
          adjustDate: date,
          reason: `재고실사 (${date})`,
        })
      }
      setOk(`${targets.length}개 품목 실사 조정 반영 완료`)
      await loadStock(warehouseId)      // 반영 후 장부수량 재조회(=실사수량으로 맞춰짐)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <EcListShell
      title="재고실사"
      search={keyword}
      onSearchChange={setKeyword}
      actions={[{ label: '새로고침', onClick: () => warehouseId !== '' && loadStock(warehouseId) }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {ok && <p style={{ marginBottom: 8, background: '#eafaef', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{ok}</p>}

      {/* 실사 대상 선택 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>실사창고</span>
        <select
          className="ec-input"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ width: 200 }}
        >
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <label style={{ fontSize: 12.5, color: '#3c4553', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginLeft: 8 }}>
          <input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} />
          차이만 보기
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: '#5a626e' }}>
            실사 입력 <b style={{ color: '#3c4553' }}>{countedCount}</b>
            <span style={{ margin: '0 6px', color: '#c5cbd3' }}>|</span>
            차이 <b style={{ color: targets.length > 0 ? '#c07a00' : '#3c4553' }}>{targets.length}</b>
          </span>
          <button
            className="ec-btn ec-btn-primary"
            disabled={saving || targets.length === 0}
            onClick={apply}
            style={{ opacity: saving || targets.length === 0 ? 0.5 : 1 }}
          >
            {saving ? '반영 중…' : `실사 조정 반영 (${targets.length})`}
          </button>
        </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th>규격</th>
            <th style={{ textAlign: 'center' }}>단위</th>
            <th style={{ textAlign: 'right' }}>장부수량</th>
            <th style={{ textAlign: 'right', width: 120 }}>실사수량</th>
            <th style={{ textAlign: 'right' }}>차이</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '이 창고에 재고 품목이 없습니다.' : '조건에 맞는 품목이 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => {
            const d = diffOf(r)
            return (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ color: r.spec ? undefined : '#c5cbd3' }}>{r.spec || '-'}</td>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
                <td style={{ textAlign: 'right' }}>{num(r.quantity)}</td>
                <td style={{ textAlign: 'right' }}>
                  <input
                    className="ec-input"
                    type="number"
                    value={r.counted}
                    onChange={(e) => setCount(r.itemId, e.target.value)}
                    placeholder="—"
                    style={{ width: 100, textAlign: 'right' }}
                  />
                </td>
                <td style={{
                  textAlign: 'right', fontWeight: d ? 700 : 400,
                  color: d === null ? '#c5cbd3' : d === 0 ? '#8a929c' : d > 0 ? '#1c6b32' : '#c60a2e',
                }}>
                  {d === null ? '—' : d > 0 ? `+${num(d)}` : num(d)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
