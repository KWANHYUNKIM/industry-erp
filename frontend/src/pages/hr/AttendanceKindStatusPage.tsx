import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { formatDays } from '../../utils/dayCount'
import { useDeptGroups } from '../../utils/deptGroups'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 관리 > 근태관리 > 근태현황 — 연차·반차 같은 <b>근태 기록</b>을 기간·조건으로 본다.
 *
 * <p>원본 사본 실측. 근태현황 격자는 이렇다:
 *   근태일자 | 부서명 | 직급 | 사원번호 | 사원명 | 근태종류 | 근태 | 적요  (+ 합계)
 * 실제 줄도 "부설연구소 | 차장 | 최미란 | 연차 | 개인사정" 처럼 <b>근태 항목</b>이다.
 * 원본 근태입력도 "근태일자 · 사원 · 근태 · 휴가 · 근태(일/시간) · 적요" 로 같은 것을 넣는다.
 *
 * <p>우리 '근태현황' 은 <b>출퇴근 집계</b>(근무일수·지각·조퇴·결근·총근무시간)를 보여 주고 있었다.
 * 그건 원본의 <b>출/퇴근현황(ID)</b> 에 해당하는 화면이고, 우리 메뉴에도 그 이름으로
 * 같은 경로가 이미 걸려 있다. 그래서 근태현황만 이 화면으로 옮긴다.
 *
 * <p>[전표일자]·[직급]·[사원번호]는 예전에 칸을 못 만들었다 — 근태가 매달린 것은 User 인데
 * 거기에 직급도 사원번호도 없고 사원 마스터와 이어 주는 연결도 없었기 때문이다.
 * 이제 계정에 사원(Employee)을 이을 수 있어 그 세 칸을 채운다(사용자관리에서 잇는다).
 *
 * <p><b>2026-09-09 원본(E020715) 실측 — 조건은 스물하나다</b>(사본은 열하나였다):
 * 구분 · 기준일자 · 사원 · 부서 · 부서계층그룹 · 프로젝트 · 프로젝트그룹1 · 프로젝트그룹2 ·
 * 근태항목 · 휴가항목 · 근태그룹 · 적요 · 상태 · 재직구분 · 양식 · 정렬/소계기준 ·
 * 근태일자 · 최초작성자 · 최종수정자 · 적용양식 · 양식구분.
 * 사본이 빠뜨린 것 가운데 <b>[부서계층그룹]과 [근태일자]</b>는 그 자리에서 만들었고,
 * <b>[기준일자]와 [근태일자]가 서로 다른 것</b>이라는 것도 여기서 드러났다.
 *
 * <p>안 이은 계정은 직급·사원번호가 빈칸이다. 지어내지 않는다. 부서명도 이어져 있으면
 * <b>부서 마스터</b>의 이름을 쓴다 — 계정의 자유입력 부서는 부서 마스터와 맞는다는
 * 보장이 없어 같은 부서가 두 이름으로 갈릴 수 있다.
 */
interface Vacation {
  id: number
  /** 전표일자 — 이 근태를 올린 날. 근태일자와 다르다(미리 올릴 수 있다). */
  docDate: string
  empName: string
  /** 사원번호·직급. 계정이 사원과 안 이어져 있으면 null. */
  empCode: string | null
  jobTitle: string | null
  department: string | null
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string | null
  /**
   * 사원이 재직 중인가. <b>응답에 이미 오고 있었는데</b> 이 화면이 받아 두지 않았다 —
   * 원본 근태현황의 [재직구분] 조건이 이 값을 본다(휴가 두 화면은 이미 쓰고 있다).
   */
  active: boolean
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  statusName: string
}

/** 원본 [재직구분]. 휴가잔여일수현황·휴가사용실적현황과 같은 값이라 이름도 같게 둔다. */
const EMPLOYMENTS = [['ACTIVE', '재직자'], ['RESIGNED', '퇴사자'], ['ALL', '전체']] as const

/**
 * 원본 조건 <b>[정렬/소계기준]</b>. 축은 [설정] 창에서 고르는데 그 창은 <b>값을 저장</b>하므로
 * 열지 않았다(조회 화면만 연다는 규칙). 그래서 <b>줄이 실제로 들고 있는 값</b>으로만 축을 둔다 —
 * 지어내지 않는다. 이 화면에서 "누가 얼마나 썼나" 를 되짚는 축이 이 셋이다.
 */
const SUBTOTALS = ['없음', '부서', '근태항목', '사원'] as const

/** 원본 [근태] 열은 일수다 — 소수 셋째 자리까지 채워 찍는다(사본 값 1.250). */
const days = formatDays

export default function AttendanceKindStatusPage() {
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다 —
   * 결재를 안 받을 자료까지 도장칸을 달고 나가면 종이가 한 칸씩 밀린다.
   */
  const [signBox, setSignBox] = useState(false)
  const [rows, setRows] = useState<Vacation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [dept, setDept] = useState('')
  /*
   * 원본 조건 <b>[부서계층그룹]</b> — [부서] 바로 다음이다(2026-09-09 실측).
   * [부서]는 그 부서 하나로 좁히고 이쪽은 <b>그 부서와 그 아래 전부</b>를 본다.
   * 근태조회가 앞 바퀴에 만들어 둔 훅을 그대로 쓴다.
   */
  const [deptGroup, setDeptGroup] = useState('')
  const { groups: deptGroups, inGroup } = useDeptGroups()
  /*
   * 원본 조건 <b>[근태일자]</b>. 위 기간([기준일자])과 <b>다른 것</b>이다 —
   * [기준일자]는 그 근태를 <b>올린 날</b>(전표일자)이고, 이쪽은 <b>휴가가 걸쳐 있는 날</b>이다.
   * 우리는 그 둘을 한 칸으로 뭉뚱그려 기간을 근태일자에 걸면서 이름만 [근태일자]라 달아,
   * <b>전표일자로는 좁힐 길이 아예 없었다</b>(표에는 열로 찍히는데도).
   */
  const [dayCond, setDayCond] = useState('')
  const [emp, setEmp] = useState('')
  const [kind, setKind] = useState('')
  const [employment, setEmployment] = useState<'ACTIVE' | 'RESIGNED' | 'ALL'>('ACTIVE')
  const [reason, setReason] = useState('')
  /**
   * 원본 [상태]는 알약이 아니라 <b>체크박스 넷</b>이다 — 전체 · 결재중 · UserPay · 확인.
   * 켜져 있는 것은 <b>[확인] 하나뿐</b>이다(2026-09-09 실측). 우리는 [전체]로 열고 있었다 —
   * 아직 결재가 안 끝난 근태까지 섞여 합계에 들어가므로, 그 숫자를 그대로 적으면
   * <b>확정되지 않은 휴가가 쓴 것으로 세어진다.</b>
   * [UserPay]는 이카운트의 유료 결제 연동이라 우리에게 대응하는 것이 없다.
   */
  const [stAll, setStAll] = useState(false)
  const [stPending, setStPending] = useState(false)
  const [stConfirmed, setStConfirmed] = useState(true)
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('없음')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Vacation[]>('/hr/vacations')
      setRows([...res.data].sort((a, b) =>
        (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setDept(''); setEmp(''); setKind(''); setReason('')
    setDeptGroup(''); setDayCond('')
    setStAll(false); setStPending(false); setStConfirmed(true); setSubtotal('없음')
  }

  /** 원본 [기준일자] — 그 근태를 <b>올린 날</b>(전표일자)이 구간에 드나. */
  const shown = useMemo(() => rows.filter((r) => {
    if (r.docDate < from || r.docDate > to) return false
    /* 원본 [근태일자] — 그날 근태가 <b>걸쳐 있나</b>. 사흘짜리 휴가는 가운데 날로도 걸려야 한다. */
    if (dayCond && (r.startDate > dayCond || r.endDate < dayCond)) return false
    if (dept && !(r.department ?? '').includes(dept)) return false
    if (!inGroup(r.department, deptGroup)) return false
    if (emp && !r.empName.includes(emp)) return false
    if (kind && !r.type.includes(kind)) return false
    if (reason && !(r.reason ?? '').includes(reason)) return false
    /* [전체]를 켜면 상태를 안 가린다. 아니면 켜 둔 것에 걸리는 줄만 남긴다. */
    if (!stAll) {
      const hit = (stPending && r.status === 'PENDING') || (stConfirmed && r.status === 'APPROVED')
      if (!hit) return false
    }
    // 원본 [재직구분] — 기본은 재직자다. 퇴사자 근태는 정산할 때 따로 본다.
    if (employment === 'ACTIVE' && !r.active) return false
    if (employment === 'RESIGNED' && r.active) return false
    return true
  }), [rows, from, to, dept, deptGroup, inGroup, dayCond, emp, kind, reason,
    stAll, stPending, stConfirmed, employment])

  const totalDays = shown.reduce((n, r) => n + r.days, 0)

  /** 근태종류별 소계 — 원본 합계줄이 하는 일을 조금 더 쓸모 있게. */
  const byKind = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of shown) m.set(r.type, (m.get(r.type) ?? 0) + r.days)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [shown])

  return (
    <EcListShell
      title="근태현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        dateLabel="기준일자"
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
      >
        {/*
          원본 근태현황의 조건 이름과 차례는 <b>사원 · 부서</b> 다(사본 실측).
          우리는 [부서명]·[사원명] 으로 이름도 다르고 앞뒤도 뒤집혀 있었다.
        */}
        <EcCond label="사원" pick>
          <input className="ec-input" placeholder="사원명 일부" value={emp}
                 onChange={(e) => setEmp(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="부서" pick>
          <input className="ec-input" placeholder="부서명 일부" value={dept}
                 onChange={(e) => setDept(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="부서계층그룹">
          <select className="ec-input" value={deptGroup} style={{ width: 160 }}
                  onChange={(e) => setDeptGroup(e.target.value)}>
            <option value="">전체</option>
            {deptGroups.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </EcCond>
        {/*
          원본 근태현황의 이름은 [근태종류]가 아니라 <b>[근태항목]</b> 이다(사본 실측).
          근태조회는 진작 그 이름인데 이 화면만 달랐다 — 같은 값을 두 이름으로 부르고 있었다.

          후보는 <b>실제로 올라온 근태</b>에서 뽑는다. 근태항목 마스터가 없어 고를 목록을
          지어낼 수 없고, 지어내면 골라도 아무것도 안 나오는 보기가 생긴다.
        */}
        <EcCond label="근태항목" pick>
          <CodePickerField label="근태항목" hideLabel width={180} emptyLabel="전체"
                           value={kind} onChange={setKind}
                           items={[...new Set(rows.map((r) => r.type))].filter(Boolean).sort()
                             .map((t) => ({ value: t, name: t }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={reason}
                 onChange={(e) => setReason(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        {/*
          원본 [상태]는 체크박스 넷이다 — 전체 · 결재중 · UserPay · 확인. [확인]만 켜져 있다.
          <b>배열로 돌려 그리지 않는다</b> — 이름이 글자로 안 남으면 조건 검사가 못 본다.
        */}
        <EcCond label="상태">
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={stAll}
                   onChange={(e) => setStAll(e.target.checked)} /> 전체
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={stPending}
                   onChange={(e) => setStPending(e.target.checked)} /> 결재중
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={stConfirmed}
                   onChange={(e) => setStConfirmed(e.target.checked)} /> 확인
          </label>
        </EcCond>
        {/* 원본 [재직구분] — 전체·재직자·퇴사자. 기본은 [재직자]로 뜬다(사본 실측). */}
        <EcCond label="재직구분">
          <div className="ec-pills">
            {EMPLOYMENTS.map(([v, label]) => (
              <button key={v} type="button" className={`ec-pill no-ec${employment === v ? ' active' : ''}`}
                      onClick={() => setEmployment(v)}>{label}</button>
            ))}
          </div>
        </EcCond>
        {/*
          원본 차례: <b>[재직구분] 다음이 [양식]·[정렬/소계기준]·[근태일자]</b> 다
          (2026-09-09 실측). 근태조회는 [근태일자]가 <b>맨 앞 [기준일자] 바로 뒤</b>인데
          이 화면은 뒤쪽이다 — 두 화면이 서로 다르다.
        */}
        <EcCond label="근태일자">
          <input type="date" className="ec-input" value={dayCond}
                 onChange={(e) => setDayCond(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="결재방표시">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        근태 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{days(totalDays)}</b>일
        {byKind.length > 0 && (
          <span style={{ marginLeft: 10, color: '#8a929c' }}>
            {byKind.map(([k, v]) => `${k} ${days(v)}일`).join(' · ')}
          </span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/* 원본 실측: 왼쪽. */}
            <th style={{ width: 110 }}>전표일자</th>
            <th style={{ textAlign: 'center', width: 190 }}>근태일자</th>
            <th style={{ width: 150 }}>부서명</th>
            <th style={{ width: 90 }}>직급</th>
            <th style={{ width: 110 }}>사원번호</th>
            <th style={{ width: 120 }}>사원명</th>
            <th style={{ width: 120 }}>근태종류</th>
            {/* 원본은 이 표에서 [근태]를 가장 넓게 둔다(180 · 나머지 100~120) — 읽으라는 값이다. */}
            <th style={{ width: 180, textAlign: 'right' }}>근태</th>
            <th>적요</th>
            <th style={{ width: 90, textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              {/* 원본은 [전표일자]를 눌러 그 근태 전표를 연다. 우리는 근태조회로 넘긴다. */}
              <td style={{ fontFamily: 'monospace' }}>
                <Link to={`/hr/leave-list?emp=${encodeURIComponent(r.empName)}`}
                      style={{ color: 'var(--ec-blue)' }}>{r.docDate}</Link>
              </td>
              <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                {r.startDate}{r.endDate !== r.startDate ? ` ~ ${r.endDate}` : ''}
              </td>
              <td>{r.department ?? ''}</td>
              <td style={{ color: r.jobTitle ? undefined : '#c9ced6' }}>{r.jobTitle ?? ''}</td>
              <td style={{ fontFamily: 'monospace', color: r.empCode ? undefined : '#c9ced6' }}>{r.empCode ?? ''}</td>
              <td>{r.empName}</td>
              <td>{r.type}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{days(r.days)}</td>
              <td style={{ color: r.reason ? undefined : '#c9ced6' }}>{r.reason ?? ''}</td>
              <td style={{
                textAlign: 'center', fontWeight: 700,
                color: r.status === 'APPROVED' ? '#1c7c3c' : r.status === 'PENDING' ? '#c07a00' : '#c60a2e',
              }}>{r.statusName}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
            <td colSpan={8} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{days(totalDays)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>

      {subtotal !== '없음' && shown.length > 0 && (() => {
        const keyOf = (r: Vacation) =>
          (subtotal === '부서' ? r.department : subtotal === '근태항목' ? r.type : r.empName) || ''
        const groups = subtotalBy(shown, keyOf, { days: (r) => r.days })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>건수</th>
                <th style={{ width: 130, textAlign: 'right' }}>근태</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
                      {days(g.sums.days)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
