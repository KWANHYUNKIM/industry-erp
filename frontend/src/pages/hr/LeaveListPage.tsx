import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { openAppBarPanel } from '../../components/AppBarPanel'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { printDocuments } from '../../utils/printDocument'
import { formatDays } from '../../utils/dayCount'

/**
 * 관리 > 근태관리 > 근태조회.
 *
 * <p>원본 열 실측(사본): <b>근태번호</b> · 근태일자 · 사원명 · 근태코드 · 근태수 · 휴가명 · 적요.
 * 탭은 전체 · 결재중 · 확인 · 이력이고, 버튼은 신규(F2) · 선택삭제 · 인쇄다.
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

/** 원본 탭. '이력' 은 반려까지 다 보는 자리라 우리 반려를 그쪽에 둔다. */
const TABS = ['전체', '결재중', '확인', '이력'] as const
type Tab = typeof TABS[number]

/** 원본은 소수 셋째 자리까지 채워 찍는다 — 자리수가 맞아야 세로로 견줄 수 있다. */
const days = formatDays

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
  const [emp, setEmp] = useState(searchParams.get('emp') ?? '')
  const [type, setType] = useState('')
  /*
   * 원본 근태조회의 조건 차례는 <b>기준일자 · 사원 · 부서 · … · 적요 · 근태일자</b> 다
   * (사본 실측). 부서와 적요가 없었는데 <b>둘 다 이미 목록에 실려 오고 있었다</b>.
   */
  const [dept, setDept] = useState('')
  const [reasonCond, setReasonCond] = useState('')
  /*
   * 원본 조건 차례의 <b>맨 뒤 [근태일자]</b>. [기준일자]는 신청한 날의 구간이고,
   * 이것은 <b>그날 근태가 걸쳐 있는가</b>를 묻는다 — 3일짜리 휴가는 가운데 날로도 걸려야 한다.
   * 목록에 근태일자가 찍히는데 그 날짜로 좁힐 수가 없었다.
   */
  const [dayCond, setDayCond] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows((await api.get<Row[]>('/hr/vacations')).data)
      setChecked(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

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
    if (emp && !r.empName.includes(emp)) return false
    if (type && !r.type.includes(type)) return false
    if (dept && !(r.department ?? '').includes(dept)) return false
    if (reasonCond && !(r.reason ?? '').includes(reasonCond)) return false
    if (dayCond && !(r.startDate <= dayCond && dayCond <= r.endDate)) return false
    if (tab === '결재중' && r.status !== 'PENDING') return false
    if (tab === '확인' && r.status !== 'APPROVED') return false
    if (tab === '이력' && r.status !== 'REJECTED') return false
    return true
  }), [rows, emp, type, tab, dept, reasonCond, dayCond])

  const total = shown.reduce((n, r) => n + r.days, 0)

  async function changeStatus(r: Row, status: Status) {
    try {
      await api.put(`/hr/vacations/${r.id}/status`, { status })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function removeChecked() {
    if (checked.size === 0) return setError('지울 근태를 고르세요.')
    if (!confirm(`${checked.size}건을 삭제할까요?`)) return
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
      title="근태조회"
      searchable={false}
      onNew={() => navigate('/hr/leave-input')}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
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
        { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: removeChecked },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div className="ec-pills" style={{ marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="사원" pick>
          <input className="ec-input" placeholder="사원명 일부" value={emp}
                 onChange={(e) => setEmp(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        {/* 원본은 [사원] 바로 다음이 [부서]다. */}
        <EcCond label="부서">
          <input className="ec-input" placeholder="부서명 일부" value={dept}
                 onChange={(e) => setDept(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        {/* 원본 근태조회의 이름은 [근태코드]가 아니라 <b>[근태항목]</b> 이다(사본 실측). */}
        <EcCond label="근태항목" pick>
          <input className="ec-input" placeholder="연차·반차 등" value={type}
                 onChange={(e) => setType(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={reasonCond}
                 onChange={(e) => setReasonCond(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        {/* 원본 조건 차례의 맨 뒤 — 그날 근태가 걸쳐 있는 것만. */}
        <EcCond label="근태일자">
          <input type="date" className="ec-input" value={dayCond}
                 onChange={(e) => setDayCond(e.target.value)} style={{ width: 140 }} />
        </EcCond>
      </ul>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {shown.length}건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        근태수 합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{days(total)}</b>
      </div>

      <div className="overflow-x-auto">
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>근태번호</th>
              <th style={{ textAlign: 'center', width: 190 }}>근태일자</th>
              <th style={{ width: 110 }}>사원번호</th>
              <th style={{ width: 110 }}>사원명</th>
              <th style={{ width: 100 }}>근태코드</th>
              <th style={{ width: 100, textAlign: 'right' }}>근태수</th>
              {/*
                원본 근태조회의 [휴가명] 열 — 이 근태가 <b>어느 휴가 잔여</b>에서 빠지는가.
                우리 잔여 계산(휴가잔여일수현황)은 승인된 근태를 모두 그 해 연차에서 뺀다.
                그래서 값이 하나뿐이라 지금까지 안 보여 줬는데, 그러면 사람은 이 근태가
                잔여를 깎는지 아닌지를 화면에서 알 수 없다.
                반려·대기는 아직 안 깎으므로 빈 칸이다.
              */}
              <th style={{ textAlign: 'center', width: 120 }}>휴가명</th>
              <th style={{ textAlign: 'center' }}>적요</th>
              <th style={{ width: 80, textAlign: 'center' }}>진행상태</th>
              <th style={{ width: 100, textAlign: 'center' }}>결재</th>
              {/* 원본 근태조회의 마지막 열 [인쇄] — 그 한 건을 근태 전표로 찍는다. */}
              <th style={{ width: 60, textAlign: 'center' }}>인쇄</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                  {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                </td>
                <td style={{ fontFamily: 'monospace', color: r.empCode ? undefined : '#c9ced6' }}>{r.empCode ?? ''}</td>
                <td>{r.empName}</td>
                <td>{r.type}</td>
                <td style={{ textAlign: 'right' }}>{days(r.days)}</td>
                <td style={{ textAlign: 'center', color: r.status === 'APPROVED' ? undefined : '#c9ced6' }}>
                  {r.status === 'APPROVED' ? `연차(${r.startDate.slice(0, 4)}년)` : '-'}
                </td>
                <td style={{ textAlign: 'center' }}>{r.reason ?? ''}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: r.status === 'APPROVED' ? '#1c7c3c' : r.status === 'REJECTED' ? '#c60a2e' : '#c07a00' }}>
                  {r.statusName}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {r.status === 'PENDING' && (
                    <>
                      <button onClick={() => changeStatus(r, 'APPROVED')} style={{ color: '#1c7c3c', marginRight: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>확인</button>
                      <button onClick={() => changeStatus(r, 'REJECTED')} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>반려</button>
                    </>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => printOne(r)}
                          style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
