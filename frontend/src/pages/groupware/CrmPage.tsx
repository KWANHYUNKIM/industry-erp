import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CrmActivity, CrmStage, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'

const today = () => new Date().toISOString().slice(0, 10)

const STAGES: { v: CrmStage; label: string; color: string }[] = [
  { v: 'LEAD', label: '리드', color: '#8a929c' },
  { v: 'CONSULTING', label: '상담중', color: 'var(--ec-blue)' },
  { v: 'QUOTE', label: '견적', color: '#c07a00' },
  { v: 'CONTRACT', label: '계약', color: '#1c7c3c' },
  { v: 'LOST', label: '실패', color: '#c60a2e' },
]
const stageColor = (v: CrmStage) => STAGES.find((s) => s.v === v)?.color ?? '#5a626e'

/** 그룹웨어 > 고객관리 — 영업활동/상담 이력 (실연동) */
export default function CrmPage() {
  const [rows, setRows] = useState<CrmActivity[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ activityDate: today(), partnerId: '', contactName: '', charge: '', activity: '', stage: 'LEAD', nextAction: '' })

  async function load() {
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        api.get<CrmActivity[]>('/crm-activities'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(c.data)
      setPartners(p.data)
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
    if (!form.partnerId) return setError('고객사를 선택하세요.')
    try {
      await api.post('/crm-activities', {
        activityDate: form.activityDate,
        partnerId: Number(form.partnerId),
        contactName: form.contactName || undefined,
        charge: form.charge || undefined,
        activity: form.activity || undefined,
        stage: form.stage,
        nextAction: form.nextAction || undefined,
      })
      setForm({ activityDate: today(), partnerId: '', contactName: '', charge: '', activity: '', stage: 'LEAD', nextAction: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function changeStage(row: CrmActivity, stage: CrmStage) {
    try {
      await api.patch(`/crm-activities/${row.id}`, { stage })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || r.partnerName.includes(keyword) || (r.activity ?? '').includes(keyword))

  return (
    <EcListShell
      title="고객관리 (영업활동)"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '활동등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {showForm && (
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>영업활동 등록</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>일자</div>
              <input className="ec-input" type="date" value={form.activityDate} onChange={(e) => set('activityDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>고객사 *</div>
              <select className="ec-input" value={form.partnerId} onChange={(e) => set('partnerId', e.target.value)} style={{ width: 200 }}>
                <option value="">선택하세요</option>
                {partners.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>담당연락처</div>
              <input className="ec-input" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>영업담당</div>
              <input className="ec-input" value={form.charge} onChange={(e) => set('charge', e.target.value)} placeholder="미입력시 본인" style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>단계</div>
              <select className="ec-input" value={form.stage} onChange={(e) => set('stage', e.target.value)} style={{ width: 100 }}>
                {STAGES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>활동내용</div>
              <input className="ec-input" value={form.activity} onChange={(e) => set('activity', e.target.value)} style={{ width: '100%' }} /></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>다음 액션</div>
              <input className="ec-input" value={form.nextAction} onChange={(e) => set('nextAction', e.target.value)} style={{ width: '100%' }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>등록</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        {STAGES.map((s) => (
          <span key={s.v} style={{ fontSize: 11.5, color: '#5a626e' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 4 }} />
            {s.label} {rows.filter((r) => r.stage === s.v).length}
          </span>
        ))}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>일자 ▼</th>
            <th>고객사 ▼</th>
            <th style={{ width: 90 }}>담당연락처</th>
            <th style={{ width: 80 }}>영업담당</th>
            <th>활동내용</th>
            <th style={{ width: 100, textAlign: 'center' }}>단계 ▼</th>
            <th>다음 액션</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>영업활동 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.activityDate}</td>
              <td>{r.partnerName}</td>
              <td>{r.contactName ?? ''}</td>
              <td>{r.charge ?? ''}</td>
              <td>{r.activity ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <select
                  value={r.stage}
                  onChange={(e) => changeStage(r, e.target.value as CrmStage)}
                  className="ec-input"
                  style={{ width: 88, color: stageColor(r.stage), fontWeight: 700, textAlign: 'center' }}
                >
                  {STAGES.map((s) => <option key={s.v} value={s.v} style={{ color: '#333' }}>{s.label}</option>)}
                </select>
              </td>
              <td style={{ color: '#5a626e' }}>{r.nextAction ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
