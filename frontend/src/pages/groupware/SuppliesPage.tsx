import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

interface Supply {
  id: number
  code: string
  name: string
  category: string | null
  unit: string | null
  stockQty: number
  note: string | null
}

/** 그룹웨어 > 공용품관리 — 사내 공용품 재고 등록·관리 (실제 연동) */
export default function SuppliesPage() {
  const [rows, setRows] = useState<Supply[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('사무용품')
  const [unit, setUnit] = useState('개')
  const [stockQty, setStockQty] = useState('')
  const [note, setNote] = useState('')

  async function load() {
    try { setRows((await api.get<Supply[]>('/supplies')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!code.trim() || !name.trim()) return setError('품목코드와 공용품명을 입력하세요.')
    try {
      await api.post<Supply>('/supplies', {
        code, name, category, unit, stockQty: stockQty ? Number(stockQty) : 0, note: note || undefined,
      })
      setOk('공용품 등록 완료')
      setCode(''); setName(''); setStockQty(''); setNote('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(s: Supply) {
    if (!confirm(`[${s.name}] 공용품을 삭제하시겠습니까?`)) return
    try { await api.delete(`/supplies/${s.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword))
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 84 }

  return (
    <EcListShell
      title="공용품관리"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '공용품등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">사내 공용품 재고 등록·관리 · 등록/삭제는 관리자·매니저 권한</p>

      <Modal open={showForm} title="공용품 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>품목코드 *</th>
                <td><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 150 }} placeholder="SP-006" /></td>
                <th style={th}>공용품명 *</th>
                <td><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th style={th}>분류</th>
                <td><input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>단위</th>
                <td><input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 100 }} /></td>
              </tr>
              <tr>
                <th style={th}>재고수량</th>
                <td><input type="number" className={inputCls} value={stockQty} onChange={(e) => setStockQty(e.target.value)} style={{ width: 120 }} min={0} step="0.01" /></td>
                <th style={th}>비고</th>
                <td><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}</Modal>

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 110 }}>품목코드</th>
            <th>공용품명</th>
            <th style={{ width: 100 }}>분류</th>
            <th style={{ width: 100, textAlign: 'right' }}>재고수량</th>
            <th style={{ width: 70 }}>단위</th>
            <th>비고</th>
            <th style={{ width: 70, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>공용품이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.category ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{Number(r.stockQty).toLocaleString()}</td>
              <td>{r.unit ?? ''}</td>
              <td style={{ color: '#6b7280' }}>{r.note ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
