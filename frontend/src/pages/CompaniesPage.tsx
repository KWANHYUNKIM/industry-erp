import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { Company } from '../api/types'
import EcListShell from '../components/EcListShell'

/** 회사(테넌트) 관리 — 본사 관리자만. 회사를 만들면 전용 데이터 스키마와 첫 관리자 계정이
 *  자동 생성되고, 발급된 회사코드로 그 회사에 로그인한다. */
export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [created, setCreated] = useState<Company | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<Company[]>('/companies')
      setCompanies(r.data)
    } catch (err) {
      setError(extractErrorMessage(err, '회사 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <EcListShell
      title="회사관리 리스트"
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={() => { setShowForm((v) => !v); setCreated(null) }}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {created && (
        <div style={{ marginBottom: 8, padding: '10px 14px', background: '#eef7ee', border: '1px solid #bfe3bf', borderRadius: 4, fontSize: 13 }}>
          <b>{created.name}</b> 회사가 생성되었습니다. 회사코드 <b style={{ color: 'var(--ec-blue)' }}>{created.code}</b> 로 로그인하세요.
        </div>
      )}

      {showForm && (
        <CreateCompanyForm
          onCreated={(c) => {
            setShowForm(false)
            setCreated(c)
            load()
          }}
        />
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>회사코드 ▼</th>
            <th>회사명</th>
            <th>데이터 스키마</th>
            <th style={{ textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : companies.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 회사가 없습니다.</td></tr>
          ) : (
            companies.map((c, idx) => (
              <tr key={c.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {c.code}
                  {c.schemaName === 'public' && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#9aa1ab' }}>본사</span>}
                </td>
                <td>{c.name}</td>
                <td style={{ fontFamily: 'monospace', color: '#6b7280' }}>{c.schemaName}</td>
                <td style={{ textAlign: 'center', color: c.active ? '#1c7c3c' : '#9aa1ab' }}>
                  {c.active ? '사용' : '중지'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}

function CreateCompanyForm({ onCreated }: { onCreated: (c: Company) => void }) {
  const [form, setForm] = useState({ name: '', adminUsername: '', adminPassword: '', adminName: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const r = await api.post<Company>('/companies', {
        name: form.name,
        adminUsername: form.adminUsername,
        adminPassword: form.adminPassword,
        adminName: form.adminName || undefined,
      })
      onCreated(r.data)
    } catch (err) {
      setError(extractErrorMessage(err, '회사 생성에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'ec-input w-full'

  return (
    <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 회사 등록</div>
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        회사코드는 자동 발급됩니다. 회사마다 데이터가 완전히 분리되며, 아래 관리자 계정으로 그 회사에 처음 로그인합니다.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-slate-600">회사명 *</label>
          <input className={inputCls} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="예: (주)새회사" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">관리자 이름</label>
          <input className={inputCls} value={form.adminName} onChange={(e) => update('adminName', e.target.value)} placeholder="예: 홍길동" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">관리자 아이디 *</label>
          <input className={inputCls} value={form.adminUsername} onChange={(e) => update('adminUsername', e.target.value)} placeholder="이 회사의 첫 관리자 아이디" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">관리자 비밀번호 *</label>
          <input type="password" className={inputCls} value={form.adminPassword} onChange={(e) => update('adminPassword', e.target.value)} />
        </div>
      </div>

      {error && <p style={{ marginTop: 10, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={submitting} className="ec-btn ec-btn-primary">
          {submitting ? '생성 중…' : '회사 생성'}
        </button>
      </div>
    </form>
  )
}
