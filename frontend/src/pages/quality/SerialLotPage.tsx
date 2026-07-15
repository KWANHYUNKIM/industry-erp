import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Lot, LotStatus, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

const today = () => new Date().toISOString().slice(0, 10)

const statusColor = (s: LotStatus) => (s === 'HOLD' ? '#c07a00' : s === 'SHIPPED' ? '#8a929c' : '#1c7c3c')

/** 재고 II > 시리얼/로트No. — 로트별 입고/현재고/보류 추적 (실연동) */
export default function SerialLotPage() {
  const [rows, setRows] = useState<Lot[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [keyword, setKeyword] = useState('')
  const [onlyStock, setOnlyStock] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ lotNo: '', itemId: '', warehouseId: '', inboundDate: today(), expireDate: '', inboundQty: '' })

  async function load() {
    setLoading(true)
    try {
      const [l, i, w] = await Promise.all([
        api.get<Lot[]>('/lots'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setRows(l.data)
      setItems(i.data)
      setWarehouses(w.data)
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
    if (!form.lotNo.trim()) return setError('로트No.를 입력하세요.')
    if (!form.itemId) return setError('품목을 선택하세요.')
    if (!form.inboundQty || Number(form.inboundQty) <= 0) return setError('입고수량을 입력하세요.')
    try {
      await api.post('/lots', {
        lotNo: form.lotNo,
        itemId: Number(form.itemId),
        warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
        inboundDate: form.inboundDate,
        expireDate: form.expireDate || undefined,
        inboundQty: Number(form.inboundQty),
      })
      setForm({ lotNo: '', itemId: '', warehouseId: '', inboundDate: today(), expireDate: '', inboundQty: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function consume(lot: Lot) {
    const v = window.prompt(`[${lot.lotNo}] 출고수량 (현재고 ${lot.stockQty})`, '')
    if (v === null) return
    const qty = Number(v)
    if (!qty || qty <= 0) return
    try {
      await api.patch(`/lots/${lot.id}/consume`, { qty })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function toggleHold(lot: Lot) {
    try {
      await api.patch(`/lots/${lot.id}/hold`, { held: !lot.held })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows
    .filter((r) => !keyword || r.lotNo.includes(keyword) || r.itemName.includes(keyword))
    .filter((r) => !onlyStock || r.stockQty > 0)

  return (
    <EcListShell
      title="시리얼/로트No. 관리"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '로트등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="시리얼/로트No. 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>로트 등록(입고)</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>로트No. *</div>
              <input className="ec-input" value={form.lotNo} onChange={(e) => set('lotNo', e.target.value)} placeholder="LOT-260707-01" style={{ width: 160 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              <select className="ec-input" value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
                <option value="">선택하세요</option>
                {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>창고</div>
              <select className="ec-input" value={form.warehouseId} onChange={(e) => set('warehouseId', e.target.value)} style={{ width: 140 }}>
                <option value="">(미지정)</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>입고일</div>
              <input className="ec-input" type="date" value={form.inboundDate} onChange={(e) => set('inboundDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>유효기한</div>
              <input className="ec-input" type="date" value={form.expireDate} onChange={(e) => set('expireDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>입고수량 *</div>
              <input className="ec-input" type="number" step="any" value={form.inboundQty} onChange={(e) => set('inboundQty', e.target.value)} style={{ width: 100 }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>등록</button>
          </div>
        </div>
      )}</Modal>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12.5, color: '#3a4453', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} style={{ marginRight: 5, verticalAlign: 'middle' }} />
          재고보유 로트만 보기
        </label>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 150 }}>로트No. ▼</th>
            <th>품목명 ▼</th>
            <th style={{ width: 100 }}>입고일 ▼</th>
            <th style={{ width: 100 }}>유효기한</th>
            <th style={{ width: 80, textAlign: 'right' }}>입고수량</th>
            <th style={{ width: 80, textAlign: 'right' }}>현재고</th>
            <th style={{ width: 100 }}>창고</th>
            <th style={{ width: 80, textAlign: 'center' }}>상태 ▼</th>
            <th style={{ width: 130, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>로트 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.lotNo}</td>
              <td>{r.itemName}</td>
              <td>{r.inboundDate}</td>
              <td>{r.expireDate ?? '-'}</td>
              <td style={{ textAlign: 'right' }}>{r.inboundQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: r.stockQty > 0 ? 700 : 400, color: r.stockQty === 0 ? '#9aa1ab' : undefined }}>{r.stockQty.toLocaleString()}</td>
              <td>{r.warehouseName ?? '-'}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.statusName}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 6px' }} disabled={r.held || r.stockQty <= 0} onClick={() => consume(r)}>출고</button>
                <button className="ec-btn" style={{ height: 20, padding: '0 6px', marginLeft: 3, color: r.held ? '#1c7c3c' : '#c07a00' }} onClick={() => toggleHold(r)}>{r.held ? '해제' : '보류'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
