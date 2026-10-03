import { useEffect, useState } from 'react'
import CodePickerField from '../../components/CodePickerField'
import VacationCodeUseReport from '../../features/vacation/components/VacationCodeUseReport'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { formatDays } from '../../utils/dayCount'
import { dateText } from '../../utils/dateText'
import { withRemain } from '../../utils/vacationRemain'

/**
 * 관리 > 휴가사용실적현황 — 사원별 휴가 종류·기간·사용일수 실적 조회 (백엔드 /api/hr/vacations 연동)
 *
 * <p>[휴가코드]에서 <b>휴가항목등록의 코드</b>를 고르면 원본 꼴로 바뀐다(2026-10-03 loginaa 실측: 사원마다 한 장 —
 * 머리 '회사명 : … / 2024 연차 / 천우석', 격자 전표번호 · 적요 · 휴가일수 · 휴가사용일수 · 휴가잔여일수, 첫 줄 '[휴가]'(부여),
 * 근태마다 한 줄씩 잔여가 줄고 끝에 합계). 부여는 사원별휴가일수조회, 사용은 근태항목이 그 휴가코드를 가리키는 근태.
 */
interface Row {
  id: number
  /** 원본 휴가사용실적현황의 [전표번호]. 근태 전표 번호다. */
  docNo: string
  empName: string
  department: string | null
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string | null
  /** 재직 여부. 원본 [재직구분] 조건이 이 값을 본다 — 퇴사자 사용실적은 정산 대상이다. */
  active: boolean
  /** PENDING / APPROVED / REJECTED */
  status: VacationStatus
  /** 대기 / 승인 / 반려 (표시용) */
  statusName: string
}

type VacationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/** 원본 [재직구분]. 휴가잔여일수현황과 같은 값이라 이름도 같게 둔다. */
/** 원본 [재직구분] 라디오 차례: 전체 · 재직자 · 퇴사자 (기본 재직자) */
const EMPLOYMENTS = [['ALL', '전체'], ['ACTIVE', '재직자'], ['RESIGNED', '퇴사자']] as const

/** 휴가잔여일수현황과 같은 요약. 여기서는 사원별 <b>휴가일수(부여)</b>를 가져오는 데 쓴다. */
interface SummaryRow {
  empName: string
  totalDays: number
}

const mono = { fontFamily: 'monospace' as const }
/** 원본은 0.50 · 0.13 처럼 소수 두 자리로 적는다(시간 단위 휴가가 0.125일씩 쌓인다). */
/** 원본은 소수 셋째 자리까지 채워 찍는다. */
const days = formatDays
function statusColor(s: VacationStatus) {
  if (s === 'APPROVED') return 'var(--ec-success)'
  if (s === 'REJECTED') return 'var(--ec-danger)'
  return 'var(--ec-warn)'
}

export default function VacationUsePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 사원 · 부서는 여러 개 고르는 코드도움 — 휴가 줄은 계정 단위라 이름으로 거른다. */
  const [emp, setEmp] = useState<string[]>([])
  const [dept, setDept] = useState<string[]>([])
  const [empList, setEmpList] = useState<{ id: number; code: string; name: string; department: string }[]>([])
  const [deptList, setDeptList] = useState<{ id: number; code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof empList>('/employees/all').then((r) => setEmpList(r.data)).catch(() => setEmpList([]))
    api.get<typeof deptList>('/departments').then((r) => setDeptList(r.data)).catch(() => setDeptList([]))
  }, [])
  const [vtype, setVtype] = useState('')
  const [reason, setReason] = useState('')
  /** 원본 [상태] 체크박스 — 전체 · 결재중 · UserPay · 확인, 처음엔 확인만. UserPay(사원 신청)는 우리에게 없어 칸을 두지 않는다. */
  const [statuses, setStatuses] = useState<Set<'PENDING' | 'APPROVED'>>(new Set(['APPROVED']))
  const [employment, setEmployment] = useState<'ACTIVE' | 'RESIGNED' | 'ALL'>('ACTIVE')
  const [grants, setGrants] = useState<Map<string, number>>(new Map())
  // ── 휴가항목(휴가코드) 꼴 — 원본 휴가사용실적현황 ──
  interface VKind { id: number; code: string; name: string; periodFrom: string; periodTo: string }
  interface Emp { id: number; code: string; name: string; active: boolean }
  interface CodeVac { id: number; docNo: string; empCode: string | null; type: string; startDate: string; days: number; reason: string | null }
  const [vkinds, setVkinds] = useState<VKind[]>([])
  const [codePick, setCodePick] = useState('')
  const [codeBlocks, setCodeBlocks] = useState<{ emp: Emp; grant: number | null; lines: CodeVac[] }[] | null>(null)
  const [companyName, setCompanyName] = useState('')
  useEffect(() => {
    api.get<VKind[]>('/hr/vacation-kinds').then((r) => setVkinds(r.data)).catch(() => setVkinds([]))
    api.get<{ name?: string } | null>('/company').then((r) => setCompanyName(r.data?.name ?? '')).catch(() => {})
  }, [])
  useEffect(() => {
    if (!codePick.startsWith('VK:')) { setCodeBlocks(null); setVtype(codePick); return }
    setVtype('')
    const id = Number(codePick.slice(3))
    const vk = vkinds.find((k) => k.id === id)
    if (!vk) return
    Promise.all([
      api.get<{ employeeId: number; totalDays: number }[]>(`/hr/vacation-kinds/${id}/grants`),
      api.get<Emp[]>('/employees/all'),
      api.get<{ name: string; vacationKindId: number | null }[]>('/hr/attendance-kinds'),
      api.get<CodeVac[]>('/hr/vacations', { params: { from: vk.periodFrom, to: vk.periodTo } }),
    ]).then(([g, e, a, v]) => {
      const types = new Set(a.data.filter((k) => k.vacationKindId === id).map((k) => k.name))
      setCodeBlocks(e.data.map((emp) => ({
        emp,
        grant: g.data.find((x) => x.employeeId === emp.id)?.totalDays ?? null,
        lines: v.data.filter((x) => x.empCode === emp.code && types.has(x.type)).sort((x, y) => x.startDate.localeCompare(y.startDate)),
      })))
    }).catch((err) => setError(extractErrorMessage(err)))
  }, [codePick, vkinds])

  async function load() {
    setLoading(true)
    try {
      const [res, sum] = await Promise.all([
        api.get<Row[]>('/hr/vacations'),
        api.get<SummaryRow[]>('/hr/vacations/summary', { params: { employment: 'ALL' } }),
      ])
      setRows(res.data)
      setGrants(new Map(sum.data.map((x) => [x.empName, x.totalDays])))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function changeStatus(r: Row, status: VacationStatus) {
    try {
      await api.put(`/hr/vacations/${r.id}/status`, { status })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /*
   * 원본 조건 판 실측(사본):
   *   휴가코드 · 사원 · 부서 · 프로젝트 · 적요 · [상태] 전체|결재중|확인 ·
   *   [재직구분] 전체|재직자|퇴사자 · [기타] 사용중단휴가코드포함
   * 우리는 사원명 검색어 하나가 전부였다.
   *
   * [재직구분]은 예전에 "휴가 응답에 그 값이 없어" 만들지 않았는데, 이제 응답이 재직 여부를
   * 싣는다. <b>퇴사자의 사용실적은 정산 대상</b>이라 봐야 하는데 걸러 볼 수가 없었다.
   * 프로젝트·사용중단휴가코드는 여전히 없어 칸을 만들지 않는다.
   * 원본의 '확인'은 결재가 끝난 것이라 우리 APPROVED, '결재중'은 PENDING 이다.
   */
  const shown = rows.filter((r) => {
    if (employment === 'ACTIVE' && !r.active) return false
    if (employment === 'RESIGNED' && r.active) return false
    if (emp.length && !emp.includes(r.empName)) return false
    if (dept.length && !dept.includes(r.department ?? '')) return false
    if (vtype && !r.type.includes(vtype)) return false
    if (reason && !(r.reason ?? '').includes(reason)) return false
    if (!statuses.has(r.status as 'PENDING' | 'APPROVED')) return false
    return true
  })
  const totalDays = shown.reduce((n, r) => n + r.days, 0)

  /**
   * 원본은 사원별로 묶어 <b>쓸 때마다 줄어드는 잔여</b>를 한 줄씩 보여 준다
   * (휴가일수 16.00 → 0.50 쓰면 15.50 → 1.00 쓰면 14.00 …).
   * 우리 화면은 그냥 목록이라 "지금 몇 일 남았나"를 이 화면에서 알 수 없었다.
   *
   * <p>차감은 <b>확인(승인)된 것만</b> 한다. 결재중·반려까지 빼면 마지막 줄의 잔여가
   * 휴가잔여일수현황과 어긋난다 — 두 화면이 다른 숫자를 말하면 둘 다 못 믿게 된다.
   * 같은 까닭으로 <b>연차·반차</b>만 뺀다(utils/vacationRemain).
   */
  const remainLines = withRemain(shown, grants)

  return (
    <EcListShell
      title="휴가사용실적현황"
      searchable={false}
      onNew={undefined}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setEmp([]); setDept([]); setVtype(''); setCodePick(''); setReason(''); setStatuses(new Set(['APPROVED'])); setEmployment('ACTIVE') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="휴가코드" pick>
          <CodePickerField label="휴가코드" hideLabel width={180} emptyLabel="전체"
                           value={codePick} onChange={(v) => setCodePick(v)}
                           items={[
                             ...vkinds.map((k) => ({ value: `VK:${k.id}`, code: k.code, name: k.name })),
                             ...[...new Set(rows.map((r) => r.type))].map((t) => ({ value: t, name: t })),
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
        <EcCond label="적요">
          <input className="ec-input" placeholder="사유 일부" value={reason}
                 onChange={(e) => setReason(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="상태">
          <label className="inline-flex items-center gap-[4px] mr-[10px]">
            <input type="checkbox" checked={statuses.size === 2} onChange={(e) => setStatuses(new Set(e.target.checked ? ['PENDING', 'APPROVED'] : []))} /> 전체
          </label>
          {([['PENDING', '결재중'], ['APPROVED', '확인']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="checkbox" checked={statuses.has(v)} onChange={(e) => {
                const next = new Set(statuses); if (e.target.checked) next.add(v); else next.delete(v); setStatuses(next)
              }} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="재직구분">
          {EMPLOYMENTS.map(([v, label]) => (
            <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="radio" name="vu-employment" checked={employment === v} onChange={() => setEmployment(v)} /> {label}
            </label>
          ))}
        </EcCond>
      </ul>

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        휴가 <b className="text-ec-text">{shown.length}</b>건
        <span className="my-0 mx-[6px] text-ec-off">|</span>
        사용일수 합계 <b className="text-ec-navy text-[14px]">{totalDays.toLocaleString('ko-KR')}</b>일
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {codeBlocks ? (
        <VacationCodeUseReport blocks={codeBlocks.filter((b) => (employment === 'ALL' || (employment === 'ACTIVE') === b.emp.active) && (emp.length === 0 || emp.includes(b.emp.name)))}
                               companyName={companyName} vacationName={vkinds.find((k) => `VK:${k.id}` === codePick)?.name ?? ''} />
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            {/* 원본 휴가사용실적현황의 첫 열 [전표번호]. 어느 근태 전표에서 나온 줄인지가 없었다. */}
            <th className="w-[150px]">전표번호</th>
            <th>사원명</th>
            <th>부서</th>
            <th className="text-center">휴가종류</th>
            <th>시작일</th>
            <th>종료일</th>
            <th>적요</th>
            <th className="text-right">휴가일수</th>
            <th className="text-right">휴가사용일수</th>
            <th className="text-right">휴가잔여일수</th>
            <th className="text-center">상태</th>
            <th className="w-[90px] text-center">결재</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={13} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : remainLines.map(({ row: r, grant, remain, first }, i) => (
            <tr key={r.id} style={first && i > 0 ? { borderTop: '2px solid #d7dce3' } : undefined}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td style={mono}>{r.docNo}</td>
              <td>{first ? r.empName : ''}</td>
              <td>{first ? (r.department ?? '') : ''}</td>
              <td className="text-center">{r.type}</td>
              <td style={mono}>{dateText(r.startDate)}</td>
              <td style={mono}>{dateText(r.endDate)}</td>
              <td>{r.reason ?? ''}</td>
              <td className="text-right text-ec-label">{grant != null ? days(grant) : ''}</td>
              <td className="text-right">{days(r.days)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: remain != null && remain < 0 ? 'var(--ec-danger)' : undefined }}>
                {remain != null ? days(remain) : ''}
              </td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: statusColor(r.status) }}>{r.statusName}</td>
              <td className="text-center">
                {r.status === 'PENDING' ? (
                  <>
                    <button onClick={() => changeStatus(r, 'APPROVED')} style={{ color: 'var(--ec-success)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>승인</button>
                    <button onClick={() => changeStatus(r, 'REJECTED')} style={{ color: 'var(--ec-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>반려</button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </EcListShell>
  )
}
