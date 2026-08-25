import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Project } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 회계 > 프로젝트 > 프로젝트계획 / 계획·실적현황 (이카운트 C000653·E040636·E040637)
 * 프로젝트별 연간 계획 매출·원가를 등록하고, 전표 집계 실적과 대조해 달성률을 본다.
 * 백엔드 신규: project_plans 테이블 + /api/project-plans, /api/project-plans/comparison?year=
 * 실적은 저장하지 않고 판매·구매·비용 전표를 프로젝트로 집계(ProjectProfitService)해 계산한다.
 */
interface ComparisonRow {
  id: number
  planYear: number
  projectId: number
  projectCode: string
  projectName: string
  planRevenue: number
  planCost: number
  planProfit: number
  actualRevenue: number
  actualCost: number
  actualProfit: number
  revenueAchieveRate: number
  profitAchieveRate: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const rateColor = (r: number) => (r >= 100 ? '#1c7c3c' : r >= 80 ? '#c07a00' : '#c60a2e')
const thisYear = () => Number(ymd(new Date()).slice(0, 4))

export default function ProjectPlanPage() {
  const [year, setYear] = useState<number>(thisYear())
  const [rows, setRows] = useState<ComparisonRow[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({ projectId: '', planRevenue: '', planCost: '', remark: '' })

  async function load() {
    setLoading(true); setError('')
    try {
      const [c, p] = await Promise.all([
        api.get<ComparisonRow[]>('/project-plans/comparison', { params: { year } }),
        api.get<Project[]>('/projects'),
      ])
      setRows(c.data); setProjects(p.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [year]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (!form.projectId) return setError('프로젝트를 선택하세요.')
    try {
      await api.post('/project-plans', {
        projectId: Number(form.projectId),
        planYear: year,
        planRevenue: Number(form.planRevenue || 0),
        planCost: Number(form.planCost || 0),
        remark: form.remark || undefined,
      })
      setOk('프로젝트계획이 등록되었습니다.')
      setForm({ projectId: '', planRevenue: '', planCost: '', remark: '' })
      setShowForm(false)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!confirm('이 계획을 삭제할까요?')) return
    setError(''); setOk('')
    try { await api.delete(`/project-plans/${id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const totals = rows.reduce((s, r) => ({
    planRevenue: s.planRevenue + r.planRevenue, planProfit: s.planProfit + r.planProfit,
    actualRevenue: s.actualRevenue + r.actualRevenue, actualProfit: s.actualProfit + r.actualProfit,
  }), { planRevenue: 0, planProfit: 0, actualRevenue: 0, actualProfit: 0 })
  const inputCls = 'ec-input'
  const years = [thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2]

  return (
    <EcListShell
      title="프로젝트계획"
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">프로젝트별 연간 계획 매출·원가 등록 → 전표 집계 실적과 대조(달성률). 실적은 판매·구매·비용 전표에서 계산.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>계획연도</span>
        <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <Modal open={showForm} title={`프로젝트계획 등록 (${year}년)`} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>프로젝트 *</div>
              <select className={inputCls} value={form.projectId} onChange={(e) => set('projectId', e.target.value)} style={{ width: 240 }}>
                <option value="">선택하세요</option>
                {projects.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>계획매출</div>
              <input className={`${inputCls} text-right`} type="number" step="any" value={form.planRevenue} onChange={(e) => set('planRevenue', e.target.value)} style={{ width: 150 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>계획원가</div>
              <input className={`${inputCls} text-right`} type="number" step="any" value={form.planCost} onChange={(e) => set('planCost', e.target.value)} style={{ width: 150 }} /></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>비고</div>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: '100%' }} /></label>
            <button type="submit" className="ec-btn ec-btn-primary">저장</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>프로젝트</th>
            <th style={{ textAlign: 'right' }}>계획매출</th>
            <th style={{ textAlign: 'right' }}>실적매출</th>
            <th style={{ textAlign: 'right' }}>매출달성</th>
            <th style={{ textAlign: 'right' }}>계획이익</th>
            <th style={{ textAlign: 'right' }}>실적이익</th>
            <th style={{ textAlign: 'right' }}>이익달성</th>
            <th style={{ textAlign: 'center', width: 50 }}>삭제</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{year}년 프로젝트계획이 없습니다. 우측 상단에서 등록하세요.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td><span style={{ fontFamily: 'monospace', color: '#8a929c', marginRight: 5 }}>{r.projectCode}</span>{r.projectName}</td>
              <td style={{ textAlign: 'right' }}>{won(r.planRevenue)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.actualRevenue)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: rateColor(r.revenueAchieveRate) }}>{r.revenueAchieveRate.toFixed(1)}%</td>
              <td style={{ textAlign: 'right' }}>{won(r.planProfit)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.actualProfit >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(r.actualProfit)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: rateColor(r.profitAchieveRate) }}>{r.profitAchieveRate.toFixed(1)}%</td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => remove(r.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(totals.planRevenue)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.actualRevenue)}</td>
              <td style={{ textAlign: 'right', color: rateColor(totals.planRevenue > 0 ? totals.actualRevenue / totals.planRevenue * 100 : 0) }}>
                {totals.planRevenue > 0 ? (totals.actualRevenue / totals.planRevenue * 100).toFixed(1) : '0.0'}%
              </td>
              <td style={{ textAlign: 'right' }}>{won(totals.planProfit)}</td>
              <td style={{ textAlign: 'right', color: totals.actualProfit >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(totals.actualProfit)}</td>
              <td></td><td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
