import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockTransfer, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'

const today = () => new Date().toISOString().slice(0, 10)

/** 재고 I > 기타이동 — 창고 간 재고이동(출고+입고 원자처리) 실연동 */
export default function TransferPage() {
  const [rows, setRows] = useState<StockTransfer[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ transferDate: today(), itemId: '', fromWarehouseId: '', toWarehouseId: '', quantity: '', reason: '' })

  async function load() {
    setLoading(true)
    try {
      const [t, i, w] = await Promise.all([
        api.get<StockTransfer[]>('/stock-transfers'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setRows(t.data)
      setItems(i.data)
      setWarehouses(w.data)
      setForm((f) => ({
        ...f,
        fromWarehouseId: f.fromWarehouseId || (w.data[0] ? String(w.data[0].id) : ''),
        toWarehouseId: f.toWarehouseId || (w.data[1] ? String(w.data[1].id) : w.data[0] ? String(w.data[0].id) : ''),
      }))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.itemId) return setError('품목을 선택하세요.')
    if (form.fromWarehouseId === form.toWarehouseId) return setError('출고창고와 입고창고가 같을 수 없습니다.')
    if (!form.quantity || Number(form.quantity) <= 0) return setError('이동수량을 입력하세요.')
    try {
      await api.post('/stock-transfers', {
        itemId: Number(form.itemId),
        fromWarehouseId: Number(form.fromWarehouseId),
        toWarehouseId: Number(form.toWarehouseId),
        quantity: Number(form.quantity),
        transferDate: form.transferDate,
        reason: form.reason || undefined,
      })
      setForm((f) => ({ ...f, itemId: '', quantity: '', reason: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.itemName.includes(keyword) || (r.reason ?? '').includes(keyword))

  return (
    <EcListShell
      title="기타이동 (창고이동)"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '이동등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {showForm && (
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>창고 간 이동 등록</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>일자</div>
              <input className="ec-input" type="date" value={form.transferDate} onChange={(e) => set('transferDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              <select className="ec-input" value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
                <option value="">선택하세요</option>
                {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>출고창고 *</div>
              <select className="ec-input" value={form.fromWarehouseId} onChange={(e) => set('fromWarehouseId', e.target.value)} style={{ width: 150 }}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
            <span style={{ fontSize: 16, color: 'var(--ec-blue)', paddingBottom: 4 }}>→</span>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>입고창고 *</div>
              <select className="ec-input" value={form.toWarehouseId} onChange={(e) => set('toWarehouseId', e.target.value)} style={{ width: 150 }}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>수량 *</div>
              <input className="ec-input" type="number" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} style={{ width: 90 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>사유</div>
              <input className="ec-input" value={form.reason} onChange={(e) => set('reason', e.target.value)} style={{ width: 200 }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>이동처리</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>※ 출고창고 재고가 부족하면 이동이 거절됩니다(출고·입고 동시 처리).</div>
        </div>
      )}

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
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>이동 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.transferNo}</td>
              <td>{r.transferDate}</td>
              <td>{r.itemName}</td>
              <td>{r.fromWarehouseName}</td>
              <td style={{ color: 'var(--ec-blue)' }}>{r.toWarehouseName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.quantity.toLocaleString()} {r.unit}</td>
              <td style={{ color: '#5a626e' }}>{r.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
