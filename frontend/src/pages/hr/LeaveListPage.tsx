import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { openAppBarPanel } from '../../components/AppBarPanel'
import { EcCond } from '../../components/EcStatusPanel'
import { leaveNo } from '../../utils/leaveNo'
import { api, extractErrorMessage } from '../../api/client'
import { useDeptGroups } from '../../utils/deptGroups'
import { printDocuments } from '../../utils/printDocument'
import { formatDays } from '../../utils/dayCount'
import { vacationFetchRange } from '../../utils/vacationFetchRange'
import { ecConfirm } from '../../components/EcDialog'
import { periodOf } from '../../utils/periods'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'

/**
 * 관리 > 근태관리 > 근태조회.
 *
 * <p>원본 열 실측(사본): <b>근태번호</b> · 근태일자 · 사원명 · 근태코드 · 근태수 · 휴가명 · 적요.
 * 탭은 전체 · 결재중 · 확인 · 이력이고, 버튼은 신규(F2) · 메신저 · 인쇄 · 선택삭제 · Excel · 이력조회다(2026-10-20).
 * 즉 여기서 보는 것은 출퇴근이 아니라 <b>연차·반차 같은 근태 기록</b>이다.
 *
 * <p>우리 근태조회는 <b>출퇴근 시각</b> 목록이었다. 출퇴근은 원본에서도 따로
 * [출/퇴근기록부(ID)] 가 맡는다 — 그 화면은 그대로 두고 이 자리만 원본 뜻으로 돌린다.
 *
 * <p>원본의 [휴가명]은 '연차(2026년)' 처럼 <b>휴가 항목 마스터</b>를 가리킨다. 우리에겐
 * 휴가코드 마스터가 없어 근태코드 하나로 쓴다 — 없는 열을 만들어 두면 늘 빈칸이 된다.
 */
type Status = 'PENDING' | 'APPROVED' | 'REJECTED'

interface Row {
  id: number
  docNo: string
  /** 전표일자 — 이 근태를 올린 날. */
  docDate: string
  /** 근태의 사원(사원 기준 — 수정 창이 이것으로 고른다). 옛 자료처럼 계정에 사원이 안 이어져 있으면 null. */
  employeeId: number | null
  empName: string
  /** 사원번호. 계정이 사원과 안 이어져 있으면 null. */
  empCode: string | null
  jobTitle: string | null
  department: string | null
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string | null
  status: Status
  statusName: string
}

/** 원본 탭(qa/fixtures/ecount-screen-tabs.json: 전체 · 결재중 · UserPay · 확인 · 이력 — UserPay 는 회사가 만든 진행상태). '이력' 은 반려까지 다 보는 자리라 우리 반려를 그쪽에 둔다. */
const TABS = ['전체', '결재중', '확인', '이력'] as const
type Tab = typeof TABS[number]

/** 원본 근태조회 [근태수] 는 소수 둘째 자리까지 채운다(2026-10-20 실측 '1.00'). */
const days = (n: number) => formatDays(n, 2)

/** 원본 근태조회 조건 판의 ▾ 기간 빠른선택(2026-10-20 실측) — 처음 값은 맨 끝 [최근30일(+1개월)](오늘 -30 ~ +30일). */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '전월+금월', '금년', '전년', '종료일', '최근30일(+1개월)'] as const
const DEFAULT_RANGE = periodOf('최근30일(+1개월)')

export default function LeaveListPage() {
  /** 원본 근태조회의 [신규(F2)] — 근태입력 화면을 연다. */
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('전체')
  /*
   * 근태현황에서 줄을 눌러 넘어올 때 <b>그 사원을 물고</b> 열린다(?emp=사원명).
   * 원본은 현황의 [전표일자]를 눌러 그 전표를 연다. 현황에서 고르고 넘어왔는데
   * 전체 목록이 나오면 다시 찾아야 해서, 눌러 온 뜻이 없어진다.
   */
  const [searchParams] = useSearchParams()
  /** [사원] · [부서] — 여러 개 고르는 코드도움. 근태 줄은 계정 단위라 사원 이름 · 부서 이름으로 거른다. ?emp= 로 들어오면 그 사원을 골라 둔다. */
  const [emp, setEmp] = useState<string[]>(searchParams.get('emp') ? [searchParams.get('emp')!] : [])
  const [empList, setEmpList] = useState<{ id: number; code: string; name: string; department: string }[]>([])
  const [deptList, setDeptList] = useState<{ id: number; code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof empList>('/employees/all').then((r) => setEmpList(r.data)).catch(() => setEmpList([]))
    api.get<typeof deptList>('/departments').then((r) => setDeptList(r.data)).catch(() => setDeptList([]))
  }, [])
  /** [근태항목] — 근태항목등록 마스터에서 여러 개 고른다. */
  const [type, setType] = useState<string[]>([])
  const [kindMaster, setKindMaster] = useState<{ code: string; name: string; kindGroup: string | null; vacationKindId: number | null }[]>([])
  /** 원본 [휴가항목] · [근태그룹](근태항목 다음) — 근태 줄의 근태항목이 가리키는 휴가코드 · 근태그룹으로 거른다. */
  const [vkCond, setVkCond] = useState<string[]>([])
  const [groupCond, setGroupCond] = useState<string[]>([])
  const [vkMaster, setVkMaster] = useState<{ id: number; code: string; name: string }[]>([])
  const [groupMaster, setGroupMaster] = useState<{ code: string; name: string }[]>([])
  useEffect(() => {
    api.get<typeof kindMaster>('/hr/attendance-kinds').then((r) => setKindMaster(r.data)).catch(() => setKindMaster([]))
    api.get<typeof vkMaster>('/hr/vacation-kinds').then((r) => setVkMaster(r.data)).catch(() => setVkMaster([]))
    api.get<typeof groupMaster>('/hr/attendance-kind-groups').then((r) => setGroupMaster(r.data)).catch(() => setGroupMaster([]))
  }, [])
  /*
   * 원본 근태조회의 조건 차례는 <b>기준일자 · 사원 · 부서 · … · 적요 · 근태일자</b> 다
   * (사본 실측). 부서와 적요가 없었는데 <b>둘 다 이미 목록에 실려 오고 있었다</b>.
   */
  const [dept, setDept] = useState<string[]>([])
  /*
   * 원본 근태조회(E020711) 조건 <b>[부서계층그룹]</b>. 2026-09-09 에 원본을 열어 재니
   * [부서] 바로 다음이 이것이다. [부서]는 그 부서 하나로 좁히지만 이쪽은
   * <b>그 부서와 그 아래 전부</b>를 본다 — "생산본부 전체의 휴가가 몇 건인가" 를
   * 눈으로 더하지 않아도 된다. 부서 트리는 진작 있고 다른 근태 화면이 이미 쓴다.
   */
  const [deptGroup, setDeptGroup] = useState('')
  const { groups: deptGroups, inGroup } = useDeptGroups()
  const [reasonCond, setReasonCond] = useState('')
  /*
   * 원본 조건 차례의 <b>맨 뒤 [근태일자]</b>. [기준일자]는 신청한 날의 구간이고,
   * 이것은 <b>그날 근태가 걸쳐 있는가</b>를 묻는다 — 3일짜리 휴가는 가운데 날로도 걸려야 한다.
   * 목록에 근태일자가 찍히는데 그 날짜로 좁힐 수가 없었다.
   */
  const [dayCond, setDayCond] = useState('')
  /** 원본 조건 [기준일자] — 신청한 기간으로 좁힌다([근태일자]와 다른 것이다). */
  const [fromCond, setFromCond] = useState(DEFAULT_RANGE?.from ?? '')
  const [toCond, setToCond] = useState(DEFAULT_RANGE?.to ?? '')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  async function load() {
    setLoading(true)
    setError('')
    try {
      /* [기준일자]·[근태일자]가 올해 밖이면 올해 것만 받아서는 늘 빈 표다 — 그 해들을 묻는다. */
      const range = vacationFetchRange(fromCond || dayCond, toCond || dayCond)
      setRows((await api.get<Row[]>('/hr/vacations', { params: range ?? {} })).data)
      setChecked(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  /* 조건이 다른 해로 넘어가면 다시 받는다 — 같은 해 안에서는 받아 둔 것을 화면이 거른다. */
  const fetchKey = JSON.stringify(vacationFetchRange(fromCond || dayCond, toCond || dayCond))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [fetchKey])

  /**
   * 원본 근태조회 [인쇄]. 근태 전표는 <b>금액도 거래 상대도 없다</b> —
   * 0원짜리 거래처럼 그리지 않도록 금액·공급자 칸을 빼고 찍는다.
   */
  async function printOne(r: Row) {
    await printDocuments([{
      title: '근태전표',
      docNo: r.docNo,
      docDate: r.startDate,
      hideAmounts: true,
      hideParties: true,
      supplier: { label: '', name: '' },
      customer: { label: '', name: '' },
      extra: [
        { label: '사원', value: r.empCode ? `[${r.empCode}] ${r.empName}` : r.empName },
        { label: '부서', value: r.department },
        { label: '근태코드', value: r.type },
        { label: '기간', value: r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}` },
      ],
      remark: r.reason,
      lines: [{
        itemCode: r.type, itemName: r.empName, unit: '일',
        quantity: r.days, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
      }],
    }])
  }

  const shown = useMemo(() => rows.filter((r) => {
    if (emp.length && !emp.includes(r.empName)) return false
    if (type.length && !type.includes(r.type)) return false
    const km = kindMaster.find((k) => k.name === r.type)
    if (vkCond.length && !vkCond.includes(String(km?.vacationKindId ?? ''))) return false
    if (groupCond.length && !groupCond.includes(km?.kindGroup ?? '')) return false
    if (dept.length && !dept.includes(r.department ?? '')) return false
    if (!inGroup(r.department, deptGroup)) return false
    if (reasonCond && !(r.reason ?? '').includes(reasonCond)) return false
    if (dayCond && !(r.startDate <= dayCond && dayCond <= r.endDate)) return false
    /* [기준일자] — 신청 기간이 이 구간에 걸치나. 시작이 끝보다 뒤면 겹치지 않는 것이다. */
    if (fromCond && r.endDate < fromCond) return false
    if (toCond && r.startDate > toCond) return false
    if (tab === '결재중' && r.status !== 'PENDING') return false
    if (tab === '확인' && r.status !== 'APPROVED') return false
    if (tab === '이력' && r.status !== 'REJECTED') return false
    return true
  }), [rows, emp, type, vkCond, groupCond, kindMaster, tab, dept, deptGroup, inGroup, reasonCond, dayCond, fromCond, toCond])

  /*
   * 원본 [근태번호] 를 누르면 그 근태의 수정 창(근태입력)이 뜬다 — 근태일자 · 사원 · 근태 · 근태(일/시간) · 적요를 고쳐 [저장(F8)].
   * 우리는 지금까지 고칠 길이 없어 지우고 다시 넣어야 했다(번호가 바뀐다).
   */
  const [edit, setEdit] = useState<{ id: number; startDate: string; endDate: string; employeeId: string; type: string; days: string; reason: string } | null>(null)
  const [editError, setEditError] = useState('')
  async function saveEdit() {
    if (!edit) return
    setEditError('')
    try {
      await api.put(`/hr/vacations/${edit.id}`, {
        employeeId: edit.employeeId ? Number(edit.employeeId) : null,
        type: edit.type, startDate: edit.startDate,
        endDate: edit.endDate && edit.endDate >= edit.startDate ? edit.endDate : edit.startDate,
        days: Number(edit.days), reason: edit.reason || null,
      })
      setEdit(null)
      load()
    } catch (err) {
      setEditError(extractErrorMessage(err))
    }
  }

  async function removeChecked() {
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    setError('')
    try {
      for (const id of checked) await api.delete(`/hr/vacations/${id}`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const toggle = (id: number) => setChecked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="근태조회"
      onNew={() => navigate('/hr/leave-input')}
      actions={[
        /*
         * 원본 근태조회의 [메신저]. 예전에는 '사내 메신저가 없다' 고 적고 뺐는데
         * <b>메신저는 진작 있었다</b>(앱바 💬). 근태를 보다 그 사람에게 바로 물으려면
         * 화면을 떠나지 않고 열려야 한다 — 앱바의 <b>같은 창</b>을 연다.
         *
         * <p>원본 차례상 <b>[인쇄] 앞</b>이다(신규(F2) · 메신저 · 인쇄 …).
         */
        { label: '메신저', onClick: () => openAppBarPanel('messenger') },
        // 원본 차례: 신규(F2) · 메신저 · 인쇄 · 선택삭제 · Excel (사본 실측)
        { label: '인쇄' },
        { label: '선택삭제', selected: checked.size, onClick: removeChecked },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="ec-pills" style={{ marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/*
          원본 차례: <b>[기준일자]</b> 가 맨 앞이다(사본 실측). 이 화면은 신청 전체를 늘
          받아 놓고 보여 줘서, <b>지난달에 낸 것</b>만 보려면 눈으로 훑어야 했다.
          아래 [근태일자]와 다른 것이다 — 그쪽은 <b>휴가가 걸쳐 있는 날</b>이고
          이쪽은 <b>신청한 기간</b>이다.
        */}
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: fromCond, onChange: (e) => setFromCond(e.target.value) }} to={{ className: "ec-input", value: toCond, onChange: (e) => setToCond(e.target.value) }} />
          {PICKS.map((l) => (
            <button key={l} type="button" className="ec-btn-pick"
                    onClick={() => { const r = periodOf(l); if (r) { setFromCond(r.from); setToCond(r.to) } }}>{l}</button>
          ))}
        </EcCond>
        {/*
          원본 차례는 <b>기준일자 · 근태일자 · 사원 · 부서 · 부서계층그룹 …</b> 이다
          (2026-09-09 원본 실측). 우리는 [근태일자]를 맨 뒤에 두고 "원본 조건 차례의
          맨 뒤" 라고 적어 두었는데 <b>틀렸다</b> — 사본만 보고 적은 것이었다.
        */}
        <EcCond label="근태일자">
          <EcDateInput className="ec-input" value={dayCond} onChange={(e) => setDayCond(e.target.value)} />
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={emp} onChangeMulti={(v) => setEmp(v)}
                           items={[...empList.map((e) => ({ value: e.name, code: e.code, name: e.name, sub: e.department })),
                             ...emp.filter((n) => !empList.some((e) => e.name === n)).map((n) => ({ value: n, name: n }))]} />
        </EcCond>
        {/* 원본은 [사원] 바로 다음이 [부서]다. */}
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={dept} onChangeMulti={(v) => setDept(v)}
                           items={deptList.map((d) => ({ value: d.name, code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        <EcCond label="부서계층그룹">
          <select className="ec-input" value={deptGroup} style={{ width: 160 }}
                  onChange={(e) => setDeptGroup(e.target.value)}>
            <option value="">전체</option>
            {deptGroups.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </EcCond>
        {/* 원본 근태조회의 이름은 [근태코드]가 아니라 <b>[근태항목]</b> 이다(사본 실측). */}
        <EcCond label="근태항목" pick>
          <CodePickerField label="근태항목" hideLabel fill multiple placeholder="근태항목"
                           values={type} onChangeMulti={(v) => setType(v)}
                           items={[...kindMaster.map((k) => ({ value: k.name, code: k.code, name: k.name })),
                             ...[...new Set(rows.map((r) => r.type))].filter((t) => t && !kindMaster.some((k) => k.name === t))
                               .map((t) => ({ value: t, name: t }))]} />
        </EcCond>
        <EcCond label="휴가항목">
          <CodePickerField label="휴가항목" hideLabel fill multiple placeholder="휴가항목" values={vkCond} onChangeMulti={(v) => setVkCond(v)}
                           items={vkMaster.map((v) => ({ value: String(v.id), code: v.code, name: v.name }))} />
        </EcCond>
        <EcCond label="근태그룹">
          <CodePickerField label="근태그룹" hideLabel fill multiple placeholder="근태그룹" values={groupCond} onChangeMulti={(v) => setGroupCond(v)}
                           items={groupMaster.map((g) => ({ value: g.name, code: g.code, name: g.name }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={reasonCond}
                 onChange={(e) => setReasonCond(e.target.value)} style={{ width: 180 }} />
        </EcCond>
      </ul>

      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              {/* 원본(2026-10-04 실측) 근태번호는 '2026/10/29 -1'(근태일자 -번호) 꼴이고 사원번호 열은 없다. */}
              <th className="w-[150px]">근태번호</th>
              <th className="w-[110px]">사원명</th>
              <th className="w-[100px]">근태코드</th>
              <th className="w-[100px] text-right">근태수</th>
              {/*
                원본 근태조회의 [휴가명] 열 — 이 근태가 <b>어느 휴가 잔여</b>에서 빠지는가.
                우리 잔여 계산(휴가잔여일수현황)은 승인된 근태를 모두 그 해 연차에서 뺀다.
                그래서 값이 하나뿐이라 지금까지 안 보여 줬는데, 그러면 사람은 이 근태가
                잔여를 깎는지 아닌지를 화면에서 알 수 없다.
                반려·대기는 아직 안 깎으므로 빈 칸이다.
              */}
              <th className="text-center w-[120px]">휴가명</th>
              <th className="text-center">적요</th>
              {/* 원본 근태조회의 마지막 열 [인쇄] — 그 한 건을 근태 전표로 찍는다. */}
              <th className="w-[60px] text-center">인쇄</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id}>
                <td className="text-center">
                  <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td>
                  <button type="button" className="ec-link"
                          onClick={() => { setEditError(''); setEdit({ id: r.id, startDate: r.startDate, endDate: r.endDate, employeeId: r.employeeId ? String(r.employeeId) : '', type: r.type, days: String(Number(r.days)), reason: r.reason ?? '' }) }}>
                    {leaveNo(r.docNo, r.startDate)}
                  </button>
                </td>
                <td>{r.empName}</td>
                <td>{r.type}</td>
                <td className="text-right">{days(r.days)}</td>
                {/* 휴가명 — 그 근태항목이 [휴가코드]로 가리키는 휴가항목(원본: 휴가코드가 없는 근태항목이면 빈칸) */}
                <td className="text-center">{vkMaster.find((v) => v.id === kindMaster.find((k) => k.name === r.type)?.vacationKindId)?.name ?? ''}</td>
                <td className="text-center">{r.reason ?? ''}</td>
                <td className="text-center">
                  <button onClick={() => printOne(r)}
                          style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} title="근태입력" error={editError} onClose={() => setEdit(null)}>
        {edit && (
          <>
            <ul className="ec-form">
              <li className="wide"><span className="title">근태일자</span>
                {/* 우리 근태는 기간(시작 ~ 끝) 한 줄이라 끝 날짜도 고친다 — 근태(일)는 기간 안이어야 한다 */}
                <div className="form flex items-center gap-[6px]">
                  <EcDateRange from={{ className: "ec-input w-[150px]", value: edit.startDate, onChange: (e) => setEdit({ ...edit, startDate: e.target.value, endDate: edit.endDate < e.target.value ? e.target.value : edit.endDate }) }} to={{ className: "ec-input w-[150px]", value: edit.endDate, onChange: (e) => setEdit({ ...edit, endDate: e.target.value }) }} />
                </div></li>
              <li className="wide"><span className="title">사원</span>
                <div className="form">
                  <CodePickerField label="사원" hideLabel fill placeholder="사원" value={edit.employeeId}
                                   onChange={(v) => setEdit({ ...edit, employeeId: v })}
                                   items={empList.map((e) => ({ value: String(e.id), code: e.code, name: e.name, sub: e.department }))} />
                </div></li>
              <li className="wide"><span className="title">근태</span>
                <div className="form">
                  <select className="ec-input w-[150px]" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                    {[...new Set([edit.type, ...kindMaster.map((k) => k.name)])].map((n) => <option key={n}>{n}</option>)}
                  </select>
                </div></li>
              <li className="wide"><span className="title">근태(일/시간)</span>
                <div className="form"><input type="number" step="0.001" className="ec-input w-[100px] text-right" value={edit.days}
                                             onChange={(e) => setEdit({ ...edit, days: e.target.value })} /></div></li>
              <li className="wide"><span className="title">적요</span>
                <div className="form"><input className="ec-input w-full" value={edit.reason}
                                             onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></div></li>
            </ul>
            <div className="flex gap-[6px] mt-[12px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={saveEdit}>저장(F8)</button>
              <button type="button" className="ec-btn" onClick={() => setEdit(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}

