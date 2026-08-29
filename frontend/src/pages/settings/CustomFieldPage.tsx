import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { CustomFieldDef, CustomFieldType } from '../../api/types'

/**
 * Self-Customizing > 사용자정의필드 (판매입력 II 등 '추가 형식필드'의 정의 관리)
 * 화면(entityType)마다 문자/숫자/일자/코드 형식 필드를 정의하면, 해당 전표 화면에 추가항목으로 나타난다.
 * 백엔드 신규: custom_field_defs/values + /api/custom-fields.
 */
const TYPE_LABEL: Record<CustomFieldType, string> = { TEXT: '문자', NUMBER: '숫자', DATE: '일자', CODE: '코드' }
// 대상 화면 목록(현재는 판매전표. 확장 시 추가)
const ENTITY_TYPES = [{ key: 'SALES', label: '판매전표(판매입력 II)' }]
const emptyForm = { fieldKey: '', label: '', fieldType: 'TEXT' as CustomFieldType, options: '', required: false, sortOrder: '0' }

export default function CustomFieldPage() {
  const [entityType, setEntityType] = useState('SALES')
  const [rows, setRows] = useState<CustomFieldDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.get<CustomFieldDef[]>('/custom-fields/defs', { params: { entityType } })
      setRows(r.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [entityType]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  function openNew() { setEditId(null); setForm({ ...emptyForm, sortOrder: String(rows.length) }); setShowForm(true) }
  function openEdit(d: CustomFieldDef) {
    setEditId(d.id)
    setForm({ fieldKey: d.fieldKey, label: d.label, fieldType: d.fieldType, options: d.options ?? '', required: d.required, sortOrder: String(d.sortOrder) })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (!form.label.trim()) return setError('라벨을 입력하세요.')
    const body = {
      label: form.label, fieldType: form.fieldType,
      options: form.fieldType === 'CODE' ? form.options : undefined,
      required: form.required, sortOrder: Number(form.sortOrder) || 0,
    }
    try {
      if (editId) { await api.put(`/custom-fields/defs/${editId}`, body); setOk('필드를 수정했습니다.') }
      else {
        if (!form.fieldKey.trim()) return setError('필드 키를 입력하세요.')
        await api.post('/custom-fields/defs', { entityType, fieldKey: form.fieldKey, ...body }); setOk('필드를 추가했습니다.')
      }
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleActive(d: CustomFieldDef) {
    setError('')
    try { await api.put(`/custom-fields/defs/${d.id}`, { label: d.label, fieldType: d.fieldType, options: d.options, required: d.required, sortOrder: d.sortOrder, active: !d.active }); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!confirm('이 필드를 삭제할까요? (입력된 값은 남습니다)')) return
    setError('')
    try { await api.delete(`/custom-fields/defs/${id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const inputCls = 'ec-input'

  return (
    <EcListShell title="사용자정의필드" onNew={openNew} actions={[{ label: '새로고침', onClick: load }]}>
      <p className="mb-2 text-xs text-slate-500">화면(전표)마다 추가 형식필드를 정의합니다. 정의하면 해당 전표 화면의 '추가항목'으로 나타나 값 입력이 가능해집니다(우리 전표 모델은 변경하지 않는 범용 방식).</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>대상 화면</span>
        <select className={inputCls} value={entityType} onChange={(e) => setEntityType(e.target.value)} style={{ width: 220 }}>
          {ENTITY_TYPES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <Modal open={showForm} title={editId ? '사용자정의필드 수정' : '사용자정의필드 추가'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>필드 키 *</div>
              <input className={inputCls} value={form.fieldKey} disabled={!!editId} onChange={(e) => set('fieldKey', e.target.value)} style={{ width: 130 }} placeholder="예: channel" /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>라벨 *</div>
              <input className={inputCls} value={form.label} onChange={(e) => set('label', e.target.value)} style={{ width: 160 }} placeholder="예: 판매채널" /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>형식 *</div>
              <select className={inputCls} value={form.fieldType} onChange={(e) => set('fieldType', e.target.value)} style={{ width: 100 }}>
                <option value="TEXT">문자</option><option value="NUMBER">숫자</option><option value="DATE">일자</option><option value="CODE">코드</option>
              </select></label>
            {form.fieldType === 'CODE' && (
              <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>코드 선택지(콤마)</div>
                <input className={inputCls} value={form.options} onChange={(e) => set('options', e.target.value)} style={{ width: 200 }} placeholder="온라인,오프라인,B2B" /></label>
            )}
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>정렬</div>
              <input className={`${inputCls} text-right`} type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} style={{ width: 70 }} /></label>
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={form.required} onChange={(e) => set('required', e.target.checked)} /> 필수
            </label>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '저장'}</button>
          </div>
          {editId && <p style={{ fontSize: 11.5, color: '#8a929c', marginTop: 8 }}>필드 키는 값과 연결되므로 수정할 수 없습니다.</p>}
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th style={{ textAlign: 'right', width: 60 }}>정렬</th>
          <th style={{ width: 140 }}>필드 키</th>
          <th>라벨</th>
          <th style={{ width: 70 }}>형식</th>
          <th>선택지</th>
          <th style={{ textAlign: 'center', width: 50 }}>필수</th>
          <th style={{ textAlign: 'center', width: 80 }}>사용</th>
          <th style={{ textAlign: 'center', width: 90 }}>관리</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((d) => (
            <tr key={d.id} style={{ opacity: d.active ? 1 : 0.5 }}>
              <td></td>
              <td style={{ textAlign: 'right', color: '#9aa1ab' }}>{d.sortOrder}</td>
              <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{d.fieldKey}</td>
              <td>{d.label}</td>
              <td>{TYPE_LABEL[d.fieldType]}</td>
              <td style={{ color: '#6b7280' }}>{d.options ?? ''}</td>
              <td style={{ textAlign: 'center' }}>{d.required ? '●' : ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => toggleActive(d)} style={{ border: '1px solid var(--ec-border)', background: d.active ? '#eaf6ec' : '#f2f3f5', color: d.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>{d.active ? '사용' : '중단'}</button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => openEdit(d)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>수정</button>
                <button className="no-ec" onClick={() => remove(d.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
