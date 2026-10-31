import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import EcPeriodPicks, { HEADCOUNT_PICKS, periodOf, ymd } from '../../../components/EcPeriodPicks'
import { headcountRows } from '../../../utils/headcount'
import { EcReportHead, reportPeriod } from '../../../components/EcReportFrame'
import { CustomAggregateConds, CustomAggregateTable, EMPTY_AGG, type AggDim, type AggRecord, type AggState, type AggTarget } from '../../../features/payroll/components/CustomAggregate'
import { EcDateRange } from '../../../components/ui/EcDateInput'

interface Emp { id: number; name: string; department: string | null; jobTitle: string | null; hireDate: string | null; resignDate: string | null; hireKind?: string | null; duty?: string | null; code?: string; projectId?: number | null }
type Mode = '일별' | '월별' | '사용자지정집계'

const two = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 입사 · 퇴사 인원 — 없으면 빈칸, 있으면 '1.00'(2026-10-14 원본 QA관리-발령 입사일 줄 실측) */
const count = (n: number) => (n === 0 ? '' : two(n))

/**
 * [구분] 사용자지정집계(2026-10-21 원본 E020609 실측) — 기간이 연/월 ~ 연/월 로 바뀌고 집계조건1 · 2(고를 때마다 한 칸 더) ·
 * 집계대상 · 기타 □가로보기 □비율표시 □코드포함 이 붙는다. 집계조건검색 창: 사원정보(부서 · 프로젝트 · 직위/직급 · 직책 · 입사구분 ·
 * 지급구분) · 기타설정(사원구분 · 거주구분 · 외국인여부) — 우리 사원에 있는 넷만 둔다. 집계대상검색 창: 입사자 · 퇴직자 · 계 · 근무인원.
 * 원본 부서 / 넷 다: '개발팀 · 퇴직자 1.00 · 계 1.00 · 근무인원 2.00', 다른 부서는 계 = 근무인원, 끝 [합계] — 근무인원은 기간 안에
 * 한 번이라도 재직한 사람, 계는 그중 기간 끝에 남은 사람(근무인원 − 퇴직자)으로 읽었다. 숫자는 소수 두 자리, 0 은 빈칸.
 */
const AGG_DIMS: AggDim[] = [
  { key: 'dept', label: '부서', group: '사원정보' }, { key: 'project', label: '프로젝트', group: '사원정보' }, { key: 'jobTitle', label: '직위/직급', group: '사원정보' },
  { key: 'duty', label: '직책', group: '사원정보' }, { key: 'hireKind', label: '입사구분', group: '사원정보' },
]
const AGG_TARGETS: AggTarget[] = [
  { key: 'hired', label: '입사자', format: count }, { key: 'resigned', label: '퇴직자', format: count },
  { key: 'remain', label: '계', format: count }, { key: 'worked', label: '근무인원', format: count },
]
const DUTY: Record<string, string> = { '100': '팀원', '200': '팀장' }
const HIRE_KIND: Record<string, string> = { '100': '신입', '200': '경력' }

/**
 * 관리 &gt; 인사관리 &gt; 인사관리현황 &gt; <b>인원현황</b>(E020609) — 2026-10-03 loginaa 실측.
 *
 * <p>조건: 구분(<b>일별</b> | 월별 | 사용자지정집계, 같은 칸 아래 줄에 기간 — 기본 <b>금월(~오늘)</b>, 빠른선택 금월 · 전월 · 금월(~오늘) · 금년(~오늘) ·
 * 전년 · 종료월, 월별이면 YYYY/MM 로 고른다) · 부서 · 프로젝트 · 직위/직급 · 입사구분 · 양식.
 *
 * <p>표: 일자 · 입사자 · 입사인원 · 퇴사자 · 퇴사인원 · 총인원, 끝 [합계](두 칸 묶음). 일별은 하루 한 줄(2026/10/01),
 * 월별은 한 달 한 줄(2025/01). 입사자 · 퇴사자 칸은 그날(그달) 들어오고 나간 사람 이름, 총인원은 그날(달 끝) 재직 인원(소수 두 자리).
 * [합계] 줄은 칸이 모두 빈다 — 2026-10-14 원본에서 QA관리-발령 1명을 넣은 달도 입사인원 합계가 비었다. 사원은 퇴사자까지(/employees/all) 받아 입사일자 · 퇴사일자로 센다.
 * 사용자지정집계는 아래 AGG_DIMS. 입사구분은 사원등록 [입사구분](100 신입 · 200 경력)을 본다.
 */
export default function HeadcountPage() {
  const init = periodOf('금월(~오늘)')!
  const [mode, setMode] = useState<Mode>('일별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  /** [부서] · [직위/직급] — 원본처럼 여러 개 고르는 코드도움. */
  const [dept, setDept] = useState<string[]>([])
  const [title, setTitle] = useState<string[]>([])
  const [project, setProject] = useState<string[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [hireKind, setHireKind] = useState<string[]>([])
  const [agg, setAgg] = useState<AggState>(EMPTY_AGG)
  const [emps, setEmps] = useState<Emp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<Emp[]>('/employees/all')
      setEmps(r.data)
      api.get<{ id: number; code: string; name: string }[]>('/projects').then((p) => setProjects(p.data)).catch(() => setProjects([]))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const picked = useMemo(() => emps
    .filter((e) => dept.length === 0 || dept.includes(e.department ?? ''))
    .filter((e) => project.length === 0 || project.includes(String(e.projectId ?? '')))
    .filter((e) => title.length === 0 || title.includes(e.jobTitle ?? ''))
    .filter((e) => hireKind.length === 0 || hireKind.includes(e.hireKind ?? '')), [emps, dept, project, title, hireKind])

  const rows = useMemo(() => (mode === '사용자지정집계' ? [] : headcountRows(picked, mode, from, to)), [picked, mode, from, to])
  const aggRecords: AggRecord[] = useMemo(() => picked
    .filter((e) => !!e.hireDate && e.hireDate <= to && (!e.resignDate || e.resignDate >= from))
    .map((e) => {
      const resigned = !!e.resignDate && e.resignDate <= to ? 1 : 0
      const kind = e.hireKind ?? ''
      return {
        dims: {
          dept: { code: e.department ?? '', name: e.department ?? '' },
          project: { code: projects.find((p) => p.id === e.projectId)?.code ?? '', name: projects.find((p) => p.id === e.projectId)?.name ?? '' },
          jobTitle: { code: e.jobTitle ?? '', name: e.jobTitle ?? '' },
          duty: { code: e.duty ?? '', name: DUTY[e.duty ?? ''] ?? e.duty ?? '' },
          hireKind: { code: kind, name: HIRE_KIND[kind] ?? kind },
        },
        values: { 입사자: e.hireDate! >= from ? 1 : 0, 퇴직자: resigned, 계: 1 - resigned, 근무인원: 1 },
      }
    }), [picked, from, to, projects])
  const depts = [...new Set(emps.map((e) => e.department).filter((v): v is string => !!v))].sort()
  const titles = [...new Set(emps.map((e) => e.jobTitle).filter((v): v is string => !!v))].sort()

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '인원현황', [rows.length])

  return (
    <EcListShell
      title="인원현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setMode('일별'); setFrom(init.from); setTo(init.to); setDept([]); setProject([]); setTitle([]); setHireKind([]); setAgg(EMPTY_AGG) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="구분">
          {(['일별', '월별'] as Mode[]).map((v) => (
            <label key={v} className="mr-2.5 inline-flex items-center gap-[3px]">
              <input type="radio" name="hc-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
          <label className="mr-2.5 inline-flex items-center gap-[3px]">
            <input type="radio" name="hc-mode" checked={mode === '사용자지정집계'}
                   onChange={() => { setMode('사용자지정집계'); setFrom(`${from.slice(0, 7)}-01`); const [y, m] = to.slice(0, 7).split('-').map(Number); setTo(ymd(new Date(y, m, 0))) }} /> 사용자지정집계
          </label>
          <br />
          {mode === '일별' ? (
            <>
              <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
            </>
          ) : (
            <>
              <input type="month" className="ec-input w-[145px]" value={from.slice(0, 7)} onChange={(e) => setFrom(`${e.target.value}-01`)} />
              <span className="mx-1">~</span>
              <input type="month" className="ec-input w-[145px]" value={to.slice(0, 7)}
                     onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); setTo(ymd(new Date(y, m, 0))) }} />
            </>
          )}
          <span className="ml-1.5">
            <EcPeriodPicks labels={HEADCOUNT_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
          {mode === '사용자지정집계' && <CustomAggregateConds dims={AGG_DIMS} targets={AGG_TARGETS} value={agg} onChange={setAgg} />}
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={dept} onChangeMulti={(v) => setDept(v)}
                           items={depts.map((d) => ({ value: d, name: d }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel fill multiple placeholder="프로젝트" values={project} onChangeMulti={(v) => setProject(v)}
                           items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="직위/직급" pick>
          <CodePickerField label="직위/직급" hideLabel fill multiple placeholder="직위/직급" values={title} onChangeMulti={(v) => setTitle(v)}
                           items={titles.map((t) => ({ value: t, name: t }))} />
        </EcCond>
        <EcCond label="입사구분">
          <CodePickerField label="입사구분" hideLabel fill multiple placeholder="입사구분" values={hireKind} onChangeMulti={(v) => setHireKind(v)}
                           items={[{ value: '신입', code: '100', name: '신입' }, { value: '경력', code: '200', name: '경력' }]} />
        </EcCond>
      </ul>

      <EcReportHead title="인원현황" period={reportPeriod(from, to)} />
      {mode === '사용자지정집계' ? (
        <CustomAggregateTable name="인원현황" dims={AGG_DIMS} targets={AGG_TARGETS} records={aggRecords} agg={agg} />
      ) : (
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자</th>
            <th>입사자</th>
            <th className="text-right">입사인원</th>
            <th>퇴사자</th>
            <th className="text-right">퇴사인원</th>
            <th className="text-right">총인원</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="p-5 text-center text-[var(--ec-text-hint)]">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="text-center">{r.label}</td>
                  <td>{r.hired.join(', ')}</td>
                  <td className="text-right">{count(r.hired.length)}</td>
                  <td>{r.resigned.join(', ')}</td>
                  <td className="text-right">{count(r.resigned.length)}</td>
                  <td className="text-right">{two(r.total)}</td>
                </tr>
              ))}
              <tr className="ec-total">
                <td colSpan={2} className="text-center">합계</td>
                <td className="text-right"></td>
                <td></td>
                <td className="text-right"></td>
                <td className="text-right"></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      )}
    </EcListShell>
  )
}
