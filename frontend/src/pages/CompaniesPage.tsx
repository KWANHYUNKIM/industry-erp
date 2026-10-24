import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { Company } from '../types/api'
import EcListShell from '../components/EcListShell'
import EcDateField from '../components/EcDateField'
import Modal from '../components/Modal'
import { useTableSort } from '../utils/useTableSort'

/** 회사(테넌트) 관리 — 본사 관리자만. 회사를 만들면 전용 데이터 스키마와 첫 관리자 계정이
 *  자동 생성되고, 발급된 회사코드로 그 회사에 로그인한다. */
export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Company | null>(null)
  const [editing, setEditing] = useState<Company | null>(null)

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


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(companies, {
    회사코드: (c) => c.code,
  })

  return (
    <EcListShell
      title="회사관리 리스트"
      formTitle="새 회사 등록"
      renderForm={(close) => (
        <CreateCompanyForm
          onCreated={(c) => {
            setCreated(c)
            close()
            load()
          }}
        />
      )}
      actions={[{ label: 'Excel' }]}
    >
      {error && <p className="mb-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}

      {created && (
        <div style={{ marginBottom: 8, padding: '10px 14px', background: '#eef7ee', border: '1px solid #bfe3bf', borderRadius: 4, fontSize: 13 }}>
          <b>{created.name}</b> 회사가 생성되었습니다. 회사코드 <b className="text-ec-blue">{created.code}</b> 로 로그인하세요.
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="cursor-pointer" onClick={() => sort.toggle('회사코드')}>회사코드 {sort.mark('회사코드')}</th>
            <th>회사명</th>
            <th>데이터 스키마</th>
            <th className="text-right">사용자 수</th>
            <th className="text-center">사용기한</th>
            <th className="text-center">상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : companies.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            sort.sorted.map((c, idx) => (
              <tr key={c.id}>
                <td className="text-center text-ec-hint">{idx + 1}</td>
                <td className="font-bold">
                  <a className="ec-link" onClick={() => setEditing(c)}>{c.code}</a>
                  {c.schemaName === 'public' && <span className="ml-[6px] text-[10.5px] text-ec-hint">본사</span>}
                </td>
                <td>{c.name}</td>
                <td className="text-ec-muted">{c.schemaName}</td>
                <td className="text-right">{c.maxUsers ?? '제한 없음'}</td>
                <td className="text-center">{c.expiresOn ?? '무기한'}</td>
                <td style={{ textAlign: 'center', color: statusOf(c) === '사용' ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>
                  {statusOf(c)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {editing && (
        <EditCompanyModal
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </EcListShell>
  )
}

/** 로그인할 수 있는 상태인가 — 서버 Company.usableOn 과 같은 판단(기한 당일까지 쓴다). */
function statusOf(c: Company): string {
  if (!c.active) return '중지'
  if (c.expiresOn && c.expiresOn < todayIso()) return '기한지남'
  return '사용'
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 사용자 수 한도 · 사용기한 두 칸. 비우면 제한 없음 · 무기한. */
function LimitFields({ maxUsers, expiresOn, onChange, disabled }: {
  maxUsers: string
  expiresOn: string
  onChange: (k: 'maxUsers' | 'expiresOn', v: string) => void
  disabled?: boolean
}) {
  return (
    <>
      <div>
        <label className="mb-1 block text-sm text-ec-label">사용자 수</label>
        <input className="ec-input w-full" inputMode="numeric" value={maxUsers} disabled={disabled}
          onChange={(e) => onChange('maxUsers', e.target.value.replace(/[^0-9]/g, ''))} placeholder="비우면 제한 없음" />
      </div>
      <div>
        <label className="mb-1 block text-sm text-ec-label">사용기한</label>
        <div className="flex items-center gap-[6px]">
          <label className="flex items-center gap-[4px] text-sm whitespace-nowrap">
            <input type="checkbox" checked={!expiresOn} disabled={disabled}
              onChange={(e) => onChange('expiresOn', e.target.checked ? '' : todayIso())} />
            무기한
          </label>
          {expiresOn && <EcDateField value={expiresOn} onChange={(v) => onChange('expiresOn', v)} disabled={disabled} />}
        </div>
      </div>
    </>
  )
}

function EditCompanyModal({ company, onClose, onSaved }: { company: Company; onClose: () => void; onSaved: () => void }) {
  const host = company.schemaName === 'public'
  const [form, setForm] = useState({
    name: company.name,
    active: company.active,
    maxUsers: company.maxUsers == null ? '' : String(company.maxUsers),
    expiresOn: company.expiresOn ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setError('')
    setSaving(true)
    try {
      await api.put(`/companies/${company.id}`, {
        name: form.name,
        active: form.active,
        maxUsers: form.maxUsers === '' ? null : Number(form.maxUsers),
        expiresOn: form.expiresOn || null,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err, '회사를 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={`회사 수정 — ${company.code}`} onClose={onClose} error={error} width={560}>
      {host && <p className="text-[12px] text-ec-muted mb-[10px]">본사는 사용 중지 · 사용기한 · 사용자 수 제한을 걸 수 없습니다.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-ec-label">회사명 *</label>
          <input className="ec-input w-full" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ec-label">사용여부</label>
          <label className="flex items-center gap-[4px] text-sm">
            <input type="checkbox" checked={form.active} disabled={host}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            사용
          </label>
        </div>
        <LimitFields maxUsers={form.maxUsers} expiresOn={form.expiresOn} disabled={host}
          onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
      </div>
      <div className="mt-[12px] flex justify-end gap-[6px]">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={save}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </Modal>
  )
}

function CreateCompanyForm({ onCreated }: { onCreated: (c: Company) => void }) {
  const [form, setForm] = useState({ name: '', adminUsername: '', adminPassword: '', adminName: '', maxUsers: '', expiresOn: '' })
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
        maxUsers: form.maxUsers === '' ? null : Number(form.maxUsers),
        expiresOn: form.expiresOn || null,
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
    <form onSubmit={submit}>
      <p className="text-[12px] text-ec-muted mb-[10px]">
        회사코드는 자동 발급됩니다. 회사마다 데이터가 완전히 분리되며, 아래 관리자 계정으로 그 회사에 처음 로그인합니다.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-ec-label">회사명 *</label>
          <input className={inputCls} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="예: (주)새회사" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ec-label">관리자 이름</label>
          <input className={inputCls} value={form.adminName} onChange={(e) => update('adminName', e.target.value)} placeholder="예: 홍길동" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ec-label">관리자 아이디 *</label>
          <input className={inputCls} value={form.adminUsername} onChange={(e) => update('adminUsername', e.target.value)} placeholder="이 회사의 첫 관리자 아이디" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ec-label">관리자 비밀번호 *</label>
          <input type="password" className={inputCls} value={form.adminPassword} onChange={(e) => update('adminPassword', e.target.value)} />
        </div>
        <LimitFields maxUsers={form.maxUsers} expiresOn={form.expiresOn} onChange={update} />
      </div>

      {error && <p className="ec-alert ec-alert-danger mt-[10px]">{error}</p>}

      <div className="mt-[12px] flex justify-end">
        <button type="submit" disabled={submitting} className="ec-btn ec-btn-primary">
          {submitting ? '생성 중…' : '회사 생성'}
        </button>
      </div>
    </form>
  )
}
