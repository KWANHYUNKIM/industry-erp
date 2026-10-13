import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Project } from '../../types/api'
import { dateText } from '../../utils/dateText'
import { ecConfirm } from '../../components/EcDialog'
import { PLAN_ITEMS, PlanHeadWindow, PlanLineListWindow, type PlanHead, type PlanItem } from '../../features/projectplan/components/ProjectPlanWindows'

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
 * 2026-10-14 원본 계획 모델로 바꿨다(plans/재고2/E040636.md): 계획마다 시작일 · 완료일 · 적요, 항목(판매 · 구매 · 노무비 · 경비)마다
 * 계획 줄(금액 + 달별 금액). 목록 금액 열은 줄 [금액] 의 합, 실적현황 예상금액은 달별 금액. 창 셋은
 * features/projectplan/components/ProjectPlanWindows(등록 · 수정 → 계획 리스트 → 계획 입력).
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
  /** [프로젝트 계획항목 등록 · 수정] 창 — undefined 닫힘 · null 신규 · 계획 id 수정. 원본은 코드 · 이름을 누르면 수정 창(2026-10-14 실측). */
  const [headId, setHeadId] = useState<number | null | undefined>(undefined)
  /** 항목 계획 리스트 창 — 목록 금액 링크 · 등록 창 항목 [등록] 이 연다. */
  const [listOf, setListOf] = useState<{ plan: PlanHead; item: PlanItem } | null>(null)

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

  const toHead = (r: ComparisonRow): PlanHead => ({ id: r.id, projectId: r.projectId, projectCode: r.projectCode,
    projectName: r.projectName, startDate: r.startDate ?? '', endDate: r.endDate ?? '', remark: r.remark })

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
      onNew={() => setHeadId(null)}
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

      <PlanHeadWindow open={headId !== undefined} planId={headId ?? null}
                      projects={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))}
                      onClose={() => setHeadId(undefined)} onChanged={() => void load()}
                      onOpenItem={(plan, item) => setListOf({ plan, item })} />
      <PlanLineListWindow plan={listOf?.plan ?? null} item={listOf?.item ?? null}
                          onClose={() => setListOf(null)} onChanged={() => void load()} />

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
              {/* 원본은 코드 · 이름이 수정 창을, 금액이 그 항목의 계획 리스트 창을 연다(2026-10-14 실측). */}
              <td><button type="button" className="ec-link" onClick={() => setHeadId(r.id)}>{r.projectCode}</button></td>
              <td><button type="button" className="ec-link" onClick={() => setHeadId(r.id)}>{r.projectName}</button></td>
              {/* 계획의 시작일 · 완료일(프로젝트 마스터 날짜가 아니다). */}
              <td>{dateText(r.startDate) || ''}</td>
              <td>{dateText(r.endDate) || ''}</td>
              {([r.planRevenue, r.planPurchase, r.planLabor, r.planExpense] as number[]).map((v, k) => (
                <td key={k} className="text-right">
                  <button type="button" className="ec-link" onClick={() => setListOf({ plan: toHead(r), item: PLAN_ITEMS[k] })}>{won(v)}</button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
