import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

type Division = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
const DIV_LABEL: Record<Division, string> = { ASSET: '자산', LIABILITY: '부채', EQUITY: '자본', REVENUE: '수익', EXPENSE: '비용' }
const DIV_COLOR: Record<Division, string> = { ASSET: '#1c6fb0', LIABILITY: '#c07a00', EQUITY: '#7a5cc0', REVENUE: '#1c7c3c', EXPENSE: '#c60a2e' }
const DIVISIONS: Division[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']

interface Account {
  id: number
  code: string
  name: string
  division: Division
  divisionName: string
  detailCategory: string | null
  active: boolean
}

/** 회계 기초등록 > 계정과목등록 (실제 연동) */
export default function AccountsPage() {
  const [rows, setRows] = useState<Account[]>([])
  const [keyword, setKeyword] = useState('')
  const [div, setDiv] = useState<Division | '전체'>('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', division: 'EXPENSE' as Division, detailCategory: '' })

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<Account[]>('/accounts')
      setRows(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.code.trim()) return setError('계정코드를 입력하세요.')
    if (!form.name.trim()) return setError('계정과목명을 입력하세요.')
    try {
      await api.post('/accounts', {
        code: form.code, name: form.name, division: form.division,
        detailCategory: form.detailCategory || undefined,
      })
      setForm({ code: '', name: '', division: 'EXPENSE', detailCategory: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function toggleActive(a: Account) {
    try {
      await api.patch(`/accounts/${a.id}`, { active: !a.active })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows
    .filter((r) => div === '전체' || r.division === div)
    .filter((r) => !keyword || r.code.includes(keyword) || r.name.includes(keyword))

  return (
    <EcListShell
      title="계정과목등록"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {showForm && (
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>계정과목 등록</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>계정코드 *</div>
              <input className="ec-input" value={form.code} onChange={(e) => set('code', e.target.value)} style={{ width: 100 }} placeholder="811" /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>계정과목명 *</div>
              <input className="ec-input" value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 200 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>구분 *</div>
              <select className="ec-input" value={form.division} onChange={(e) => set('division', e.target.value)} style={{ width: 100 }}>
                {DIVISIONS.map((d) => <option key={d} value={d}>{DIV_LABEL[d]}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>세부분류</div>
              <input className="ec-input" value={form.detailCategory} onChange={(e) => set('detailCategory', e.target.value)} style={{ width: 160 }} placeholder="판매관리비" /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {(['전체', ...DIVISIONS] as const).map((d) => (
          <button key={d} onClick={() => setDiv(d)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: div === d ? 'var(--ec-blue)' : '#fff',
            color: div === d ? '#fff' : '#3a4453',
            fontWeight: div === d ? 700 : 400,
          }}>{d === '전체' ? '전체' : DIV_LABEL[d]}</button>
        ))}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>계정코드 ▼</th>
            <th>계정과목명 ▼</th>
            <th style={{ width: 90, textAlign: 'center' }}>구분 ▼</th>
            <th style={{ width: 140 }}>세부분류</th>
            <th style={{ width: 100, textAlign: 'center' }}>사용 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>계정과목이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td style={{ color: r.active ? undefined : '#b3b8bf' }}>{r.name}</td>
              <td style={{ textAlign: 'center', color: DIV_COLOR[r.division], fontWeight: 700 }}>{r.divisionName}</td>
              <td>{r.detailCategory ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => toggleActive(r)} style={{
                  border: '1px solid var(--ec-border)', borderRadius: 3, cursor: 'pointer', fontSize: 11.5, padding: '2px 8px',
                  background: r.active ? '#eaf6ec' : '#f5f5f5', color: r.active ? '#1c7c3c' : '#9aa1ab',
                }}>{r.active ? '사용' : '중단'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
