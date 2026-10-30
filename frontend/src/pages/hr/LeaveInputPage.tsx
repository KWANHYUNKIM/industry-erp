import { useEffect, useState, useRef} from 'react'
import CodePickerField from '../../components/CodePickerField'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { ymd } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useNavigate } from 'react-router-dom'
import GridFindButton from '../../components/GridFindButton'
import type { EmployeeMaster } from '../../types/api'
import { ecConfirm } from '../../components/EcDialog'

/**
 * 관리 > 근태관리 > 근태입력.
 *
 * <p>원본 실측(사본): 상단에 [출/퇴근] 탭과 [근태일괄입력], 그리드는
 * <b>근태일자 · 사원 · 휴가 · 근태(일/시간) · 적요</b>. 즉 여기서 넣는 것은 출퇴근 시각이
 * 아니라 <b>연차·반차 같은 근태 기록</b>이다. 근태조회·근태현황도 같은 것을 본다
 * (근태조회 열: 근태번호 · 근태일자 · 사원명 · 근태코드 · 근태수 · 적요).
 *
 * <p>우리 근태입력은 <b>출퇴근 시각</b>을 넣는 화면이었다. 출퇴근은 원본에서도 따로
 * [출/퇴근기록부(ID)] 가 맡는다 — 그 화면은 그대로 두고 이 자리만 원본 뜻으로 돌린다.
 *
 * <p>격자 위 <b>[출/퇴근 ▲ › 사원기준]</b>(원본 2026-10-13 실측) — '출/퇴근기록' 창: 기간(금월 1일 ~ 오늘) · 근태코드(근태유형
 * 출/퇴근인 근태항목만 띄움) · 사원 · 부서 · 프로젝트, 아래 [기간별 ▾ / 일별] [적용(F8)] [닫기]. 적용하면 출/퇴근기록부(사원)의 기록을
 * 근태항목의 출/퇴근반영기준으로 셈해 줄을 깐다(지각 · 시간 → 5.15 처럼). 저장은 아직 아니다. ID기준 · 프로젝트는 없다.
 *
 * <p>원본처럼 <b>여러 줄을 한 번에</b> 넣는다. 한 줄씩 저장하게 하면 월초에 열 명 연차를
 * 넣을 때 열 번 저장해야 한다.
 *
 * <p><b>사원 기준</b>(2026-10-21) — 원본 [사원] 칸은 사원등록의 사원 코드도움이다. 예전엔 로그인 계정을 골라
 * 계정이 없는 사원은 근태를 넣을 수 없었다. 원본 격자는 근태일자 하나(종료일자 없음) · 사원 · 근태 · 휴가 · 근태(일/시간)이고,
 * 결재 없이 저장하면 곧바로 근태현황 · 휴가잔여에 잡힌다 — 그래서 승인(확인)으로 넣는다.
 */
interface CommuteKind { id: number; code: string; name: string; type: string; active: boolean }
interface ReflectLine { workDate: string; employeeId: number; employeeName: string; kindId: number; kindName: string; amount: number; note: string | null }
const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)) }

interface LineInput {
  key: number
  employeeId: string
  type: string
  startDate: string
  endDate: string
  days: string
  reason: string
}

/** 원본 [근태코드] — 근태항목등록(/hr/attendance-kinds)의 사용 중인 항목. 불러오기 전에는 처음 심어 둔 여섯 항목. */
const SEED_TYPES = ['연차', '반차', '병가', '경조', '공가', '기타']
/** 연차 잔여에서 빠지는 근태 — 서버 HrService.DEDUCTS_ANNUAL 과 같다. */
const ANNUAL_TYPES = ['연차', '반차']

let nextKey = 1
const emptyLine = (date: string): LineInput => ({
  key: nextKey++, employeeId: '', type: '연차', startDate: date, endDate: date, days: '1', reason: '',
})

/**
 * @param onClose 창으로 띄울 때(기안서작성 — 결재문서가 '근태관리' 인 휴가신청서를 열면 같이 뜬다, 원본 2026-10-30 실측).
 *   주면 [리스트] 자리에 원본 창의 [닫기] 가 선다.
 */
export default function LeaveInputPage({ onClose }: { onClose?: () => void } = {}) {
  /** 원본 [리스트] — 넣은 근태를 보러 근태조회로 간다. */
  const navigate = useNavigate()
  /** 원본 [사원] 코드도움 — 사원등록의 재직 사원 */
  const [users, setUsers] = useState<EmployeeMaster[]>([])
  const [baseDate, setBaseDate] = useState(ymd(new Date()))
  const [lines, setLines] = useState<LineInput[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)
  const [types, setTypes] = useState<string[]>(SEED_TYPES)
  /** 근태항목 → 휴가코드(휴가항목) — 원본 [휴가] 칸이 근태를 고르면 이것으로 찬다 */
  const [kindVacation, setKindVacation] = useState<Record<string, { name: string; from: string; to: string } | null>>({})

  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setUsers(r.data.filter((e) => e.active))).catch(() => {})
    Promise.all([
      api.get<{ name: string; active: boolean; vacationKindId: number | null }[]>('/hr/attendance-kinds'),
      api.get<{ id: number; name: string; periodFrom: string; periodTo: string }[]>('/hr/vacation-kinds'),
    ]).then(([k, v]) => {
      const names = k.data.filter((x) => x.active).map((x) => x.name)
      if (names.length) setTypes(names)
      setKindVacation(Object.fromEntries(k.data.map((x) => {
        const vk = v.data.find((y) => y.id === x.vacationKindId)
        return [x.name, vk ? { name: vk.name, from: vk.periodFrom, to: vk.periodTo } : null]
      })))
    }).catch(() => {})
    setLines([emptyLine(ymd(new Date())), emptyLine(ymd(new Date())), emptyLine(ymd(new Date()))])
  }, [])

  const setLine = (key: number, patch: Partial<LineInput>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  /** 근태일자를 바꾸면 아직 손대지 않은 줄의 일자도 따라간다 — 대개 같은 날을 넣는다. */
  function changeBaseDate(v: string) {
    setBaseDate(v)
    setLines((prev) => prev.map((l) => (l.employeeId ? l : { ...l, startDate: v, endDate: v })))
  }

  /*
   * 원본 상단의 <b>[근태일괄입력]</b>. 예전에는 '여러 사원의 근태를 한 번에 넣는 화면이 없다'
   * 고 적고 뺐는데, <b>이 화면이 이미 여러 줄을 한 번에 넣는다</b> — 없던 것은
   * <b>같은 근태를 여러 사람에게 한꺼번에 까는</b> 길이었다. 열 명 연차를 넣으려면
   * 줄마다 사원을 고르고 항목·기간·일수를 열 번 똑같이 찍어야 했다.
   *
   * <p>저장하지 않고 <b>줄만 채운다.</b> 저장은 기존 [저장]이 한다 — 넣기 전에 눈으로
   * 확인하고 한 줄쯤 고칠 수 있어야 하고, 검사도 한 자리에만 두는 편이 낫다.
   */
  const [commuteMenu, setCommuteMenu] = useState(false)
  const [cmOpen, setCmOpen] = useState(false)
  const [cmError, setCmError] = useState('')
  const [cm, setCm] = useState({ from: monthStart(), to: ymd(new Date()), kinds: [] as string[], emps: [] as string[], depts: [] as string[], mode: 'PERIOD' })
  const [commuteKinds, setCommuteKinds] = useState<CommuteKind[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [depts, setDepts] = useState<{ id: number; code?: string | null; name: string }[]>([])

  function openCommute() {
    setCommuteMenu(false); setCmError('')
    setCm((c) => ({ ...c, from: monthStart(), to: ymd(new Date()) }))
    api.get<CommuteKind[]>('/hr/attendance-kinds').then((r) => setCommuteKinds(r.data.filter((k) => k.active && k.type === 'COMMUTE'))).catch(() => setCommuteKinds([]))
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<typeof depts>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
    setCmOpen(true)
  }

  /** [적용(F8)] — 셈한 줄을 격자에 깐다(사원 기준이라 계정이 없어도 넣는다). */
  async function applyCommute() {
    setCmError('')
    try {
      const r = await api.get<ReflectLine[]>('/hr/commute-rules/reflect', { params: {
        from: cm.from, to: cm.to, mode: cm.mode,
        kindIds: cm.kinds.join(',') || undefined, employeeIds: cm.emps.join(',') || undefined, departmentIds: cm.depts.join(',') || undefined,
      } })
      const made = r.data.map((x) => ({
        ...emptyLine(x.workDate), employeeId: String(x.employeeId), type: x.kindName, days: String(x.amount),
        /* 원본 일별 줄의 적요 '출근: 10:30 / 퇴근: 16:20' — 기간별은 빈칸 */
        reason: x.note ?? '',
      }))
      setLines((prev) => {
        const kept = prev.filter((l) => l.employeeId)
        const blanks = prev.filter((l) => !l.employeeId)
        return [...kept, ...made, ...blanks.slice(0, Math.max(0, 3 - kept.length - made.length))]
      })
      setCmOpen(false)
      setError('')
    } catch (e) {
      setCmError(extractErrorMessage(e))
    }
  }

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkUsers, setBulkUsers] = useState<Set<number>>(new Set())
  const [bulkForm, setBulkForm] = useState({ type: '연차', startDate: '', endDate: '', days: '1', reason: '' })

  function fillBulk() {
    if (bulkUsers.size === 0) { setError('사원을 고르세요.'); return }
    const from = bulkForm.startDate || baseDate
    const to = bulkForm.endDate || from
    setError('')
    setLines((prev) => {
      /* 아직 사원을 안 고른 빈 줄은 <b>덮어 쓴다</b> — 처음 세 줄이 빈 채로 남지 않게. */
      const blanks = prev.filter((l) => !l.employeeId)
      const kept = prev.filter((l) => l.employeeId)
      const made = [...bulkUsers].map((id) => ({
        ...emptyLine(from), employeeId: String(id), type: bulkForm.type,
        startDate: from, endDate: to, days: bulkForm.days || '1', reason: bulkForm.reason,
      }))
      return [...kept, ...made, ...blanks.slice(0, Math.max(0, 3 - kept.length - made.length))]
    })
    setBulkUsers(new Set())
    setBulkOpen(false)
  }

  async function save() {
    setError(''); setOk('')
    const valid = lines.filter((l) => l.employeeId && Number(l.days) > 0)
    if (valid.length === 0) return setError('사원과 근태(일)를 1줄 이상 입력하세요.')
    // 원본: 근태의 휴가코드 사용기간이 근태일자를 안 품으면 묻는다(출력물에서 안 보이게 되므로)
    const outside = valid.map((l) => kindVacation[l.type]).filter((v, i) => v && (valid[i].startDate < v.from || valid[i].startDate > v.to))
    if (outside.length > 0) {
      const v = outside[0]!
      const ok = (await ecConfirm(`휴가 ${v.name} (사용기간 ${v.from.replace(/-/g, '/')} ~ ${v.to.replace(/-/g, '/')})\n\n`
        + '휴가코드가 입력된 근태일자에 포함되지 않습니다.\n포함되지 않은 코드를 입력한 경우 출력물에서 조회되지 않습니다.\n저장하시겠습니까?'))
      if (!ok) return
    }
    setSaving(true)
    let done = 0
    const nos: string[] = []
    try {
      for (const l of valid) {
        const res = await api.post<{ docNo: string }>('/hr/vacations', {
          employeeId: Number(l.employeeId),
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate && l.endDate >= l.startDate ? l.endDate : l.startDate,
          days: Number(l.days),
          reason: l.reason || null,
          /* 원본 근태입력은 결재가 없다 — 저장하면 곧바로 근태현황 · 휴가잔여에 잡힌다 */
          status: 'APPROVED',
        })
        done += 1
        nos.push(res.data.docNo)
      }
      // 번호를 같이 — 서버가 매기는 근태번호다. 몇 번으로 들어갔는지 알아야 근태조회에서 찾는다.
      setOk(`${done}건 저장했습니다 (${nos.join(', ')})`)
      setLines([emptyLine(baseDate), emptyLine(baseDate), emptyLine(baseDate)])
    } catch (err) {
      // 몇 줄은 이미 들어갔을 수 있다 — 몇 건이 저장됐는지 같이 알려 준다.
      setError(`${extractErrorMessage(err)}${done > 0 ? ` (앞의 ${done}건은 저장됐습니다)` : ''}`)
    } finally {
      setSaving(false)
    }
  }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '근태입력', [])

  return (
    <EcListShell
      title="근태입력"
      searchable={false}
      actions={[
        /* 원본 상단의 [근태일괄입력] — 같은 근태를 여러 사람에게 한꺼번에 깐다.
           원본 차례상 <b>맨 앞</b>이다(근태일괄입력 · 저장(F8) · 리스트). */
        { label: '근태일괄입력', onClick: () => {
          setError(''); setBulkForm((f) => ({ ...f, startDate: baseDate, endDate: baseDate })); setBulkOpen(true)
        } },
        { label: saving ? '저장 중…' : '저장(F8)', primary: true, onClick: save },
        // 원본 아래 버튼줄 차례(2026-10-04 실측): 저장(F8) · 저장/전표(F7) · 다시 작성 · 리스트 · 웹자료올리기
        { label: '다시 작성', onClick: () => setLines([emptyLine(baseDate), emptyLine(baseDate), emptyLine(baseDate)]) },
        /*
         * 원본 [리스트] — 넣은 것을 보러 근태조회로 간다. 저장해도 이 화면에
         * 그대로 남아(줄만 비워진다) 방금 넣은 것을 확인할 길이 없었다.
         */
        onClose ? { label: '닫기', onClick: onClose } : { label: '리스트', onClick: () => navigate('/hr/leave-list') },
        // 우리에게만 있는 [줄 추가] — 원본 격자는 줄이 모자라면 스스로 늘린다. 차례상 맨 끝.
        { label: '줄 추가', onClick: () => setLines((p) => [...p, emptyLine(baseDate)]) },
      ]}
    >
      <Modal error={error} open={bulkOpen} title="근태일괄입력" onClose={() => setBulkOpen(false)}>{(
        <div className="p-[4px] min-w-[460px]">
          <div className="flex gap-[10px] flex-wrap items-end mb-[10px]">
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">근태항목</div>
              <select className="ec-input" value={bulkForm.type} style={{ width: 110 }}
                      onChange={(e) => setBulkForm((f) => ({ ...f, type: e.target.value }))}>
                {types.map((t) => <option key={t}>{t}</option>)}
              </select></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">기간</div>
              <input type="date" className="ec-input" value={bulkForm.startDate} style={{ width: 140 }}
                     onChange={(e) => setBulkForm((f) => ({ ...f, startDate: e.target.value }))} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">~</div>
              <input type="date" className="ec-input" value={bulkForm.endDate} style={{ width: 140 }}
                     onChange={(e) => setBulkForm((f) => ({ ...f, endDate: e.target.value }))} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">근태(일)</div>
              <input type="number" step="any" className="ec-input" value={bulkForm.days} style={{ width: 80, textAlign: 'right' }}
                     onChange={(e) => setBulkForm((f) => ({ ...f, days: e.target.value }))} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">적요</div>
              <input className="ec-input" value={bulkForm.reason} style={{ width: 160 }}
                     onChange={(e) => setBulkForm((f) => ({ ...f, reason: e.target.value }))} /></label>
          </div>
          {/* 사원은 여럿 고른다 — 그게 이 창의 전부다. */}
          <div className="max-h-[220px] overflow-y-auto border border-ec-line border-solid p-[8px]">
            {users.map((u) => (
              <label key={u.id} className="inline-flex items-center gap-[4px] w-[150px] text-[12.5px]">
                <input type="checkbox" checked={bulkUsers.has(u.id)}
                       onChange={() => setBulkUsers((prev) => {
                         const next = new Set(prev)
                         if (next.has(u.id)) next.delete(u.id); else next.add(u.id)
                         return next
                       })} />
                {u.name}{u.department ? ` (${u.department})` : ''}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-[6px] mt-[10px]">
            <span className="mr-auto text-[11.5px] text-ec-hint">
              고른 {bulkUsers.size}명만큼 줄을 깝니다. <b>저장은 아직 아닙니다</b> — 확인하고 [저장(F8)] 하세요.
            </span>
            <button className="ec-btn ec-btn-primary" onClick={fillBulk}>줄 깔기</button>
          </div>
        </div>
      )}</Modal>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <div className="flex items-center gap-[6px] mb-[8px]">
        <span className="text-[12.5px] text-ec-label">일자</span>
        <input className="ec-input" type="date" value={baseDate}
               onChange={(e) => changeBaseDate(e.target.value)} style={{ width: 150 }} />
        <span className="text-[11.5px] text-ec-hint">
          여러 사원의 근태를 한 번에 넣습니다. 출퇴근 시각은 [출/퇴근기록부(ID)]에서 다룹니다.
        </span>
      </div>

      {/* 원본 격자 위 [찾기(F3)] */}
      <div className="flex gap-[6px] mb-[6px] relative">
        <GridFindButton tableRef={tableRef} />
        {/* 원본 격자 위 [출/퇴근 ▲] — 사원기준 · ID기준(ID기준은 아직 없다) */}
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setCommuteMenu((v) => !v)}>출/퇴근 ▲</button>
        {commuteMenu && (
          <>
            <div className="ec-backdrop-clear" onClick={() => setCommuteMenu(false)} />
            <div className="ec-menu absolute top-[26px] left-[60px]">
              <button type="button" onClick={openCommute}>사원기준</button>
            </div>
          </>
        )}
      </div>
      <Modal error={cmError} open={cmOpen} title="출/퇴근기록" width={760} onClose={() => setCmOpen(false)}>
        <ul className="ec-form">
          <li className="wide">
            <span className="title">기간</span>
            <div className="form flex items-center gap-[6px]">
              <input type="date" className="ec-input w-[150px]" value={cm.from} onChange={(e) => setCm({ ...cm, from: e.target.value })} /> ~
              <input type="date" className="ec-input w-[150px]" value={cm.to} onChange={(e) => setCm({ ...cm, to: e.target.value })} />
            </div>
          </li>
          <li className="wide">
            <span className="title">근태코드</span>
            <div className="form">
              <CodePickerField label="근태코드" hideLabel fill multiple placeholder="근태코드" values={cm.kinds}
                               onChangeMulti={(v) => setCm({ ...cm, kinds: v })}
                               items={commuteKinds.map((k) => ({ value: String(k.id), code: k.code, name: k.name }))} />
            </div>
          </li>
          <li className="wide">
            <span className="title">사원</span>
            <div className="form">
              <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={cm.emps}
                               onChangeMulti={(v) => setCm({ ...cm, emps: v })}
                               items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
            </div>
          </li>
          <li className="wide">
            <span className="title">부서</span>
            <div className="form">
              <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={cm.depts}
                               onChangeMulti={(v) => setCm({ ...cm, depts: v })}
                               items={depts.map((d) => ({ value: String(d.id), code: d.code ?? undefined, name: d.name }))} />
            </div>
          </li>
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <select className="ec-input w-[90px]" value={cm.mode} onChange={(e) => setCm({ ...cm, mode: e.target.value })}>
            <option value="PERIOD">기간별</option>
            <option value="DAILY">일별</option>
          </select>
          <button type="button" className="ec-btn ec-btn-primary" onClick={applyCommute}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setCmOpen(false)}>닫기</button>
        </div>
      </Modal>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[130px]">근태일자</th>
              <th className="w-[180px]">사원</th>
              <th className="w-[120px]">근태</th>
              {/*
                원본 근태입력 그리드의 [휴가] 열 — 이 근태가 어느 휴가 잔여에서 빠지는가.
                우리 잔여 계산은 승인된 <b>연차·반차</b>만 그 해 연차에서 빼므로 그 둘은 '연차(YYYY년)', 나머지는 차감 없음이다.
                고르는 칸이 아니라 <b>어디서 빠지는지 알려 주는 칸</b>이라 읽기전용으로 둔다 —
                고를 수 있는 것처럼 보이면 다른 데서 빠질 수 있다는 뜻이 되어 거짓말이 된다.
              */}
              <th className="w-[120px]">휴가</th>
              <th className="w-[110px] text-right">근태(일/시간)</th>
              <th>적요</th>
              <th className="w-[50px] text-center"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  {/* 원본은 근태일자 하나 — 여러 날은 줄을 나눠 넣는다(근태일괄입력의 기간은 그대로 한 줄로 간다) */}
                  <input className="ec-input" type="date" value={l.startDate}
                         onChange={(e) => setLine(l.key, { startDate: e.target.value, endDate: e.target.value })} />
                </td>
                <td>
                  {/* 원본 [사원] — 사원등록의 사원 코드도움(사원번호 · 사원명) */}
                  <CodePickerField label="사원" hideLabel fill placeholder="사원" emptyLabel="선택 해제"
                                   value={l.employeeId} onChange={(v) => setLine(l.key, { employeeId: v })}
                                   items={users.map((u) => ({ value: String(u.id), code: u.code, name: u.name, sub: u.department }))} />
                </td>
                <td>
                  <select className="ec-input" value={l.type}
                          onChange={(e) => setLine(l.key, { type: e.target.value })}>
                    {types.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td className="text-ec-muted">
                  {/* 연차·반차만 연차 잔여에서 빠진다 — 병가·경조·공가·기타는 따로 간다(QA 61회차). */}
                  {/* 원본 [휴가] — 근태항목의 휴가코드(휴가항목등록). 휴가코드가 없는 근태는 연차 차감 여부를 알려 준다. */}
                  {!l.startDate ? '' : kindVacation[l.type]?.name
                    ?? (ANNUAL_TYPES.includes(l.type) ? `연차(${l.startDate.slice(0, 4)}년)` : '— (연차 차감 없음)')}
                </td>
                <td>
                  {/* 반차 0.5, 시간 단위 0.125 까지 넣는다 — 소수 세 자리로 저장된다. */}
                  <input className="ec-input text-right" type="number" step="0.001" value={l.days}
                         onChange={(e) => setLine(l.key, { days: e.target.value })} />
                </td>
                <td>
                  <input className="ec-input w-full" value={l.reason}
                         onChange={(e) => setLine(l.key, { reason: e.target.value })} />
                </td>
                <td className="text-center">
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                            style={{ border: 'none', background: 'none', color: '#c0c5cc', cursor: 'pointer' }}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-[8px] text-[11.5px] text-ec-hint">
        * 근태(일)는 <b>기간 안</b>이어야 합니다. 하루짜리에 100일을 넣으면 잔여일수가 통째로 틀어집니다.
        반차(0.5)와 시간 단위(0.125 = 1시간)도 그대로 들어갑니다.
      </p>
    </EcListShell>
  )
}
