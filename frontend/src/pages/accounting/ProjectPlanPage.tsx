import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Project } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

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
  /* 원본 격자의 [구매]·[노무비]·[경비]. 판매는 planRevenue 가 곧 그것이다. */
  planPurchase: number
  planLabor: number
  planExpense: number
  startDate: string | null
  endDate: string | null
  remark: string | null
}

const won = (n: number) => n.toLocaleString('ko-KR')
const rateColor = (r: number) => (r >= 100 ? '#1c7c3c' : r >= 80 ? '#c07a00' : '#c60a2e')
const thisYear = () => Number(ymd(new Date()).slice(0, 4))

/**
 * 금액 구간 조건. 원본은 [판매계획]·[구매계획]·[노무비계획]·[경비계획] 넷을 다
 * <b>[   ] ~ [   ]</b> 두 칸으로 받는다(2026-09-01 E040636 실측).
 * 한쪽만 적어도 걸리게 둔다 — 원본도 한쪽만 채우면 그쪽만 건다.
 */
function inRange(v: number, from: string, to: string) {
  if (from !== '' && v < Number(from)) return false
  if (to !== '' && v > Number(to)) return false
  return true
}

export default function ProjectPlanPage() {
  const [year, setYear] = useState<number>(thisYear())
  const [rows, setRows] = useState<ComparisonRow[]>([])
  const [projectCond, setProjectCond] = useState('')
  /*
   * 원본 프로젝트계획 조건 차례: 프로젝트 · <b>시작일</b> · <b>종료일</b> ·
   * 판매계획 · 구매계획 · 노무비계획 · 경비계획 · <b>적요</b>.
   * 셋 다 값이 응답에 실려 오지도 않아 <b>볼 수도 거를 수도 없었다</b> — 서버에서 같이 싣고
   * 조건을 만든다. 가운데 네 계획은 우리 계획이 매출·이익 두 값이라 축 자체가 없다.
   */
  /*
   * 원본 조건 [시작일]·[종료일]은 <b>한 날짜가 아니라 구간</b>이다(2026-09-01 E040636 실측:
   * [사용]을 켜면 2026/08/01 ~ 2026/08/31 처럼 두 칸이 열린다). 우리는 한 칸씩만 두고
   * '그 날 이후'·'그 날 이전' 으로 걸러, <b>어느 달에 시작한 계획</b>만 보는 것을 못 했다.
   */
  const [startFrom, setStartFrom] = useState('')
  const [startTo, setStartTo] = useState('')
  const [endFrom, setEndFrom] = useState('')
  const [endTo, setEndTo] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  /*
   * 원본 조건 [판매계획]·[구매계획]·[노무비계획]·[경비계획] — 넷 다 <b>금액 구간</b>이다
   * (2026-09-01 E040636 실측). 값이 생기기 전에는 "조건을 만들 축이 없다" 던 자리다.
   */
  const [saleFrom, setSaleFrom] = useState('')
  const [saleTo, setSaleTo] = useState('')
  const [purchaseFrom, setPurchaseFrom] = useState('')
  const [purchaseTo, setPurchaseTo] = useState('')
  const [laborFrom, setLaborFrom] = useState('')
  const [laborTo, setLaborTo] = useState('')
  const [expenseFrom, setExpenseFrom] = useState('')
  const [expenseTo, setExpenseTo] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({ projectId: '', planRevenue: '', planCost: '', planPurchase: '', planLabor: '', planExpense: '', remark: '' })

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
        planPurchase: Number(form.planPurchase || 0),
        planLabor: Number(form.planLabor || 0),
        planExpense: Number(form.planExpense || 0),
        remark: form.remark || undefined,
      })
      setOk('프로젝트계획이 등록되었습니다.')
      setForm({ projectId: '', planRevenue: '', planCost: '', planPurchase: '', planLabor: '', planExpense: '', remark: '' })
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

  const shown = rows
    .filter((r) => !projectCond || r.projectName === projectCond)
    .filter((r) => !startFrom || (r.startDate != null && r.startDate >= startFrom))
    .filter((r) => !startTo || (r.startDate != null && r.startDate <= startTo))
    .filter((r) => !endFrom || (r.endDate != null && r.endDate >= endFrom))
    .filter((r) => !endTo || (r.endDate != null && r.endDate <= endTo))
    .filter((r) => !remarkCond || (r.remark ?? '').includes(remarkCond))
    .filter((r) => inRange(r.planRevenue, saleFrom, saleTo))
    .filter((r) => inRange(r.planPurchase, purchaseFrom, purchaseTo))
    .filter((r) => inRange(r.planLabor, laborFrom, laborTo))
    .filter((r) => inRange(r.planExpense, expenseFrom, expenseTo))

  /* 합계도 걸러진 것으로 낸다 — 한 프로젝트만 보면서 합계가 전체이면 숫자가 거짓말을 한다. */
  const totals = shown.reduce((s, r) => ({
    planRevenue: s.planRevenue + r.planRevenue, planProfit: s.planProfit + r.planProfit,
    planPurchase: s.planPurchase + r.planPurchase, planLabor: s.planLabor + r.planLabor,
    planExpense: s.planExpense + r.planExpense,
    actualRevenue: s.actualRevenue + r.actualRevenue, actualProfit: s.actualProfit + r.actualProfit,
  }), { planRevenue: 0, planProfit: 0, planPurchase: 0, planLabor: 0, planExpense: 0, actualRevenue: 0, actualProfit: 0 })
  const inputCls = 'ec-input'
  const years = [thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2]

  /*
   * 원본 하단 단추줄의 <b>[선택삭제]</b> — 고른 줄을 한 번에 지운다. 줄마다 [삭제]는
   * 진작 있었지만, 잘못 올린 프로젝트계획 열 줄을 지우려면 열 번 묻고 열 번 눌러야 했다.
   *
   * <p>하나가 막혀도 <b>거기서 멈추지 않는다</b> — 나머지는 지우고 몇 건이 남았는지 알려 준다.
   */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) { setError('삭제할 프로젝트계획을(를) 고르세요.'); return }
    if (!window.confirm(`고른 ${ids.length}건을 삭제할까요?`)) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/project-plans/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다(이미 실적이 붙은 계획일 수 있습니다).` : '')
    load()
  }

  return (
    <EcListShell
      /* 원본 화면 제목이 [프로젝트계획 리스트] 다(2026-09-01 원본 E040636 실측) */
      title="프로젝트계획 리스트"
      onNew={() => setShowForm(true)}
      actions={[
        { label: '새로고침', onClick: load },
        /* 원본 차례: 신규(F2) · 선택삭제 · Excel (사본 실측) */
        { label: `선택삭제${picked.size ? ` (${picked.size})` : ''}`, onClick: removeChecked },
        { label: 'Excel' },
        /* 원본 버튼줄은 [신규(F2)]·[선택삭제]·[Excel] 뿐이다 — [인쇄] 는 우리가 없는 것을 만든 것이었다. */
      ]}
    >
      <p className="mb-2 text-xs text-slate-500">프로젝트별 연간 계획 매출·원가 등록 → 전표 집계 실적과 대조(달성률). 실적은 판매·구매·비용 전표에서 계산.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>계획연도</span>
        <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        {/*
          원본 프로젝트계획 조건의 <b>[프로젝트]</b>. 프로젝트는 목록에 찍히는데
          그것으로 거를 수가 없어, 한 프로젝트의 계획·실적만 보려 해도 표 전체를 훑어야 했다.
        */}
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600, marginLeft: 6 }}>프로젝트</span>
        <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                         value={projectCond} onChange={setProjectCond}
                         items={projects.map((p) => ({ value: p.name, code: p.code, name: p.name }))} />
        {/* 원본 [시작일]·[종료일] 은 구간이다 — 한 칸씩만 두어 어느 달에 시작한 계획인지 못 좁혔다. */}
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600, marginLeft: 6 }}>시작일</span>
        <input type="date" className={inputCls} value={startFrom}
               onChange={(e) => setStartFrom(e.target.value)} style={{ width: 140 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input type="date" className={inputCls} value={startTo}
               onChange={(e) => setStartTo(e.target.value)} style={{ width: 140 }} />
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600, marginLeft: 6 }}>종료일</span>
        <input type="date" className={inputCls} value={endFrom}
               onChange={(e) => setEndFrom(e.target.value)} style={{ width: 140 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input type="date" className={inputCls} value={endTo}
               onChange={(e) => setEndTo(e.target.value)} style={{ width: 140 }} />
      </div>

      {/*
        원본 조건 [판매계획]·[구매계획]·[노무비계획]·[경비계획] — 넷 다 금액 구간이다.
        지난 판까지는 그 값 자체가 없어 <b>거를 축이 없었다</b>. V212 로 값을 만들면서 이제 건다.
      */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>판매계획</span>
        <input className={`${inputCls} text-right`} type="number" step="any" placeholder="판매계획"
               value={saleFrom} onChange={(e) => setSaleFrom(e.target.value)} style={{ width: 110 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input className={`${inputCls} text-right`} type="number" step="any"
               value={saleTo} onChange={(e) => setSaleTo(e.target.value)} style={{ width: 110, marginRight: 6 }} />
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>구매계획</span>
        <input className={`${inputCls} text-right`} type="number" step="any" placeholder="구매계획"
               value={purchaseFrom} onChange={(e) => setPurchaseFrom(e.target.value)} style={{ width: 110 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input className={`${inputCls} text-right`} type="number" step="any"
               value={purchaseTo} onChange={(e) => setPurchaseTo(e.target.value)} style={{ width: 110, marginRight: 6 }} />
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>노무비계획</span>
        <input className={`${inputCls} text-right`} type="number" step="any" placeholder="노무비계획"
               value={laborFrom} onChange={(e) => setLaborFrom(e.target.value)} style={{ width: 110 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input className={`${inputCls} text-right`} type="number" step="any"
               value={laborTo} onChange={(e) => setLaborTo(e.target.value)} style={{ width: 110, marginRight: 6 }} />
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>경비계획</span>
        <input className={`${inputCls} text-right`} type="number" step="any" placeholder="경비계획"
               value={expenseFrom} onChange={(e) => setExpenseFrom(e.target.value)} style={{ width: 110 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input className={`${inputCls} text-right`} type="number" step="any"
               value={expenseTo} onChange={(e) => setExpenseTo(e.target.value)} style={{ width: 110, marginRight: 6 }} />
        {/* 원본 조건 차례에서 [적요] 는 네 금액 <b>다음</b>이다(2026-09-01 실측). */}
        <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>적요</span>
        <input className={inputCls} value={remarkCond} placeholder="적요"
               onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 150 }} />
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
            {/*
              원본 격자의 <b>[구매]·[노무비]·[경비]</b>. 계획을 네 갈래로 적는데 우리는
              원가 한 칸뿐이라 <b>갈라 적을 데가 없었다</b>. 계획원가는 합계 그대로 둔다.
            */}
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>구매</div>
              <input className={`${inputCls} text-right`} type="number" step="any" value={form.planPurchase} onChange={(e) => set('planPurchase', e.target.value)} style={{ width: 130 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>노무비</div>
              <input className={`${inputCls} text-right`} type="number" step="any" value={form.planLabor} onChange={(e) => set('planLabor', e.target.value)} style={{ width: 130 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>경비</div>
              <input className={`${inputCls} text-right`} type="number" step="any" value={form.planExpense} onChange={(e) => set('planExpense', e.target.value)} style={{ width: 130 }} /></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>비고</div>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: '100%' }} /></label>
            <button type="submit" className="ec-btn ec-btn-primary">저장</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 28, textAlign: 'center' }}></th>
            <th style={{ width: 34 }}></th>
            {/*
              원본 격자 차례: <b>프로젝트코드 · 프로젝트명 · 시작일 · 종료일</b> · 판매 · 구매 · 노무비 · 경비.
              우리는 코드와 이름을 한 칸에 붙여 놓고 <b>시작일·종료일은 아예 없었다</b> —
              조건으로 시작일·종료일을 거를 수는 있는데 정작 그 값이 목록에 안 보였다.
            */}
            <th style={{ width: 90 }}>프로젝트코드</th>
            <th>프로젝트명</th>
            <th style={{ width: 100 }}>시작일</th>
            <th style={{ width: 100 }}>종료일</th>
            {/* 원본 격자의 마지막 넷: <b>판매 · 구매 · 노무비 · 경비</b>. 판매는 계획매출이 곧 그것이다. */}
            <th style={{ textAlign: 'right' }}>판매</th>
            <th style={{ textAlign: 'right' }}>구매</th>
            <th style={{ textAlign: 'right' }}>노무비</th>
            <th style={{ textAlign: 'right' }}>경비</th>
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
            <tr><td colSpan={16} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={16} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{year}년 프로젝트계획이 없습니다. 우측 상단에서 등록하세요.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => pick(r.id)} />
              </td>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.projectCode}</td>
              <td>{r.projectName}</td>
              <td style={{ color: r.startDate ? '#5a626e' : '#c9ced6' }}>{dateText(r.startDate) || ''}</td>
              <td style={{ color: r.endDate ? '#5a626e' : '#c9ced6' }}>{dateText(r.endDate) || ''}</td>
              <td style={{ textAlign: 'right' }}>{won(r.planRevenue)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.planPurchase)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.planLabor)}</td>
              <td style={{ textAlign: 'right' }}>{won(r.planExpense)}</td>
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
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={6} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(totals.planRevenue)}</td>
              <td style={{ textAlign: 'right' }}>{won(totals.planPurchase)}</td>
              <td style={{ textAlign: 'right' }}>{won(totals.planLabor)}</td>
              <td style={{ textAlign: 'right' }}>{won(totals.planExpense)}</td>
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
