import { useEffect, useState, type FormEvent, useRef} from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Bom, Item } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'

const inputCls = 'ec-input'

interface LineInput { componentId: string; quantity: string }
const emptyLine = (): LineInput => ({ componentId: '', quantity: '' })

export default function BomPage() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 저장 결과 안내 — 예전엔 창이 닫히고 목록만 다시 떴다(QA 22회차). */
  const [ok, setOk] = useState('')
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
    setError(''); setOk('')
    const validLines = lines
      .filter((l) => l.componentId && Number(l.quantity) > 0)
      .map((l) => ({ componentId: Number(l.componentId), quantity: Number(l.quantity) }))
    if (!productId) return setError('제품을 선택하세요.')
    if (validLines.length === 0) return setError('자재를 1개 이상 입력하세요.')
    try {
      const res = await api.post<{ productCode: string; productName: string }>('/boms', { productId: Number(productId), remark: remark || undefined, lines: validLines })
      setOk(`[${res.data.productCode}] ${res.data.productName} BOM 저장 — 자재 ${validLines.length}종`)
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

  // 중단 품목은 빼되, 수정 중인 BOM 이 이미 쓰고 있는 것은 남긴다(안 남기면 칸이 비어 보인다)
  const itemCodes = items.filter((it) => it.active !== false || String(it.id) === productId
      || lines.some((l) => l.componentId === String(it.id)))
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'BOM 등록', [])

  return (
    <EcListShell
      title="BOM(자재명세서) 리스트"
      onNew={showForm ? () => setShowForm(false) : openNew}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {ok && <p style={{ marginBottom: 8, background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{ok}</p>}

      <Modal error={error} open={showForm} title="BOM(자재명세서) 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>BOM 등록 / 수정</div>
          <table className="w-full text-left" style={{ marginBottom: 10, maxWidth: 720 }}>
            <tbody>
              <tr>
                <th style={{ background: '#f5f7fa', fontWeight: 700, width: 120 }}>제품(생산 대상) *</th>
                <td>
                  {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
                  <CodePickerField label="제품" hideLabel width={240} placeholder="제품" emptyLabel="선택 해제"
                                   value={productId} onChange={setProductId} items={itemCodes} />
                </td>
                <th style={{ background: '#f5f7fa', fontWeight: 700, width: 60 }}>비고</th>
                <td><input className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ minWidth: 200 }} /></td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5a626e', margin: '6px 0 4px' }}>구성 자재 (제품 1단위당 소요량)</div>
          <table ref={tableRef} className="w-full text-left" style={{ maxWidth: 720 }}>
            <thead>
              <tr><th>자재</th><th style={{ width: 150, textAlign: 'right' }}>소요량</th><th style={{ width: 40 }}></th></tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td>
                    <CodePickerField label="자재" hideLabel fill placeholder="자재" emptyLabel="선택 해제"
                                     value={l.componentId} onChange={(v) => updateLine(idx, 'componentId', v)}
                                     items={itemCodes.filter((c) => c.value !== productId)} />
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
      )}</Modal>

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
