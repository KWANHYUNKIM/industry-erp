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
      setSelected((s) => { const n = new Set(s); n.delete(item.id); return n })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  // 그리드 행 선택(체크박스) 상태 — 하단 '삭제' 일괄삭제에 사용
  const [selected, setSelected] = useState<Set<number>>(new Set())
  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // 하단 '삭제': 선택된 행들을 기존 DELETE /items/{id} 로 일괄 삭제
  async function removeSelected() {
    if (selected.size === 0) { alert('삭제할 품목을 먼저 선택하세요.'); return }
    if (!confirm(`선택한 ${selected.size}개 품목을 삭제할까요?`)) return
    const ids = Array.from(selected)
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/items/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelected(new Set())
    await load()
    if (failed > 0) alert(`${ids.length - failed}건 삭제, ${failed}건 실패(참조 중이거나 삭제 불가한 품목).`)
  }

  const [webOpen, setWebOpen] = useState(false)  // 웹자료올리기 안내 모달
  // 업로드 파일 클라이언트 미리보기(행수/헤더). 실제 서버 반영은 백엔드 미연동
  const [webFile, setWebFile] = useState<{ name: string; total: number; head: string[] } | null>(null)
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    setWebFile({ name: f.name, total: Math.max(0, lines.length - 1), head: (lines[0] ?? '').split(/[,\t]/).slice(0, 8) })
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
      actions={[{ label: 'Excel' }, { label: `삭제${selected.size ? ` (${selected.size})` : ''}`, onClick: removeSelected }, { label: '웹자료올리기', onClick: () => setWebOpen(true) }]}
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
              <th style={{ width: 30, textAlign: 'center' }} data-export-skip="true">
                <input
                  type="checkbox"
                  checked={shown.length > 0 && shown.every((it) => selected.has(it.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((it) => it.id)) : new Set())}
                />
              </th>
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
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 품목이 없습니다.</td></tr>
            ) : (
              shown.map((it, idx) => (
                <tr key={it.id} style={selected.has(it.id) ? { background: '#f5f8ff' } : undefined}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                  </td>
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

      {webOpen && (
        <div onClick={() => setWebOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 520, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>웹자료올리기 · 품목 대량 등록</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setWebOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px' }}>엑셀/CSV 파일로 품목을 한 번에 등록하는 기능입니다. 아래에서 파일을 고르면 형식을 미리 확인할 수 있습니다.</p>
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={onPickFile} className="ec-input" style={{ padding: 4 }} />
              {webFile && (
                <div style={{ marginTop: 10, border: '1px solid #e6eaef', borderRadius: 3, padding: 10, background: '#f9fbfd' }}>
                  <div><b>{webFile.name}</b> · 데이터 <b style={{ color: 'var(--ec-blue-dark)' }}>{webFile.total.toLocaleString()}</b>행 인식</div>
                  {webFile.head.length > 0 && <div style={{ marginTop: 4, color: '#5a626e' }}>헤더: {webFile.head.join(' · ')}</div>}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="ec-btn" disabled title="서버 업로드 API 미구현" style={{ opacity: .55, cursor: 'default' }}>업로드 실행 (백엔드 미연동)</button>
                <span style={{ fontSize: 11.5, color: '#c07a00' }}>* 서버 일괄등록 API가 없어 미리보기까지만 제공합니다.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
