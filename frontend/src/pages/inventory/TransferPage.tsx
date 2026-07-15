import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockAdjustment, StockAdjustmentType, StockRow, StockTransfer, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

const today = () => new Date().toISOString().slice(0, 10)
const num = (n: number) => n.toLocaleString('ko-KR')

const TABS = ['창고이동', '자가사용', '불량처리', '재고조정'] as const
type Tab = (typeof TABS)[number]
const TAB_TYPE: Record<Exclude<Tab, '창고이동'>, StockAdjustmentType> = {
  자가사용: 'SELF_USE', 불량처리: 'DEFECT', 재고조정: 'ADJUST',
}

/**
 * 재고 I > 기타이동 — 창고이동(출고+입고 원자처리)과
 * 자가사용·불량처리(차감), 재고조정(실사수량과의 차이만큼 증감).
 */
export default function TransferPage() {
  const [tab, setTab] = useState<Tab>('창고이동')
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [t, a, i, w, s] = await Promise.all([
        api.get<StockTransfer[]>('/stock-transfers'),
        api.get<StockAdjustment[]>('/stock-adjustments'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<StockRow[]>('/stock'),
      ])
      setTransfers(t.data)
      setAdjustments(a.data)
      setItems(i.data)
      setWarehouses(w.data)
      setStock(s.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function switchTab(t: Tab) {
    setTab(t)
    setShowForm(false)
    setError('')
  }

  async function saved() {
    setShowForm(false)
    setError('')
    await load()
  }

  const shownTransfers = transfers.filter((r) => !keyword || r.itemName.includes(keyword) || (r.reason ?? '').includes(keyword))
  const shownAdjustments = adjustments.filter((r) =>
    tab !== '창고이동' && r.type === TAB_TYPE[tab] &&
    (!keyword || r.itemName.includes(keyword) || (r.reason ?? '').includes(keyword)))

  const count = (t: Tab) => (t === '창고이동' ? transfers.length : adjustments.filter((r) => r.type === TAB_TYPE[t]).length)

  return (
    <EcListShell
      title="기타이동"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : `${tab} 등록(F2)`}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => switchTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({count(t)})</button>
        ))}
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="기타이동 등록" onClose={() => setShowForm(false)}>{(tab === '창고이동'
        ? <TransferForm items={items} warehouses={warehouses} onError={setError} onSaved={saved} />
        : <AdjustmentForm type={TAB_TYPE[tab]} label={tab} items={items} warehouses={warehouses} stock={stock} onError={setError} onSaved={saved} />)}</Modal>

      {tab === '창고이동' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 130 }}>이동번호</th>
              <th style={{ width: 100 }}>일자 ▼</th>
              <th>품목명 ▼</th>
              <th style={{ width: 120 }}>출고창고</th>
              <th style={{ width: 120 }}>입고창고</th>
              <th style={{ width: 90, textAlign: 'right' }}>수량</th>
              <th>사유</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shownTransfers.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>이동 내역이 없습니다.</td></tr>
            ) : shownTransfers.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.transferNo}</td>
                <td>{r.transferDate}</td>
                <td>{r.itemName}</td>
                <td>{r.fromWarehouseName}</td>
                <td style={{ color: 'var(--ec-blue)' }}>{r.toWarehouseName}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(r.quantity)} {r.unit}</td>
                <td style={{ color: '#5a626e' }}>{r.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 130 }}>전표번호</th>
              <th style={{ width: 100 }}>일자 ▼</th>
              <th>품목명 ▼</th>
              <th style={{ width: 120 }}>창고</th>
              <th style={{ width: 90, textAlign: 'right' }}>처리전</th>
              <th style={{ width: 90, textAlign: 'right' }}>증감</th>
              <th style={{ width: 90, textAlign: 'right' }}>처리후</th>
              <th>사유</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shownAdjustments.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{tab} 내역이 없습니다.</td></tr>
            ) : shownAdjustments.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.adjustNo}</td>
                <td>{r.adjustDate}</td>
                <td>{r.itemName}</td>
                <td>{r.warehouseName}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.beforeQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.quantityChange < 0 ? '#c60a2e' : '#1c7c3c' }}>
                  {r.quantityChange > 0 ? '+' : ''}{num(r.quantityChange)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(r.afterQty)} {r.unit}</td>
                <td style={{ color: '#5a626e' }}>{r.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}

function TransferForm({ items, warehouses, onError, onSaved }: {
  items: Item[]; warehouses: Warehouse[]; onError: (m: string) => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    transferDate: today(), itemId: '', quantity: '', reason: '',
    fromWarehouseId: warehouses[0] ? String(warehouses[0].id) : '',
    toWarehouseId: warehouses[1] ? String(warehouses[1].id) : warehouses[0] ? String(warehouses[0].id) : '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    onError('')
    if (!form.itemId) return onError('품목을 선택하세요.')
    if (form.fromWarehouseId === form.toWarehouseId) return onError('출고창고와 입고창고가 같을 수 없습니다.')
    if (!form.quantity || Number(form.quantity) <= 0) return onError('이동수량을 입력하세요.')
    try {
      await api.post('/stock-transfers', {
        itemId: Number(form.itemId),
        fromWarehouseId: Number(form.fromWarehouseId),
        toWarehouseId: Number(form.toWarehouseId),
        quantity: Number(form.quantity),
        transferDate: form.transferDate,
        reason: form.reason || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>창고 간 이동 등록</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="일자">
          <input className="ec-input" type="date" value={form.transferDate} onChange={(e) => set('transferDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="품목 *">
          <select className="ec-input" value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
            <option value="">선택하세요</option>
            {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
          </select>
        </Field>
        <Field label="출고창고 *">
          <select className="ec-input" value={form.fromWarehouseId} onChange={(e) => set('fromWarehouseId', e.target.value)} style={{ width: 150 }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <span style={{ fontSize: 16, color: 'var(--ec-blue)', paddingBottom: 4 }}>→</span>
        <Field label="입고창고 *">
          <select className="ec-input" value={form.toWarehouseId} onChange={(e) => set('toWarehouseId', e.target.value)} style={{ width: 150 }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="수량 *">
          <input className="ec-input" type="number" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} style={{ width: 90 }} />
        </Field>
        <Field label="사유">
          <input className="ec-input" value={form.reason} onChange={(e) => set('reason', e.target.value)} style={{ width: 200 }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>이동처리</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>※ 출고창고 재고가 부족하면 이동이 거절됩니다(출고·입고 동시 처리).</div>
    </div>
  )
}

function AdjustmentForm({ type, label, items, warehouses, stock, onError, onSaved }: {
  type: StockAdjustmentType; label: string
  items: Item[]; warehouses: Warehouse[]; stock: StockRow[]
  onError: (m: string) => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    adjustDate: today(), itemId: '', quantity: '', actualQty: '', reason: '',
    warehouseId: warehouses[0] ? String(warehouses[0].id) : '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const current = useMemo(() => {
    if (!form.itemId || !form.warehouseId) return null
    const row = stock.find((s) => s.itemId === Number(form.itemId) && s.warehouseId === Number(form.warehouseId))
    return row ? row.quantity : 0
  }, [form.itemId, form.warehouseId, stock])

  const isAdjust = type === 'ADJUST'
  const diff = isAdjust && current !== null && form.actualQty !== '' ? Number(form.actualQty) - current : null

  async function submit() {
    onError('')
    if (!form.itemId) return onError('품목을 선택하세요.')
    if (!form.warehouseId) return onError('창고를 선택하세요.')
    if (isAdjust) {
      if (form.actualQty === '' || Number(form.actualQty) < 0) return onError('실사수량을 입력하세요.')
    } else if (!form.quantity || Number(form.quantity) <= 0) {
      return onError('수량을 입력하세요.')
    }
    try {
      await api.post('/stock-adjustments', {
        type,
        itemId: Number(form.itemId),
        warehouseId: Number(form.warehouseId),
        quantity: isAdjust ? undefined : Number(form.quantity),
        actualQty: isAdjust ? Number(form.actualQty) : undefined,
        adjustDate: form.adjustDate,
        reason: form.reason || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>{label} 등록</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="일자">
          <input className="ec-input" type="date" value={form.adjustDate} onChange={(e) => set('adjustDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="품목 *">
          <select className="ec-input" value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
            <option value="">선택하세요</option>
            {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
          </select>
        </Field>
        <Field label="창고 *">
          <select className="ec-input" value={form.warehouseId} onChange={(e) => set('warehouseId', e.target.value)} style={{ width: 150 }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="현재고">
          <div className="ec-input" style={{ width: 90, textAlign: 'right', background: '#f5f7fa', color: '#5a626e', lineHeight: '22px' }}>
            {current === null ? '-' : num(current)}
          </div>
        </Field>
        {isAdjust ? (
          <Field label="실사수량 *">
            <input className="ec-input" type="number" step="any" min="0" value={form.actualQty} onChange={(e) => set('actualQty', e.target.value)} style={{ width: 100, textAlign: 'right' }} />
          </Field>
        ) : (
          <Field label={`${label} 수량 *`}>
            <input className="ec-input" type="number" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} style={{ width: 100, textAlign: 'right' }} />
          </Field>
        )}
        {isAdjust && diff !== null && (
          <div style={{ fontSize: 12.5, paddingBottom: 5, color: diff === 0 ? '#8a929c' : diff < 0 ? '#c60a2e' : '#1c7c3c', fontWeight: 700 }}>
            증감 {diff > 0 ? '+' : ''}{num(diff)}
          </div>
        )}
        <Field label="사유">
          <input className="ec-input" value={form.reason} onChange={(e) => set('reason', e.target.value)} style={{ width: 200 }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>{label} 처리</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        {isAdjust
          ? '※ 실사수량과 현재고의 차이만큼 재고를 증감합니다(수불부에 조정으로 기록).'
          : `※ 입력 수량만큼 재고를 차감합니다. 현재고보다 많으면 ${label}가 거절됩니다.`}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12.5 }}>
      <div style={{ color: '#5a626e', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}
