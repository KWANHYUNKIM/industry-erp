import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeOption, Item } from '../../api/types'
import EcListShell from '../../components/EcListShell'

const inputCls = 'ec-input w-full'

const emptyForm = {
  code: '',
  name: '',
  spec: '',
  unit: 'EA',
  category: 'RAW_MATERIAL',
  unitPrice: '0',
  safetyStock: '0',
  barcode: '',
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<CodeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  async function load() {
    setLoading(true)
    try {
      const [i, c] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<CodeOption[]>('/meta/item-categories'),
      ])
      setItems(i.data)
      setCategories(c.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  function openEdit(item: Item) {
    setEditId(item.id)
    setForm({
      code: item.code,
      name: item.name,
      spec: item.spec ?? '',
      unit: item.unit,
      category: item.category,
      unitPrice: String(item.unitPrice),
      safetyStock: String(item.safetyStock),
      barcode: item.barcode ?? '',
    })
    setShowForm(true)
  }

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const payload = {
      ...form,
      unitPrice: Number(form.unitPrice),
      safetyStock: Number(form.safetyStock),
    }
    try {
      if (editId) {
        await api.put(`/items/${editId}`, { ...payload, active: true })
      } else {
        await api.post('/items', payload)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(item: Item) {
    if (!confirm(`품목 '${item.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/items/${item.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const [keyword, setKeyword] = useState('')
  const shown = items.filter((it) =>
    !keyword || it.code.toLowerCase().includes(keyword.toLowerCase()) || it.name.toLowerCase().includes(keyword.toLowerCase()))

  return (
    <EcListShell
      title="품목등록 리스트"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={showForm ? () => setShowForm(false) : openCreate}
      actions={[{ label: 'Excel' }, { label: '삭제' }, { label: '웹자료올리기' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>{editId ? '품목 수정' : '새 품목 등록'}</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">품목코드 *</label>
              <input className={inputCls} value={form.code} disabled={!!editId} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-slate-600">품명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">규격</label>
              <input className={inputCls} value={form.spec} onChange={(e) => set('spec', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">단위 *</label>
              <input className={inputCls} value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">품목분류 *</label>
              <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">단가</label>
              <input type="number" className={inputCls} value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">안전재고</label>
              <input type="number" className={inputCls} value={form.safetyStock} onChange={(e) => set('safetyStock', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">바코드</label>
              <input className={inputCls} value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '등록'}</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>품목코드 ▼</th>
              <th>품목명 ▼</th>
              <th>규격정보</th>
              <th>단위</th>
              <th>품목구분 ▼</th>
              <th style={{ textAlign: 'right' }}>단가</th>
              <th style={{ textAlign: 'right' }}>안전재고</th>
              <th>사용 ▼</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 품목이 없습니다.</td></tr>
            ) : (
              shown.map((it, idx) => (
                <tr key={it.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{it.code}</td>
                  <td>{it.name}</td>
                  <td>{it.spec ?? ''}</td>
                  <td>{it.unit}</td>
                  <td>[{it.categoryName}]</td>
                  <td style={{ textAlign: 'right' }}>{it.unitPrice.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{it.safetyStock.toLocaleString()}</td>
                  <td>{it.active ? 'YES' : 'NO'}</td>
                  <td>
                    <button onClick={() => openEdit(it)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(it)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
