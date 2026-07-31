import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockTransaction, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'

/**
 * 재고 > 재고수불부 (이카운트 E040702)
 * 기간·창고·품목으로 거른 입출고 원장. 각 거래를 입고/출고로 나눠 보이고 잔량을 위→아래로 읽는다.
 * 데이터는 GET /api/stock/ledger → { opening, rows } (rows는 일자·id 오름차순).
 *
 * 저장된 balanceAfter는 <b>입력(id)순</b> 기준이라, 일자정렬 화면에서 그대로 쓰면 어긋난다
 * (백업/실사로 과거일자 거래가 뒤에 입력될 수 있음). 그래서 잔량은 서버가 준 기초재고(opening)에
 * 각 행의 변동량을 <b>표시 순서대로 누적</b>해 재계산한다. 기초/기말은 품목·창고를 모두 특정했을 때만
 * 의미가 있어 그때만 표시한다.
 */

type TxType = 'INBOUND' | 'OUTBOUND' | 'ADJUST'
const TYPE_COLOR: Record<TxType, { bg: string; fg: string }> = {
  INBOUND: { bg: '#eef4ff', fg: 'var(--ec-blue)' },
  OUTBOUND: { bg: '#fdf3ea', fg: '#a5561b' },
  ADJUST: { bg: '#f3eefb', fg: '#6b3fb0' },
}

interface LedgerResponse { opening: number | null; rows: StockTransaction[] }

const num = (n: number) => n.toLocaleString('ko-KR')
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => new Date().toISOString().slice(0, 10)

interface ServerFilters { from: string; to: string; itemId: string; warehouseId: string }

export default function StockLedgerPage() {
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<StockTransaction[]>([])
  const [opening, setOpening] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 서버 필터(조회 버튼으로 반영)
  const [filters, setFilters] = useState<ServerFilters>({ from: firstOfMonth(), to: today(), itemId: '', warehouseId: '' })
  // 클라이언트 보조 필터
  const [typeFilter, setTypeFilter] = useState<'ALL' | TxType>('ALL')
  const [keyword, setKeyword] = useState('')

  async function loadRefs() {
    const [i, w] = await Promise.all([api.get<Item[]>('/items'), api.get<Warehouse[]>('/warehouses')])
    setItems(i.data); setWarehouses(w.data)
  }

  async function loadLedger() {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (filters.itemId) params.itemId = filters.itemId
      if (filters.warehouseId) params.warehouseId = filters.warehouseId
      const res = await api.get<LedgerResponse>('/stock/ledger', { params })
      setRows(res.data.rows)
      setOpening(res.data.opening)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]); setOpening(null) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadRefs(); loadLedger() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // 표시 순서(일자·id)대로 잔량 재계산: opening 이 있으면 누적, 없으면 저장된 balanceAfter(행별 실제 잔량) 사용.
  const runningById = useMemo(() => {
    const m = new Map<number, number>()
    if (opening != null) {
      let bal = opening
      for (const r of rows) { bal += r.quantityChange; m.set(r.id, bal) }
    } else {
      for (const r of rows) m.set(r.id, r.balanceAfter)
    }
    return m
  }, [rows, opening])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false
      if (kw && !r.itemName.includes(kw) && !r.warehouseName.includes(kw) && !(r.note ?? '').includes(kw)) return false
      return true
    })
  }, [rows, typeFilter, keyword])

  const summary = useMemo(() => {
    let inQty = 0, outQty = 0
    for (const r of shown) {
      if (r.quantityChange >= 0) inQty += r.quantityChange
      else outQty += -r.quantityChange
    }
    // 기초/기말은 (품목,창고) 모두 특정 + 유형필터 없음일 때만 표시 (잔량 누계가 유효)
    const singleScope = opening != null && typeFilter === 'ALL'
    const netAll = rows.reduce((s, r) => s + r.quantityChange, 0)
    const closing = singleScope ? (opening as number) + netAll : null
    return { inQty, outQty, net: inQty - outQty, opening: singleScope ? opening : null, closing, singleScope }
  }, [shown, rows, opening, typeFilter])

  const setF = (patch: Partial<ServerFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const label: React.CSSProperties = { width: 64, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  return (
    <EcListShell
      title="재고수불부"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={loadLedger}
      actions={[{ label: '조회', onClick: loadLedger }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">
        기간·창고·품목별 입출고 원장. 잔량은 기초재고에 변동량을 누적해 표시순으로 계산 — 기초/기말은 품목·창고를 함께 지정할 때만 표시됩니다.
      </p>

      {/* 조회 조건 */}
      <div
        onKeyDown={(e) => { if (e.key === 'Enter') loadLedger() }}
        style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>기간</span>
          <input type="date" className="ec-input" value={filters.from} onChange={(e) => setF({ from: e.target.value })} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={filters.to} onChange={(e) => setF({ to: e.target.value })} style={{ width: 148 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={170} value={filters.warehouseId}
                           onChange={(v) => setF({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>품목</span>
          <CodePickerField label="품목" hideLabel width={210} value={filters.itemId}
                           onChange={(v) => setF({ itemId: v })}
                           items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec }))} />
        </div>
        <button className="ec-btn ec-btn-primary" onClick={loadLedger}>조회</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 유형 탭 + 요약 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['ALL', 'INBOUND', 'OUTBOUND', 'ADJUST'] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: typeFilter === t ? 'var(--ec-blue)' : '#fff', color: typeFilter === t ? '#fff' : '#3a4453', fontWeight: typeFilter === t ? 700 : 400,
            }}>{t === 'ALL' ? '전체' : t === 'INBOUND' ? '입고' : t === 'OUTBOUND' ? '출고' : '조정'} ({t === 'ALL' ? rows.length : rows.filter((r) => r.type === t).length})</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          {summary.singleScope && summary.opening != null && (
            <>기초 <b style={{ color: '#3c4553', fontSize: 14 }}>{num(summary.opening)}</b><span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span></>
          )}
          입고계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(summary.inQty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          출고계 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(summary.outQty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          순증감 <b style={{ color: summary.net >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{summary.net > 0 ? '+' : ''}{num(summary.net)}</b>
          {summary.singleScope && summary.closing != null && (
            <><span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>기말 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(summary.closing)}</b></>
          )}
        </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th>
            <th style={{ textAlign: 'center', width: 60 }}>유형</th>
            <th>품목</th>
            <th>창고</th>
            <th style={{ textAlign: 'right' }}>입고</th>
            <th style={{ textAlign: 'right' }}>출고</th>
            <th style={{ textAlign: 'right' }}>잔량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>금액</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '해당 기간의 입출고 내역이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => {
            const inQ = r.quantityChange >= 0 ? r.quantityChange : 0
            const outQ = r.quantityChange < 0 ? -r.quantityChange : 0
            const amount = r.unitPrice != null ? Math.abs(r.quantityChange) * r.unitPrice : null
            const bal = runningById.get(r.id)
            const c = TYPE_COLOR[r.type]
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.transactionDate}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: c.bg, color: c.fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{r.typeName}</span>
                </td>
                <td>{r.itemName}</td>
                <td>{r.warehouseName}</td>
                <td style={{ textAlign: 'right', color: inQ ? 'var(--ec-blue)' : '#c5cbd3', fontWeight: inQ ? 600 : 400 }}>{inQ ? num(inQ) : '-'}</td>
                <td style={{ textAlign: 'right', color: outQ ? '#a5561b' : '#c5cbd3', fontWeight: outQ ? 600 : 400 }}>{outQ ? num(outQ) : '-'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{bal != null ? num(bal) : '-'}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.unitPrice != null ? num(r.unitPrice) : '-'}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{amount != null ? num(amount) : '-'}</td>
                <td style={{ color: '#8a929c' }}>{r.note ?? '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
