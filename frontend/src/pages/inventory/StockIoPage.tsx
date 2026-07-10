import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Page, StockTransaction, Warehouse } from '../../api/types'

const inputCls = 'ec-input w-full'

const today = () => new Date().toISOString().slice(0, 10)
const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 72 }

export default function StockIoPage() {
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [history, setHistory] = useState<StockTransaction[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [form, setForm] = useState({
    itemId: '',
    warehouseId: '',
    type: 'INBOUND',
    increase: 'true',
    quantity: '',
    unitPrice: '',
    transactionDate: today(),
    note: '',
  })

  async function loadRefs() {
    const [i, w] = await Promise.all([
      api.get<Item[]>('/items'),
      api.get<Warehouse[]>('/warehouses'),
    ])
    setItems(i.data)
    setWarehouses(w.data)
    // 기본값은 아직 선택이 없을 때만 채운다(사용자/스크립트 선택을 덮어쓰지 않도록)
    setForm((f) => ({
      ...f,
      itemId: f.itemId || (i.data[0] ? String(i.data[0].id) : ''),
      warehouseId: f.warehouseId || (w.data[0] ? String(w.data[0].id) : ''),
    }))
  }

  async function loadHistory() {
    const res = await api.get<Page<StockTransaction>>('/stock/transactions?size=20')
    setHistory(res.data.content)
  }

  useEffect(() => {
    loadRefs()
    loadHistory()
  }, [])

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setOk('')
    try {
      await api.post('/stock/transactions', {
        itemId: Number(form.itemId),
        warehouseId: Number(form.warehouseId),
        type: form.type,
        increase: form.type === 'ADJUST' ? form.increase === 'true' : undefined,
        quantity: Number(form.quantity),
        unitPrice: form.unitPrice ? Number(form.unitPrice) : undefined,
        transactionDate: form.transactionDate,
        note: form.note || undefined,
      })
      setOk('처리되었습니다.')
      set('quantity', '')
      set('note', '')
      loadHistory()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const typeColor = (t: StockTransaction) =>
    t.type === 'INBOUND' ? { bg: '#eef4ff', fg: 'var(--ec-blue)' }
      : t.type === 'OUTBOUND' ? { bg: '#fdf3ea', fg: '#a5561b' }
        : { bg: '#f3eefb', fg: '#6b3fb0' }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* ☆ 제목 + 상단 툴바 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>입출고 등록</span>
        <span style={{ marginLeft: 10, fontSize: 11.5, color: '#8a929c' }}>입고·출고·조정 처리 시 재고 잔량 자동 반영</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
          <button type="button" className="ec-btn">도움말</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 입력 폼 */}
        <div style={{ width: 420, border: '1px solid var(--ec-border)', background: '#fff', padding: 14, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>입출고 등록</div>
          <table className="w-full text-left" style={{ marginBottom: 10 }}>
            <tbody>
              <tr>
                <th style={th}>유형 *</th>
                <td>
                  <select className="ec-input" value={form.type} onChange={(e) => set('type', e.target.value)} style={{ width: 150 }}>
                    <option value="INBOUND">입고</option>
                    <option value="OUTBOUND">출고</option>
                    <option value="ADJUST">조정</option>
                  </select>
                  {form.type === 'ADJUST' && (
                    <select className="ec-input" value={form.increase} onChange={(e) => set('increase', e.target.value)} style={{ width: 120, marginLeft: 6 }}>
                      <option value="true">증가 (+)</option>
                      <option value="false">감소 (−)</option>
                    </select>
                  )}
                </td>
              </tr>
              <tr>
                <th style={th}>품목 *</th>
                <td>
                  <select className={inputCls} value={form.itemId} onChange={(e) => set('itemId', e.target.value)}>
                    {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={th}>창고 *</th>
                <td>
                  <select className={inputCls} value={form.warehouseId} onChange={(e) => set('warehouseId', e.target.value)}>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={th}>수량 *</th>
                <td>
                  <input type="number" step="any" className="ec-input" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} style={{ width: 140, textAlign: 'right' }} />
                  <span style={{ margin: '0 6px', color: '#8a929c', fontSize: 12 }}>단가</span>
                  <input type="number" step="any" className="ec-input" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} style={{ width: 120, textAlign: 'right' }} />
                </td>
              </tr>
              <tr>
                <th style={th}>일자</th>
                <td><input type="date" className="ec-input" value={form.transactionDate} onChange={(e) => set('transactionDate', e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>비고</th>
                <td><input className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} /></td>
              </tr>
            </tbody>
          </table>

          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

          <button type="submit" className="ec-btn ec-btn-primary" style={{ width: '100%', height: 30 }}>등록</button>
        </div>

        {/* 최근 이력 */}
        <div style={{ flex: 1, minWidth: 380 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-text)', marginBottom: 6 }}>최근 입출고 이력</div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>일자</th>
                <th style={{ textAlign: 'center' }}>유형</th>
                <th>품목</th>
                <th>창고</th>
                <th style={{ textAlign: 'right' }}>변동</th>
                <th style={{ textAlign: 'right' }}>잔량</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>이력이 없습니다.</td></tr>
              ) : history.map((t) => (
                <tr key={t.id}>
                  <td>{t.transactionDate}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: typeColor(t).bg, color: typeColor(t).fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{t.typeName}</span>
                  </td>
                  <td>{t.itemName}</td>
                  <td>{t.warehouseName}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: t.quantityChange < 0 ? '#a5561b' : 'var(--ec-blue)' }}>
                    {t.quantityChange > 0 ? '+' : ''}{t.quantityChange.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>{t.balanceAfter.toLocaleString()}</td>
                  <td style={{ color: '#8a929c' }}>{t.note ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  )
}
