import { useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 재고 > 잔량재집계 (이카운트 E040607)
 *
 * 원본은 시작월~종료월을 받아 '잔량재집계(F8)' 한 번을 누르는 화면이다. 우리는 그 재집계가
 * 실제로 무엇을 고치는지 두 가지로 정의했다.
 *  1) 거래별 잔량(balanceAfter) — 저장값은 입력순이라, 과거 일자 거래가 뒤늦게 입력되면 일자순 잔량과 어긋난다.
 *  2) 현재고(stocks.quantity) — 수불 이력 합계와 어긋나면 이력을 진실로 보고 맞춘다.
 * 먼저 '점검'으로 차이를 보여주고, '재집계 반영'을 눌러야 실제로 값을 고친다(되돌릴 수 없는 작업이라 두 단계).
 */
interface RecalcRow {
  itemId: number
  itemCode: string
  itemName: string
  warehouseId: number
  warehouseCode: string
  warehouseName: string
  opening: string
  txCount: number
  balanceMismatch: number
  storedQuantity: string
  computedQuantity: string
  difference: string
}
interface RecalcResult {
  fromMonth: string
  toMonth: string
  applied: boolean
  scannedTx: number
  balanceMismatch: number
  quantityMismatch: number
  rows: RecalcRow[]
}

const thisMonth = () => new Date().toISOString().slice(0, 7)
const num = (v: string) => Number(v).toLocaleString()

export default function StockRecalcPage() {
  const [fromMonth, setFromMonth] = useState(thisMonth())
  const [toMonth, setToMonth] = useState(thisMonth())
  const [result, setResult] = useState<RecalcResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function run(apply: boolean) {
    if (fromMonth > toMonth) return setError('시작월이 종료월보다 뒤입니다.')
    if (apply && !window.confirm('재집계를 반영하면 거래잔량·현재고가 수불 이력 기준으로 덮어써집니다. 진행할까요?')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const params = { fromMonth, toMonth }
      const r = apply
        ? await api.post<RecalcResult>('/stock/recalc', null, { params })
        : await api.get<RecalcResult>('/stock/recalc', { params })
      setResult(r.data)
      setNotice(apply
        ? `재집계 반영 완료 — 거래잔량 ${r.data.balanceMismatch}건, 현재고 ${r.data.quantityMismatch}건을 맞췄습니다.`
        : `점검 완료 — 거래 ${r.data.scannedTx}건 확인, 거래잔량 ${r.data.balanceMismatch}건 / 현재고 ${r.data.quantityMismatch}건 어긋남.`)
    } catch (err) { setError(extractErrorMessage(err)) } finally { setBusy(false) }
  }

  const rows = result?.rows ?? []
  const clean = result && result.balanceMismatch === 0 && result.quantityMismatch === 0

  return (
    <EcListShell
      title="잔량재집계"
      actions={[
        { label: '점검', onClick: () => run(false) },
        { label: '잔량재집계(F8)', onClick: () => run(true), primary: true },
        { label: 'Excel' },
      ]}
      help={
        <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          <p>수불 이력을 기준으로 잔량을 다시 계산해 맞춥니다.</p>
          <ul style={{ paddingLeft: 18, listStyle: 'disc' }}>
            <li><b>거래잔량</b> — 과거 일자 거래가 뒤늦게 입력되면 저장된 잔량(입력순)이 일자순 잔량과 어긋납니다. 기간 안의 거래를 일자순으로 다시 누적합니다.</li>
            <li><b>현재고</b> — 수불 이력 합계와 현재고가 다르면 이력을 진실로 보고 현재고를 맞춥니다(기간과 무관하게 전 품목·창고 점검).</li>
          </ul>
          <p>‘점검’은 값을 고치지 않고 차이만 보여줍니다.</p>
        </div>
      }
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <p style={{ background: '#eaf4ea', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{notice}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>시작월</div>
          <input type="month" className="ec-input" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} style={{ width: 140 }} /></label>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>종료월</div>
          <input type="month" className="ec-input" value={toMonth} onChange={(e) => setToMonth(e.target.value)} style={{ width: 140 }} /></label>
        <button className="ec-btn" onClick={() => run(false)} disabled={busy}>{busy ? '처리 중…' : '점검'}</button>
        <button className="ec-btn ec-btn-primary" onClick={() => run(true)} disabled={busy}>잔량재집계(F8)</button>
        <span style={{ fontSize: 12, color: '#8a929c' }}>※ 거래잔량 정규화는 선택한 기간, 현재고 대조는 전 기간입니다.</span>
      </div>

      {result && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          {[
            { label: '점검한 거래', value: result.scannedTx.toLocaleString(), color: '#5a626e' },
            { label: '거래잔량 어긋남', value: result.balanceMismatch.toLocaleString(), color: result.balanceMismatch ? '#c60a2e' : '#1c7c3c' },
            { label: '현재고 어긋남', value: result.quantityMismatch.toLocaleString(), color: result.quantityMismatch ? '#c60a2e' : '#1c7c3c' },
          ].map((c) => (
            <div key={c.label} style={{ border: '1px solid var(--ec-border)', padding: '8px 14px', minWidth: 130 }}>
              <div style={{ fontSize: 11.5, color: '#8a929c' }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 110 }}>품목코드</th>
          <th>품목명</th>
          <th style={{ width: 140 }}>창고</th>
          <th style={{ width: 100, textAlign: 'right' }}>기초</th>
          <th style={{ width: 90, textAlign: 'right' }}>기간거래</th>
          <th style={{ width: 110, textAlign: 'right' }}>잔량어긋남</th>
          <th style={{ width: 110, textAlign: 'right' }}>현재고(저장)</th>
          <th style={{ width: 110, textAlign: 'right' }}>이력합계</th>
          <th style={{ width: 100, textAlign: 'right' }}>차이</th>
        </tr></thead>
        <tbody>
          {!result ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>기간을 정하고 ‘점검’을 누르세요.</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: clean ? '#1c7c3c' : '#9aa1ab', padding: 20 }}>
              {clean ? '이상 없습니다. 잔량이 수불 이력과 모두 일치합니다.' : '표시할 행이 없습니다.'}
            </td></tr>
          ) : rows.map((r, i) => (
            <tr key={`${r.itemId}:${r.warehouseId}`}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td>{r.warehouseName}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{num(r.opening)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{r.txCount.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace', color: r.balanceMismatch ? '#c60a2e' : '#8a929c', fontWeight: r.balanceMismatch ? 700 : 400 }}>
                {r.balanceMismatch.toLocaleString()}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{num(r.storedQuantity)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{num(r.computedQuantity)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace', color: Number(r.difference) ? '#c60a2e' : '#8a929c', fontWeight: Number(r.difference) ? 700 : 400 }}>
                {num(r.difference)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
