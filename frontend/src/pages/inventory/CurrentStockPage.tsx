import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { StockRow } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../components/EcPeriodPicks'

/**
 * 재고 > 재고현황 (이카운트 E040701)
 *
 * 원본 조건: 기준일자 · 창고 · 품목 · 기타(수량관리제외품목포함 / 사용중단품목포함 /
 * 안전재고설정미만표시) · 재고수량(범위).
 *
 * <b>기준일자가 한 날짜다</b> — 재고는 구간이 아니라 시점을 보는 것이라서다.
 * 그래서 기간 빠른선택도 [금일][전일] 둘뿐이다(구간 버튼은 뜻이 없다).
 *
 * 우리 화면은 조건이 '안전재고 미달만 보기' 체크박스 하나뿐이었다.
 *
 * 기준일자는 칸만 두고 조회에는 아직 쓰지 않는다 — 백엔드 `/stock` 이 <b>현재고만</b> 주고
 * 특정 시점 재고를 계산하지 않는다. 값이 안 바뀌는데 바뀌는 척하면 더 나쁘므로,
 * 오늘이 아닌 날짜를 고르면 그 사실을 화면에 적는다.
 */
export default function CurrentStockPage() {
  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = ymd(new Date())
  const [cond, setCond] = useState({
    date: today,
    warehouse: '',
    item: '',
    belowSafetyOnly: false,
    qtyFrom: '',
    qtyTo: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    api
      .get<StockRow[]>('/stock')
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const warehouses = useMemo(
    () => [...new Set(rows.map((r) => r.warehouseName))].sort(), [rows])

  const shown = rows
    .filter((r) => !cond.belowSafetyOnly || r.belowSafety)
    .filter((r) => !cond.warehouse || r.warehouseName === cond.warehouse)
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
    .filter((r) => !cond.qtyFrom || r.quantity >= Number(cond.qtyFrom))
    .filter((r) => !cond.qtyTo || r.quantity <= Number(cond.qtyTo))

  const belowCount = rows.filter((r) => r.belowSafety).length
  const totalQty = shown.reduce((s, r) => s + r.quantity, 0)
  const reset = () => setCond({ date: today, warehouse: '', item: '', belowSafetyOnly: false, qtyFrom: '', qtyTo: '' })

  return (
    <EcListShell
      title="재고현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        single
        from={cond.date} to={cond.date}
        onPeriod={(r) => setC({ date: r.from })}
        picks={STOCK_PICKS}
      >
        <EcCond label="창고" pick>
          <select className="ec-input" value={cond.warehouse} onChange={(e) => setC({ warehouse: e.target.value })} style={{ width: 220 }}>
            <option value="">전체</option>
            {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목명·코드 일부" value={cond.item}
                 onChange={(e) => setC({ item: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={cond.belowSafetyOnly}
                   onChange={(e) => setC({ belowSafetyOnly: e.target.checked })} /> 안전재고설정미만표시
          </label>
        </EcCond>
        <EcCond label="재고수량">
          <input className="ec-input" type="number" value={cond.qtyFrom}
                 onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 120 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input className="ec-input" type="number" value={cond.qtyTo}
                 onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 120 }} />
        </EcCond>
      </EcStatusPanel>

      {cond.date !== today && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          지금 보는 것은 <b>현재고</b>입니다. 과거 시점 재고 계산은 아직 없어서 기준일자를 바꿔도
          숫자가 달라지지 않습니다.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 12.5, color: '#5a6472' }}>
        <span>품목 × 창고 현재고</span>
        <span style={{ marginLeft: 'auto' }}>
          건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          수량 <b style={{ color: '#3c4553', fontSize: 14 }}>{totalQty.toLocaleString()}</b>
          {belowCount > 0 && (
            <>
              <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
              안전재고 미달 <b style={{ color: '#c60a2e', fontSize: 14 }}>{belowCount}</b>건
            </>
          )}
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col />
            <col style={{ width: '16%' }} /><col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>품목코드 ▼</th>
              <th>품목명 ▼</th>
              <th>규격정보</th>
              <th>창고 ▼</th>
              <th style={{ textAlign: 'right' }}>현재고</th>
              <th style={{ textAlign: 'right' }}>안전재고</th>
              <th style={{ textAlign: 'center' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : (
              shown.map((r, idx) => (
                <tr key={`${r.itemId}-${r.warehouseId}`} style={r.belowSafety ? { background: '#fdf1f3' } : undefined}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                  <td>{r.itemName}</td>
                  <td>{r.spec ?? ''}</td>
                  <td>{r.warehouseName}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: r.belowSafety ? '#c60a2e' : undefined }}>
                    {r.quantity.toLocaleString()} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.safetyStock.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}>
                    {r.belowSafety
                      ? <span style={{ color: '#c60a2e', fontWeight: 700 }}>부족</span>
                      : <span style={{ color: '#2f8401' }}>정상</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계 ({shown.length}건)</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{totalQty.toLocaleString()}</td>
                <td colSpan={2} style={{ background: '#f5f7fa' }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}
