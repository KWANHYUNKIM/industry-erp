import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

/** 회계 > 원가생성/수정 (실제 연동: /api/costs) */
interface Item { id: number; code: string; name: string }
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
  actualMaterial: number
  actualLabor: number
  actualOverhead: number
  actualTotal: number
}

const thisMonth = () => new Date().toISOString().slice(0, 7)
const emptyForm = () => ({
  itemId: '', period: thisMonth(),
  materialCost: '', laborCost: '', overheadCost: '',
  actualMaterial: '', actualLabor: '', actualOverhead: '',
})

export default function CostBuildPage() {
  const [rows, setRows] = useState<Cost[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm())

  async function load() {
    setLoading(true)
    try {
      const [c, it] = await Promise.all([
        api.get<Cost[]>('/costs'),
        api.get<Item[]>('/items'),
      ])
      setRows(c.data)
      setItems(it.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof ReturnType<typeof emptyForm>, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  function openNew() {
    setEditId(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  function openEdit(r: Cost) {
    setEditId(r.id)
    setForm({
      itemId: String(r.itemId), period: r.period,
      materialCost: String(r.materialCost), laborCost: String(r.laborCost), overheadCost: String(r.overheadCost),
      actualMaterial: String(r.actualMaterial), actualLabor: String(r.actualLabor), actualOverhead: String(r.actualOverhead),
    })
    setShowForm(true)
  }

  const num = (v: string) => (v === '' ? 0 : Number(v))

  async function submit() {
    setError('')
    if (!editId && !form.itemId) return setError('품목을 선택하세요.')
    if (!form.period) return setError('적용기간을 입력하세요.')
    try {
      const body = {
        materialCost: num(form.materialCost), laborCost: num(form.laborCost), overheadCost: num(form.overheadCost),
        actualMaterial: num(form.actualMaterial), actualLabor: num(form.actualLabor), actualOverhead: num(form.actualOverhead),
      }
      if (editId) {
        await api.put(`/costs/${editId}`, body)
      } else {
        await api.post('/costs', { itemId: Number(form.itemId), period: form.period, ...body })
      }
      setShowForm(false)
      setEditId(null)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(r: Cost) {
    if (!window.confirm(`[${r.itemName}] ${r.period} 원가를 삭제할까요?`)) return
    try {
      await api.delete(`/costs/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function build() {
    const period = window.prompt('표준원가를 자동 생성할 기간을 입력하세요 (예: 2026-06)', thisMonth())
    if (!period) return
    try {
      const res = await api.post<Cost[]>(`/costs/build?period=${encodeURIComponent(period)}`)
      alert(`${res.data.length}건의 표준원가를 생성했습니다.`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.itemName.includes(keyword) || r.itemCode.includes(keyword))
  const total = useMemo(() => shown.reduce((s, r) => s + r.standardTotal, 0), [shown])
  const editItemName = editId ? rows.find((r) => r.id === editId)?.itemName : ''

  return (
    <EcListShell title="원가생성/수정" search={keyword} onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '원가등록(F2)'} onNew={() => (showForm ? setShowForm(false) : openNew())}
      actions={[{ label: '표준원가 자동생성', onClick: build }, { label: '새로고침', onClick: load }, { label: 'Excel' }]}>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="원가생성/수정 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>
            {editId ? `원가 수정 — ${editItemName}` : '원가 등록'}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              {editId ? (
                <input className="ec-input" value={editItemName ?? ''} disabled style={{ width: 180 }} />
              ) : (
                <select className="ec-input" value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 180 }}>
                  <option value="">선택하세요</option>
                  {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
                </select>
              )}
            </label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>적용기간 *</div>
              <input className="ec-input" placeholder="2026-06" value={form.period} onChange={(e) => set('period', e.target.value)} disabled={!!editId} style={{ width: 110 }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>표준재료비</div>
              <input className="ec-input text-right" type="number" step="any" value={form.materialCost} onChange={(e) => set('materialCost', e.target.value)} style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>표준노무비</div>
              <input className="ec-input text-right" type="number" step="any" value={form.laborCost} onChange={(e) => set('laborCost', e.target.value)} style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>표준경비</div>
              <input className="ec-input text-right" type="number" step="any" value={form.overheadCost} onChange={(e) => set('overheadCost', e.target.value)} style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>실제재료비</div>
              <input className="ec-input text-right" type="number" step="any" value={form.actualMaterial} onChange={(e) => set('actualMaterial', e.target.value)} style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>실제노무비</div>
              <input className="ec-input text-right" type="number" step="any" value={form.actualLabor} onChange={(e) => set('actualLabor', e.target.value)} style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>실제경비</div>
              <input className="ec-input text-right" type="number" step="any" value={form.actualOverhead} onChange={(e) => set('actualOverhead', e.target.value)} style={{ width: 110 }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
        </div>
      )}</Modal>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        표준원가 합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 90 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ width: 80 }}>기간</th>
            <th style={{ textAlign: 'right' }}>재료비</th>
            <th style={{ textAlign: 'right' }}>노무비</th>
            <th style={{ textAlign: 'right' }}>경비</th>
            <th style={{ textAlign: 'right' }}>표준원가</th>
            <th style={{ width: 70, textAlign: 'center' }}></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
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
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                <button className="no-ec" onClick={() => openEdit(r)} title="수정" style={{ border: 'none', background: 'none', color: 'var(--ec-blue-dark)', cursor: 'pointer', fontSize: 13, marginRight: 6 }}>수정</button>
                <button className="no-ec" onClick={() => remove(r)} title="삭제" style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 13 }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
