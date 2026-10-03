import { useEffect, useMemo, useState } from 'react'
import { subtotalBy } from '../../utils/subtotalBy'
import { formatDays } from '../../utils/dayCount'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'

/**
 * 관리 > 휴가잔여일수현황 — 사원별 부여·사용 일수 및 잔여 연차 (/api/hr/vacations/summary).
 *
 * <p>원본 열 실측(사본): <b>휴가명</b> · 부서명 · 성명 · 휴가일수 · 휴가사용일수 · 휴가잔여일수.
 * 줄 값이 '연차(2026년)' 이다.
 *
 * <p>이 화면은 원래부터 <b>연도별</b>로 센다 — 서버가 그 해에 시작한 휴가만 사용일수에 넣는다.
 * 그런데 화면이 연도를 보내지도 보여 주지도 않아서, <b>지금 보는 숫자가 몇 년치인지
 * 알 방법이 없었다.</b> 원본의 [휴가명] 열이 바로 그 값이라 함께 붙인다.
 *
 * <p>[휴가코드]에서 <b>휴가항목등록의 코드</b>를 고르면 원본 셈으로 바뀐다(2026-10-03 loginaa 실측: 휴가코드 20192 '2024 연차' —
 * 사원마다 휴가일수 · 휴가사용일수 · 휴가잔여일수, 부여가 없는 사원은 빈칸, 끝에 합계 377.73).
 * 휴가일수 = 사원별휴가일수조회의 휴가일수(이월 + 당해년), 휴가사용일수 = 근태항목이 그 휴가코드를 가리키는 근태 중
 * 사용기간 안에 시작한 것의 일수. 코드를 비우면 예전처럼 연도별 자동 연차로 센다.
 */
interface Row {
  /** 휴가코드 · 사번 — 휴가코드(휴가항목) 셈일 때만 있다(연도별 자동 연차는 계정 단위라 사번이 없다). */
  leaveCode?: string
  empCode?: string
  /** 휴가명 — '연차(2026년)'. 계산에 쓴 연도를 서버가 적어 보낸다. */
  leaveName: string
  empName: string
  department: string | null
  /** 재직 여부. 원본의 [재직구분] 조건이 이 값을 본다. */
  active: boolean
  totalDays: number
  usedDays: number
  remainingDays: number
}

/** 원본 [재직구분]. 값은 서버가 그대로 받는다. */
/** 원본 [재직구분] 라디오 차례: 전체 · 재직자 · 퇴사자 (기본 재직자) */
const EMPLOYMENTS = [['ALL', '전체'], ['ACTIVE', '재직자'], ['RESIGNED', '퇴사자']] as const

export default function VacationRemainPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 사원 · 부서는 여러 개 고르는 코드도움 — 연도별 줄은 계정 단위라 id 가 없어 이름으로 거른다. */
  const [emp, setEmp] = useState<string[]>([])
  const [dept, setDept] = useState<string[]>([])
  const [empList, setEmpList] = useState<{ id: number; code: string; name: string; department: string }[]>([])
  const [deptList, setDeptList] = useState<{ id: number; code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof empList>('/employees/all').then((r) => setEmpList(r.data)).catch(() => setEmpList([]))
    api.get<typeof deptList>('/departments').then((r) => setDeptList(r.data)).catch(() => setDeptList([]))
  }, [])
  /**
   * 표시 자릿수. 원본은 15.000 · 9.375 처럼 <b>소수 3자리</b>로 보여 준다.
   * 시간 단위 휴가가 0.125일(1시간)씩 쌓이므로 1자리로 줄이면 합이 안 맞는다 —
   * 실제로 서버가 1자리로 반올림하던 시절 사용 0.1 · 잔여 14.9 로 나와 더해도 15가 아니었다.
   */
  const [decimals, setDecimals] = useState(3)
  const [employment, setEmployment] = useState<'ACTIVE' | 'RESIGNED' | 'ALL'>('ACTIVE')
  /** 기준연도. 서버는 진작 받고 있었는데 화면이 안 보내서 늘 올해로만 보였다. */
  const [year, setYear] = useState(new Date().getFullYear())
  /** 원본 조건 [휴가코드]. 줄의 '연차(2026년)' 같은 값이다. */
  const [leaveCode, setLeaveCode] = useState('')
  /** 원본 [기타] 사용중단휴가코드포함(2026-10-04 실측 — 처음엔 꺼짐). 끄면 사용중단한 휴가항목은 휴가코드 후보에 없다. */
  const [includeStopped, setIncludeStopped] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/hr/vacations/summary', { params: { employment, year } })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [employment, year])

  // ── 휴가항목(휴가코드) 셈 — 원본 휴가잔여일수현황 ──
  interface VKind { id: number; code: string; name: string; periodFrom: string; periodTo: string; active: boolean }
  interface AKind { name: string; vacationKindId: number | null }
  interface Emp { id: number; code: string; name: string; department: string; active: boolean }
  interface Vac { empCode: string | null; type: string; startDate: string; days: number }
  interface Grant { employeeId: number; totalDays: number }
  const [vkinds, setVkinds] = useState<VKind[]>([])
  const [codeRows, setCodeRows] = useState<Row[] | null>(null)
  useEffect(() => {
    api.get<VKind[]>('/hr/vacation-kinds').then((r) => setVkinds(r.data)).catch(() => setVkinds([]))
  }, [])
  async function loadCode(kindId: number) {
    const vk = vkinds.find((k) => k.id === kindId)
    if (!vk) return
    try {
      const [g, e, a, v] = await Promise.all([
        api.get<Grant[]>(`/hr/vacation-kinds/${kindId}/grants`),
        api.get<Emp[]>('/employees/all'),
        api.get<AKind[]>('/hr/attendance-kinds'),
        api.get<Vac[]>('/hr/vacations', { params: { from: vk.periodFrom, to: vk.periodTo } }),
      ])
      const types = new Set(a.data.filter((k) => k.vacationKindId === kindId).map((k) => k.name))
      setCodeRows(e.data.map((emp) => {
        const total = g.data.find((x) => x.employeeId === emp.id)?.totalDays ?? 0
        const used = v.data.filter((x) => x.empCode === emp.code && types.has(x.type)).reduce((t, x) => t + Number(x.days), 0)
        return { leaveCode: vk.code, empCode: emp.code, leaveName: vk.name, empName: emp.name, department: emp.department, active: emp.active,
          totalDays: Number(total), usedDays: used, remainingDays: Number(total) - used }
      }))
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  useEffect(() => {
    if (leaveCode.startsWith('VK:')) loadCode(Number(leaveCode.slice(3))); else setCodeRows(null)
  }, [leaveCode, vkinds])

  /*
   * 원본 조건 판 실측(사본): 휴가코드 · 사원 · 부서 · 프로젝트 · 적요 · 상태 · 재직구분 ·
   * [기타] 사용중단휴가코드포함 · 정렬/소계기준 · 소수점
   * 잔여일수 응답은 사원·부서·일수만 주므로 거를 수 있는 것이 사원·부서뿐이다.
   * '소수점'은 반차 때문에 .5 가 나오는 자리라 원본에도 따로 있다 — 끄면 반올림해 보여 준다.
   */
  /*
   * 원본 [정렬/소계기준]. 줄은 사원마다 하나라, 사람이 많은 회사에서는
   * <b>부서별로 얼마가 남았는지</b>를 눈으로 더해야 했다. 연차 소진 독려는
   * 대개 부서 단위로 한다.
   */
  const SUBTOTALS = ['부서', '휴가명'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('부서')

  const byCode = codeRows !== null
  const shown = (byCode ? codeRows : rows).filter((r) => {
    if (emp.length && !emp.includes(r.empName)) return false
    if (dept.length && !dept.includes(r.department ?? '')) return false
    if (!byCode && leaveCode && r.leaveName !== leaveCode) return false
    if (byCode && employment !== 'ALL' && (employment === 'ACTIVE') !== r.active) return false
    return true
  })
  const days = (n: number) => formatDays(n, decimals)
  const groups = useMemo(() => subtotalBy(shown,
    (r) => (subtotal === '휴가명' ? r.leaveName : r.department),
    { total: (r) => r.totalDays, used: (r) => r.usedDays, remain: (r) => r.remainingDays }),
  [shown, subtotal])

  const totals = shown.reduce(
    (a, r) => ({ total: a.total + r.totalDays, used: a.used + r.usedDays, remain: a.remain + r.remainingDays }),
    { total: 0, used: 0, remain: 0 },
  )

  return (
    <EcListShell
      title="휴가잔여일수현황"
      searchable={false}
      onNew={undefined}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => {
          setEmp([]); setDept([]); setDecimals(3); setEmployment('ACTIVE'); setIncludeStopped(false)
          setYear(new Date().getFullYear())
        } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준연도">
          <select className="ec-input" style={{ width: 110 }} value={year}
                  onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </EcCond>
        <EcCond label="휴가코드" pick>
          <CodePickerField label="휴가코드" hideLabel width={180} emptyLabel="전체"
                           value={leaveCode} onChange={(v) => setLeaveCode(v)}
                           items={[
                             ...vkinds.filter((k) => k.active || includeStopped).map((k) => ({ value: `VK:${k.id}`, code: k.code, name: k.name })),
                             ...[...new Set(rows.map((r) => r.leaveName).filter(Boolean))].map((n) => ({ value: n, name: n })),
                           ]} />
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={emp} onChangeMulti={(v) => setEmp(v)}
                           items={empList.map((e) => ({ value: e.name, code: e.code, name: e.name, sub: e.department }))} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={dept} onChangeMulti={(v) => setDept(v)}
                           items={deptList.map((d) => ({ value: d.name, code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        {/*
          원본 조건 [휴가코드]. 줄에 '연차(2026년)' 처럼 코드가 찍히는데 그걸로 거를
          자리가 없었다 — 연차 말고 다른 휴가를 따로 볼 수가 없었다.
        */}
        <EcCond label="재직구분">
          {EMPLOYMENTS.map(([v, label]) => (
            <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="radio" name="vr-employment" checked={employment === v} onChange={() => setEmployment(v)} /> {label}
            </label>
          ))}
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[4px]">
            <input type="checkbox" checked={includeStopped} onChange={(e) => setIncludeStopped(e.target.checked)} /> 사용중단휴가코드포함
          </label>
        </EcCond>
        <EcCond label="소수점">
          <select className="ec-input" style={{ width: 90 }} value={decimals}
                  onChange={(e) => setDecimals(Number(e.target.value))}>
            <option value={0}>0자리</option>
            <option value={1}>1자리</option>
            <option value={2}>2자리</option>
            <option value={3}>3자리</option>
          </select>
        </EcCond>
        {/* 원본 [정렬/소계기준]. 조건 판의 아래쪽 줄이다(사본 실측). */}
        <EcCond label="정렬/소계기준">
          <div className="ec-pills">
            {SUBTOTALS.map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                      onClick={() => setSubtotal(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
      </ul>

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        사원 <b className="text-ec-text">{shown.length}</b>명
        <span className="my-0 mx-[6px] text-ec-off">|</span>
        잔여 합계 <b className="text-ec-navy text-[14px]">{days(totals.remain)}</b>일
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[90px]">휴가코드</th>
            <th className="w-[140px]">휴가명</th>
            <th>부서명</th>
            <th className="w-[100px]">사번</th>
            <th>성명</th>
            <th className="text-right">휴가일수</th>
            <th className="text-right">휴가사용일수</th>
            <th className="text-right">휴가잔여일수</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.empName + i}>
              <td>{r.leaveCode ?? ''}</td>
              <td>{r.leaveName}</td>
              <td>{r.department ?? ''}</td>
              <td>{r.empCode ?? ''}</td>
              <td>{r.empName}{r.active ? '' : ' (퇴사)'}</td>
              <td className="text-right">{byCode && !r.totalDays ? '' : days(r.totalDays)}</td>
              <td className="text-right">{byCode && !r.usedDays ? '' : days(r.usedDays)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.remainingDays <= 0 ? 'var(--ec-danger)' : undefined }}>{days(r.remainingDays)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={5} className="text-right">합계 ({shown.length}명)</td>
            <td className="text-right">{days(totals.total)}</td>
            <td className="text-right">{days(totals.used)}</td>
            <td className="text-right text-ec-navy">{days(totals.remain)}</td>
          </tr>
        </tfoot>
      </table>

      {shown.length > 0 && (
        <>
          <h3 className="text-[13px] font-bold mt-[16px] mx-0 mb-[6px]">{subtotal} 소계</h3>
          <table className="w-full text-left">
            <thead><tr>
              <th>{subtotal}</th>
              <th className="w-[90px] text-right">사원수</th>
              <th className="w-[120px] text-right">휴가일수</th>
              <th className="w-[120px] text-right">휴가사용일수</th>
              <th className="w-[120px] text-right">휴가잔여일수</th>
            </tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.label}>
                  <td className="font-semibold">{g.label}</td>
                  <td className="text-right">{g.count}</td>
                  <td className="text-right">{days(g.sums.total)}</td>
                  <td className="text-right">{days(g.sums.used)}</td>
                  <td className="text-right font-bold text-ec-navy">
                    {days(g.sums.remain)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </EcListShell>
  )
}
