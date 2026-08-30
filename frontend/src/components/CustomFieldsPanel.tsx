import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { EntityCustomFields } from '../api/types'

/**
 * 특정 전표(entityType, entityId)의 사용자정의(추가 형식) 필드를 조회·편집·저장하는 재사용 패널.
 * 정의는 Self-Customizing > 사용자정의필드에서 관리하고, 여기서는 값만 입력한다.
 * 정의가 없으면 아무것도 렌더하지 않는다(비침습).
 */
export default function CustomFieldsPanel({ entityType, entityId }: { entityType: string; entityId: number }) {
  const [data, setData] = useState<EntityCustomFields | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setError(''); setOk('')
    try {
      const r = await api.get<EntityCustomFields>('/custom-fields/values', { params: { entityType, entityId } })
      setData(r.data)
      const init: Record<string, string> = {}
      r.data.defs.forEach((d) => { init[d.fieldKey] = r.data.values[d.fieldKey] ?? '' })
      setForm(init)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [entityType, entityId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError(''); setOk(''); setSaving(true)
    try {
      const r = await api.put<EntityCustomFields>('/custom-fields/values', { values: form }, { params: { entityType, entityId } })
      setData(r.data); setOk('저장했습니다.')
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }

  if (!data || data.defs.length === 0) return null
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fafbfc', padding: 12, marginTop: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#3c4553', marginBottom: 8 }}>추가항목 (사용자정의)</div>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '5px 8px', fontSize: 12, borderRadius: 3, marginBottom: 6 }}>{error}</p>}
      {ok && <span style={{ color: '#1c7c3c', fontSize: 12, marginLeft: 6 }}>{ok}</span>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {data.defs.map((d) => (
          <label key={d.fieldKey} style={{ fontSize: 12.5 }}>
            <div style={{ color: '#5a626e', marginBottom: 3 }}>{d.label}{d.required && <span style={{ color: '#c60a2e' }}> *</span>}</div>
            {d.fieldType === 'CODE' ? (
              <select className="ec-input" value={form[d.fieldKey] ?? ''} onChange={(e) => set(d.fieldKey, e.target.value)} style={{ width: 160 }}>
                <option value="">선택</option>
                {(d.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : d.fieldType === 'DATE' ? (
              <input type="date" className="ec-input" value={form[d.fieldKey] ?? ''} onChange={(e) => set(d.fieldKey, e.target.value)} style={{ width: 150 }} />
            ) : d.fieldType === 'NUMBER' ? (
              <input type="number" step="any" className="ec-input text-right" value={form[d.fieldKey] ?? ''} onChange={(e) => set(d.fieldKey, e.target.value)} style={{ width: 130 }} />
            ) : (
              <input className="ec-input" value={form[d.fieldKey] ?? ''} onChange={(e) => set(d.fieldKey, e.target.value)} style={{ width: 180 }} />
            )}
          </label>
        ))}
        {/*
          <b>type 을 안 적으면 submit 이다.</b> 이 패널을 등록 폼 안에 넣는 순간
          [추가항목 저장] 을 누르면 <b>바깥 폼이 대신 넘어간다</b> — 값은 안 저장되고
          엉뚱하게 품목이 수정된다. 폼 밖(전표조회)에서만 쓰던 때는 안 보이던 함정이다.
        */}
        <button type="button" className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '추가항목 저장'}</button>
      </div>
    </div>
  )
}
