import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeOption, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'

const inputCls = 'ec-input w-full'

const empty = {
  code: '', name: '', type: 'CUSTOMER', bizRegNo: '', ceoName: '',
  bizType: '', bizItem: '', manager: '', phone: '', address: '',
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [types, setTypes] = useState<CodeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...empty })

  async function load() {
    setLoading(true)
    try {
      const [p, t] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<CodeOption[]>('/meta/partner-types'),
      ])
      setPartners(p.data)
      setTypes(t.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function set(f: keyof typeof form, v: string) {
    setForm((prev) => ({ ...prev, [f]: v }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/partners', form)
      setForm({ ...empty })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(p: Partner) {
    if (!confirm(`거래처 '${p.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/partners/${p.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const typeColor = (t: string) =>
    t === 'CUSTOMER' ? { bg: '#eef4ff', fg: 'var(--ec-blue)' }
      : t === 'SUPPLIER' ? { bg: '#eefaf0', fg: '#2f8401' }
        : { bg: '#f3eefb', fg: '#6b3fb0' }

  return (
    <EcListShell
      title="거래처등록 리스트"
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '계층그룹' }, { label: 'Excel' }, { label: '웹자료올리기' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 거래처 등록</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">거래처코드 *</label>
              <input className={inputCls} value={form.code} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">상호 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">구분 *</label>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)}>
                {types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">사업자번호</label>
              <input className={inputCls} value={form.bizRegNo} onChange={(e) => set('bizRegNo', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">대표자</label>
              <input className={inputCls} value={form.ceoName} onChange={(e) => set('ceoName', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              <input className={inputCls} value={form.manager} onChange={(e) => set('manager', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">업태</label>
              <input className={inputCls} value={form.bizType} onChange={(e) => set('bizType', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">종목</label>
              <input className={inputCls} value={form.bizItem} onChange={(e) => set('bizItem', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">연락처</label>
              <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm text-slate-600">주소</label>
              <input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>거래처코드 ▼</th>
              <th>거래처명 ▼</th>
              <th>구분 ▼</th>
              <th>사업자번호</th>
              <th>대표자</th>
              <th>담당자</th>
              <th>연락처</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : partners.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 거래처가 없습니다.</td></tr>
            ) : (
              partners.map((p, idx) => (
                <tr key={p.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{p.code}</td>
                  <td>{p.name}</td>
                  <td><span style={{ background: typeColor(p.type).bg, color: typeColor(p.type).fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{p.typeName}</span></td>
                  <td>{p.bizRegNo ?? ''}</td>
                  <td>{p.ceoName ?? ''}</td>
                  <td>{p.manager ?? ''}</td>
                  <td>{p.phone ?? ''}</td>
                  <td>
                    <button onClick={() => remove(p)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
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
