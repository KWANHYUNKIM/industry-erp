import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Project } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { ecConfirm } from '../../components/EcDialog'
import { EcCond } from '../../components/EcStatusPanel'

/**
 * 재고 II &gt; 계획관리 &gt; 프로젝트계획조회 / 프로젝트계획·실적현황
 * (이카운트 <b>E040636·E040637</b>)
 *
 * <p>여기 <code>C000653</code> 이라 적혀 있었는데 그런 코드는 메뉴에 없다.
 * 2026-09-09 에 메뉴 트리를 통째로 긁어 보니 이 화면이 매달린 곳은
 * <b>재고 II &gt; 계획관리(C000094)</b> 이고, C 코드는 화면이 아니라 <b>그룹</b>이다.
 * 회계 쪽이 아니라 재고 II 쪽이었다.
 *
 * <p>그날 조건도 다시 재어 대조했다 — 열하나로 대조표와 <b>글자 하나까지 같다</b>
 * (접힌 줄은 없다). 다만 <b>메뉴 이름과 화면 제목이 다르다</b> —
 * 메뉴는 [프로젝트계획조회] 인데 열리는 화면의 제목은 <b>[프로젝트계획 리스트]</b> 다.
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
  /** 원본 [기타]의 [수정일자순(정렬)] 이 쓰는 축. */
  updatedAt: string | null
  remark: string | null
}

const won = (n: number) => n.toLocaleString('ko-KR')
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
  /*
   * 원본 조건 [기타]의 <b>[수정일자순(정렬)]</b> 체크박스(2026-09-01 E040636 실측).
   * 꺼져 있는 것이 기본이다. 켜면 <b>나중에 고친 계획이 위</b>로 온다 —
   * 오늘 손댄 계획을 찾을 길이 없었다.
   */
  const [byUpdated, setByUpdated] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  /** 고치는 계획 id — 원본은 프로젝트코드 · 이름을 누르면 [프로젝트 계획항목 수정] 창이 열린다(2026-10-14 실측). */
  const [editId, setEditId] = useState<number | null>(null)
  const [formError, setFormError] = useState('')

  const EMPTY = { projectId: '', planYear: String(thisYear()), planRevenue: '', planPurchase: '', planLabor: '', planExpense: '', remark: '' }
  const [form, setForm] = useState(EMPTY)

  async function load() {
    setLoading(true); setError('')
    try {
      /* 원본 목록에는 연도 조건이 없다 — 계획을 다 보여 주고 프로젝트코드 차례로 놓는다(2026-10-14 실측). */
      const [c, p] = await Promise.all([
        api.get<ComparisonRow[]>('/project-plans/comparison'),
        api.get<Project[]>('/projects'),
      ])
      setRows([...c.data].sort((a, b) => a.projectCode.localeCompare(b.projectCode) || b.planYear - a.planYear))
      setProjects(p.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  function openNew() { setEditId(null); setForm(EMPTY); setFormError(''); setShowForm(true) }
  function openEdit(r: ComparisonRow) {
    setEditId(r.id); setFormError('')
    setForm({ projectId: String(r.projectId), planYear: String(r.planYear), planRevenue: String(r.planRevenue),
      planPurchase: String(r.planPurchase), planLabor: String(r.planLabor), planExpense: String(r.planExpense), remark: r.remark ?? '' })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setFormError('')
    if (!form.projectId) return setFormError('프로젝트를 선택하세요.')
    /* 계획원가는 따로 적는 칸이 없다(원본 항목은 판매 · 구매 · 노무비 · 경비 넷) — 0 을 보내면 서버가 셋의 합으로 채운다. */
    const body = {
      projectId: Number(form.projectId),
      planYear: Number(form.planYear),
      planRevenue: Number(form.planRevenue || 0),
      planCost: 0,
      planPurchase: Number(form.planPurchase || 0),
      planLabor: Number(form.planLabor || 0),
      planExpense: Number(form.planExpense || 0),
      remark: form.remark || undefined,
    }
    try {
      if (editId) await api.put(`/project-plans/${editId}`, body)
      else await api.post('/project-plans', body)
      /* 원본은 저장해도 안내 글 없이 창이 [수정] 으로 남는다 — 우리는 창을 닫고 목록을 다시 읽는다. */
      setShowForm(false)
      load()
    } catch (err) { setFormError(extractErrorMessage(err)) }
  }

  /* 원본 수정 창 [삭제] — '삭제하겠습니까?'(2026-10-14 실측), 지우면 목록에서 빠지고 실적현황도 '등록된 데이터가 없습니다.' */
  async function removeEditing() {
    if (!editId || !(await ecConfirm('삭제하겠습니까?'))) return
    try { await api.delete(`/project-plans/${editId}`); setShowForm(false); load() }
    catch (err) { setFormError(extractErrorMessage(err)) }
  }

  const shown = rows
    .filter((r) => !projectCond || String(r.projectId) === projectCond)
    .filter((r) => !startFrom || (r.startDate != null && r.startDate >= startFrom))
    .filter((r) => !startTo || (r.startDate != null && r.startDate <= startTo))
    .filter((r) => !endFrom || (r.endDate != null && r.endDate >= endFrom))
    .filter((r) => !endTo || (r.endDate != null && r.endDate <= endTo))
    .filter((r) => !remarkCond || (r.remark ?? '').includes(remarkCond))
    .filter((r) => inRange(r.planRevenue, saleFrom, saleTo))
    .filter((r) => inRange(r.planPurchase, purchaseFrom, purchaseTo))
    .filter((r) => inRange(r.planLabor, laborFrom, laborTo))
    .filter((r) => inRange(r.planExpense, expenseFrom, expenseTo))
    /*
     * 원본 [수정일자순(정렬)] — 켜면 나중에 고친 것이 위다. 안 켜면 서버가 준 차례
     * 그대로 둔다. sort 는 제자리를 바꾸므로 베껴서 한다.
     */
    .slice()
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : 0))

  /* 합계도 걸러진 것으로 낸다 — 한 프로젝트만 보면서 합계가 전체이면 숫자가 거짓말을 한다. */
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
    /* 고른 줄이 없을 때는 셸이 원본 알림을 띄운다(actions selected). 확인 문구는 수정 창 [삭제] 와 같게 둔다(선택삭제 문구는 못 잼). */
    if (!(await ecConfirm('삭제하겠습니까?'))) return
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
      onNew={openNew}
      actions={[
        /* 원본 차례: 신규(F2) · 선택삭제 · Excel (2026-10-14 실측). 고른 줄이 없으면 셸이 원본 알림을 띄운다. */
        { label: '선택삭제', onClick: removeChecked, selected: picked.size },
        { label: 'Excel' },
      ]}
    >
      {/* 원본 조건은 머리 [Search(F3)] 를 눌러야 내려온다 — 조건 줄 둘을 판 하나로 묶는다(plans/공용.md 규칙 3). */}
      <div className="ec-search-conds">
      <div className="flex items-center gap-[8px] mb-[10px]">
        {/*
          원본 프로젝트계획 조건의 <b>[프로젝트]</b>. 프로젝트는 목록에 찍히는데
          그것으로 거를 수가 없어, 한 프로젝트의 계획·실적만 보려 해도 표 전체를 훑어야 했다.
        */}
        <span className="text-[12.5px] text-ec-text font-semibold">프로젝트</span>
        <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                         value={projectCond} onChange={setProjectCond}
                         items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        {/* 원본 [시작일]·[종료일] 은 구간이다 — 한 칸씩만 두어 어느 달에 시작한 계획인지 못 좁혔다. */}
        <span className="text-[12.5px] text-ec-text font-semibold ml-[6px]">시작일</span>
        <input type="date" className={inputCls} value={startFrom}
               onChange={(e) => setStartFrom(e.target.value)} style={{ width: 140 }} />
        <span className="text-ec-label">~</span>
        <input type="date" className={inputCls} value={startTo}
               onChange={(e) => setStartTo(e.target.value)} style={{ width: 140 }} />
        <span className="text-[12.5px] text-ec-text font-semibold ml-[6px]">종료일</span>
        <input type="date" className={inputCls} value={endFrom}
               onChange={(e) => setEndFrom(e.target.value)} style={{ width: 140 }} />
        <span className="text-ec-label">~</span>
        <input type="date" className={inputCls} value={endTo}
               onChange={(e) => setEndTo(e.target.value)} style={{ width: 140 }} />
      </div>

      {/*
        원본 조건 [판매계획]·[구매계획]·[노무비계획]·[경비계획] — 넷 다 금액 구간이다.
        지난 판까지는 그 값 자체가 없어 <b>거를 축이 없었다</b>. V212 로 값을 만들면서 이제 건다.
      */}
      <div className="flex items-center gap-[8px] mb-[10px] flex-wrap">
        <span className="text-[12.5px] text-ec-text font-semibold">판매계획</span>
        <input className={`${inputCls} text-right`} type="number" step="any" placeholder="판매계획"
               value={saleFrom} onChange={(e) => setSaleFrom(e.target.value)} style={{ width: 110 }} />
        <span className="text-ec-label">~</span>
        <input className={`${inputCls} text-right`} type="number" step="any"
               value={saleTo} onChange={(e) => setSaleTo(e.target.value)} style={{ width: 110, marginRight: 6 }} />
        <span className="text-[12.5px] text-ec-text font-semibold">구매계획</span>
        <input className={`${inputCls} text-right`} type="number" step="any" placeholder="구매계획"
               value={purchaseFrom} onChange={(e) => setPurchaseFrom(e.target.value)} style={{ width: 110 }} />
        <span className="text-ec-label">~</span>
        <input className={`${inputCls} text-right`} type="number" step="any"
               value={purchaseTo} onChange={(e) => setPurchaseTo(e.target.value)} style={{ width: 110, marginRight: 6 }} />
        <span className="text-[12.5px] text-ec-text font-semibold">노무비계획</span>
        <input className={`${inputCls} text-right`} type="number" step="any" placeholder="노무비계획"
               value={laborFrom} onChange={(e) => setLaborFrom(e.target.value)} style={{ width: 110 }} />
        <span className="text-ec-label">~</span>
        <input className={`${inputCls} text-right`} type="number" step="any"
               value={laborTo} onChange={(e) => setLaborTo(e.target.value)} style={{ width: 110, marginRight: 6 }} />
        <span className="text-[12.5px] text-ec-text font-semibold">경비계획</span>
        <input className={`${inputCls} text-right`} type="number" step="any" placeholder="경비계획"
               value={expenseFrom} onChange={(e) => setExpenseFrom(e.target.value)} style={{ width: 110 }} />
        <span className="text-ec-label">~</span>
        <input className={`${inputCls} text-right`} type="number" step="any"
               value={expenseTo} onChange={(e) => setExpenseTo(e.target.value)} style={{ width: 110, marginRight: 6 }} />
        {/* 원본 조건 차례에서 [적요] 는 네 금액 <b>다음</b>이다(2026-09-01 실측). */}
        <span className="text-[12.5px] text-ec-text font-semibold">적요</span>
        <input className={inputCls} value={remarkCond} placeholder="적요"
               onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 150 }} />
        {/* 원본 조건 차례의 마지막 [기타] — [수정일자순(정렬)] 하나다(실측). */}
        <span className="text-[12.5px] text-ec-text font-semibold ml-[6px]">기타</span>
        <label className="flex items-center gap-[3px] text-[12.5px] text-ec-text">
          <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
          수정일자순(정렬)
        </label>
      </div>

      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/*
        원본 [프로젝트 계획항목 등록] · [프로젝트 계획항목 수정] 창(2026-10-14 실측): 프로젝트 · 시작일 · 완료일 · 적요 판 아래
        항목 격자 01 판매(판매) · 02 구매(구매) · 03 노무비(계정) · 04 경비(계정) | 집계기준1~4 해당없음 | 계획등록 [등록],
        단추 저장(F8) · (수정 때) 삭제 · 닫기 · H. 원본은 항목마다 [등록] 으로 달별 금액을 따로 적는다 —
        우리 계획은 한 해 금액이라 항목 줄에 금액 칸을 둔다(남은 것: plans/재고2/E040636.md).
      */}
      <Modal error={formError} open={showForm} width={720}
             title={editId ? '프로젝트 계획항목 수정' : '프로젝트 계획항목 등록'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit}>
          <ul className="ec-form mb-[8px]">
            <EcCond label="프로젝트" span={2}>
              {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
              <CodePickerField label="프로젝트" hideLabel width={320} placeholder="프로젝트" emptyLabel="선택 해제"
                               value={form.projectId} onChange={(v) => set('projectId', v)}
                               items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
            </EcCond>
            {/* 원본은 [시작일] · [완료일](기본 오늘 ~ 그해 12/31) — 우리 계획은 한 해 단위라 계획연도. */}
            <EcCond label="계획연도" span={2}>
              <select className={inputCls} value={form.planYear} onChange={(e) => set('planYear', e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </EcCond>
            <EcCond label="적요" span={2}>
              <input className={`${inputCls} w-full`} placeholder="적요" value={form.remark} onChange={(e) => set('remark', e.target.value)} />
            </EcCond>
          </ul>
          <table className="w-full">
            <thead>
              <tr><th className="w-[70px]">항목코드</th><th>항목명</th><th>집계구분</th><th className="w-[180px] text-right">계획</th></tr>
            </thead>
            <tbody>
              {PLAN_ITEMS.map((it) => (
                <tr key={it.code}>
                  <td>{it.code}</td>
                  <td>{it.name}</td>
                  <td>{it.kind}</td>
                  <td>
                    <input className={`${inputCls} text-right w-full`} type="number" step="any" aria-label={it.name}
                           value={form[it.field]} onChange={(e) => set(it.field, e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[8px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            {editId && <button type="button" className="ec-btn" onClick={() => void removeEditing()}>삭제</button>}
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[28px] text-center"></th>
            <th className="w-[34px]"></th>
            {/* 원본 격자 9열(2026-10-14 실측): 체크 · 프로젝트코드 · 프로젝트명 · 시작일 · 종료일 · 판매 · 구매 · 노무비 · 경비. 합계줄 없음. */}
            <th className="w-[90px]">프로젝트코드</th>
            <th>프로젝트명</th>
            <th className="w-[100px]">시작일</th>
            <th className="w-[100px]">종료일</th>
            <th className="text-right">판매</th>
            <th className="text-right">구매</th>
            <th className="text-right">노무비</th>
            <th className="text-right">경비</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => pick(r.id)} />
              </td>
              <td className="text-center text-ec-hint">{i + 1}</td>
              {/* 원본은 코드 · 이름이 수정 창을, 금액이 그 항목의 계획 리스트를 연다 — 우리는 모두 수정 창. */}
              <td><button type="button" className="ec-link" onClick={() => openEdit(r)}>{r.projectCode}</button></td>
              <td><button type="button" className="ec-link" onClick={() => openEdit(r)}>{r.projectName}</button></td>
              <td>{dateText(r.startDate) || ''}</td>
              <td>{dateText(r.endDate) || ''}</td>
              <td className="text-right">{won(r.planRevenue)}</td>
              <td className="text-right">{won(r.planPurchase)}</td>
              <td className="text-right">{won(r.planLabor)}</td>
              <td className="text-right">{won(r.planExpense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

/* 원본 항목 격자(2026-10-14 실측) — 항목코드 · 항목명 · 집계구분. */
const PLAN_ITEMS = [
  { code: '01', name: '판매', kind: '판매', field: 'planRevenue' },
  { code: '02', name: '구매', kind: '구매', field: 'planPurchase' },
  { code: '03', name: '노무비', kind: '계정', field: 'planLabor' },
  { code: '04', name: '경비', kind: '계정', field: 'planExpense' },
] as const
