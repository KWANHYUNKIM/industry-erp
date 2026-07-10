import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Bom, Item } from '../../api/types'
import EcListShell from '../../components/EcListShell'

const inputCls = 'ec-input'

interface LineInput { componentId: string; quantity: string }
const emptyLine = (): LineInput => ({ componentId: '', quantity: '' })

export default function BomPage() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [productId, setProductId] = useState('')
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  async function load() {
    setLoading(true)
    try {
      const [b, i] = await Promise.all([api.get<Bom[]>('/boms'), api.get<Item[]>('/items')])
      setBoms(b.data)
      setItems(i.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openNew() {
    setProductId('')
    setRemark('')
    setLines([emptyLine()])
    setShowForm(true)
  }

  function editBom(b: Bom) {
    setProductId(String(b.productId))
    setRemark(b.remark ?? '')
    setLines(b.lines.map((l) => ({ componentId: String(l.componentId), quantity: String(l.quantity) })))
    setShowForm(true)
  }

  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const validLines = lines
      .filter((l) => l.componentId && Number(l.quantity) > 0)
      .map((l) => ({ componentId: Number(l.componentId), quantity: Number(l.quantity) }))
    if (!productId) return setError('제품을 선택하세요.')
    if (validLines.length === 0) return setError('자재를 1개 이상 입력하세요.')
    try {
      await api.post('/boms', { productId: Number(productId), remark: remark || undefined, lines: validLines })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(b: Bom) {
    if (!confirm(`'${b.productName}' BOM을 삭제할까요?`)) return
    try {
      await api.delete(`/boms/${b.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const itemLabel = (it: Item) => `[${it.code}] ${it.name}`

  return (
    <EcListShell
      title="BOM(자재명세서) 리스트"
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={showForm ? () => setShowForm(false) : openNew}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>BOM 등록 / 수정</div>
          <table className="w-full text-left" style={{ marginBottom: 10, maxWidth: 720 }}>
            <tbody>
              <tr>
                <th style={{ background: '#f5f7fa', fontWeight: 700, width: 120 }}>제품(생산 대상) *</th>
                <td>
                  <select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)} style={{ minWidth: 240 }}>
                    <option value="">선택하세요</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}
                  </select>
                </td>
                <th style={{ background: '#f5f7fa', fontWeight: 700, width: 60 }}>비고</th>
                <td><input className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ minWidth: 200 }} /></td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a626e', margin: '6px 0 4px' }}>구성 자재 (제품 1단위당 소요량)</div>
          <table className="w-full text-left" style={{ maxWidth: 720 }}>
            <thead>
              <tr><th>자재</th><th style={{ width: 150, textAlign: 'right' }}>소요량</th><th style={{ width: 40 }}></th></tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td>
                    <select className={inputCls} value={l.componentId} onChange={(e) => updateLine(idx, 'componentId', e.target.value)} style={{ width: '100%' }}>
                      <option value="">선택</option>
                      {items.filter((it) => String(it.id) !== productId).map((it) => (
                        <option key={it.id} value={it.id}>{itemLabel(it)}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="number" step="any" className={inputCls} value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" onClick={() => setLines((ls) => ls.length === 1 ? ls : ls.filter((_, i) => i !== idx))} className="no-ec" style={{ border: 'none', background: 'none', color: '#c0c5cc', cursor: 'pointer' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="ec-btn" style={{ marginTop: 6 }}>+ 자재 추가</button>

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">저장</button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
        ) : boms.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20, border: '1px solid var(--ec-border)', background: '#fff' }}>등록된 BOM이 없습니다.</p>
        ) : (
          boms.map((b) => (
            <div key={b.id} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#8a929c' }}>{b.productCode}</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-text)' }}>{b.productName}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => editBom(b)} className="no-ec" style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>수정</button>
                  <button onClick={() => remove(b)} className="no-ec" style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </div>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr><th>구성 자재</th><th style={{ textAlign: 'right', width: 150 }}>소요량</th><th style={{ width: 80 }}>단위</th></tr>
                </thead>
                <tbody>
                  {b.lines.map((l) => (
                    <tr key={l.componentId}>
                      <td>[{l.componentCode}] {l.componentName}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.quantity.toLocaleString()}</td>
                      <td style={{ color: '#5a626e' }}>{l.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </EcListShell>
  )
}
