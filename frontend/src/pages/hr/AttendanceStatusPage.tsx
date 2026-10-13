import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'
import { subtotalBy } from '../../utils/subtotalBy'
import { useDeptGroups } from '../../utils/deptGroups'

/**
 * 관리 > 근태관리 > 근태현황 (= 이카운트 출/퇴근현황(ID), E070306)
 *
 * 원본은 조회 조건 패널이 화면의 본체다: 기간 · 사원명 · 부서 · 내/외근구분 · 모든날짜검색 ·
 * 기간 빠른선택(금일·전일·금주(~오늘)·전주·금월(~오늘)·전월·종료일) + [검색(F8)][다시 작성].
 *
 * 우리 화면은 조건이 하나도 없이 전체를 한 번 불러올 뿐이었다. 백엔드
 * `/hr/attendance/summary` 는 원래부터 from·to 를 받는데 화면이 안 보내고 있었다.
 *
 * '내/외근구분'은 넣지 않았다. 우리 외근(FieldWork)은 근태와 다른 엔티티라 이 집계에
 * 섞으려면 그 관계부터 정해야 한다 — 근거 없이 칸만 만들면 눌러도 아무 일이 없다.
 */
interface Row {
  empName: string
  department: string | null
  workDays: number
  normalDays: number
  lateDays: number
  earlyLeaveDays: number
  absentDays: number
  totalWorkHours: number
}

export default function AttendanceStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = new Date()
  const [from, setFrom] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(ymd(today))
  /** 켜면 기간을 안 보낸다 — 원본 [모든날짜검색]. */
  const [allDates, setAllDates] = useState(false)
  const [empName, setEmpName] = useState('')
  const [department, setDepartment] = useState('')
  /**
   * 원본 [부서계층그룹] — [부서]가 그 부서 하나라면 이쪽은 <b>그 부서와 그 아래 전부</b>다.
   * 예외에 '부서를 계층으로 묶지 않는다 — 평면이다' 라고 적혀 있었으나 사실이 아니었다.
   */
  const { groups: deptGroups, inGroup } = useDeptGroups()
  const [deptGroup, setDeptGroup] = useState('')
  /*
   * 원본 조건 <b>[정렬/소계기준]</b> — 소계를 무엇으로 묶을지 고른다(사본 실측).
   * 표는 사람마다 한 줄인데, 결근·지각이 <b>어느 부서에 몰려 있나</b>는 눈으로 더해야 했다.
   */
  const SUBTOTALS = ['사원', '부서'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('부서')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = allDates ? {} : { from, to }
      const res = await api.get<Row[]>('/hr/attendance/summary', { params })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function reset() {
    setFrom(ymd(new Date(today.getFullYear(), today.getMonth(), 1)))
    setTo(ymd(today))
    setAllDates(false); setEmpName(''); setDepartment(''); setDeptGroup('')
  }

  // 사원·부서 목록은 조회된 결과에서 뽑는다. 이 화면만 쓰자고 별도 요청을 늘리지 않는다.
  const empNames = useMemo(() => [...new Set(rows.map((r) => r.empName))].sort(), [rows])
  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort(), [rows])

  const shown = rows
    .filter((r) => !empName || r.empName === empName)
    .filter((r) => !department || r.department === department)
    .filter((r) => inGroup(r.department, deptGroup))

  const totals = shown.reduce((t, r) => ({
    workDays: t.workDays + r.workDays,
    lateDays: t.lateDays + r.lateDays,
    earlyLeaveDays: t.earlyLeaveDays + r.earlyLeaveDays,
    absentDays: t.absentDays + r.absentDays,
    totalWorkHours: t.totalWorkHours + r.totalWorkHours,
  }), { workDays: 0, lateDays: 0, earlyLeaveDays: 0, absentDays: 0, totalWorkHours: 0 })

  const subtotals = useMemo(
    () => subtotalBy(shown, (r) => (subtotal === '부서' ? r.department : r.empName), {
      workDays: (r) => r.workDays,
      lateDays: (r) => r.lateDays,
      earlyLeaveDays: (r) => r.earlyLeaveDays,
      absentDays: (r) => r.absentDays,
      totalWorkHours: (r) => r.totalWorkHours,
    }),
    [shown, subtotal])

  const th: React.CSSProperties = { background: 'var(--ec-bg-page)', fontWeight: 700, whiteSpace: 'nowrap', width: 110 }
  const num = (n: number) => n.toLocaleString('ko-KR')

  return (
    <EcListShell
      /* [근태현황]은 <b>다른 화면</b>(AttendanceKindStatusPage)의 이름이다 — 이 화면은 출/퇴근현황(ID)이다. */
      title="출/퇴근현황(ID)"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <table className="w-full text-left mb-[10px]">
        <tbody>
          <tr>
            <th style={th}>기간</th>
            <td colSpan={3}>
              <input type="date" className="ec-input" value={from} disabled={allDates}
                     onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
              <span className="my-0 mx-[6px] text-ec-label">~</span>
              <input type="date" className="ec-input" value={to} disabled={allDates}
                     onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
              <label className="ml-[12px] text-[12px]">
                <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} /> 모든날짜검색
              </label>
            </td>
          </tr>
          <tr>
            <th style={th}></th>
            <td colSpan={3} className="pt-0">
              <div className="flex gap-[3px] flex-wrap">
                <EcPeriodPicks
                  labels={INQUIRY_PICKS}
                  currentFrom={from}
                  onPick={(r) => { setAllDates(false); setFrom(r.from); setTo(r.to) }}
                />
              </div>
            </td>
          </tr>
          <tr>
            <th style={th}>사원명</th>
            <td>
              <CodePickerField label="사원명" hideLabel value={empName} onChange={setEmpName}
                               items={empNames.map((n) => ({ value: n, name: n }))} />
            </td>
            <th style={th}>부서</th>
            <td>
              <CodePickerField label="부서" hideLabel value={department} onChange={setDepartment}
                               items={departments.map((d) => ({ value: d, name: d }))} />
            </td>
          </tr>
          {/* 원본 차례: [부서] 바로 다음이다(사본 실측). */}
          <tr>
            <th style={th}>부서계층그룹</th>
            <td colSpan={3}>
              <CodePickerField label="부서계층그룹" hideLabel value={deptGroup} onChange={setDeptGroup}
                               items={deptGroups.map((d) => ({ value: d, name: d }))} />
            </td>
          </tr>
          {/* 원본 차례: 조건 판 <b>맨 끝</b>이다(사본 실측). */}
          <tr>
            <th style={th}>정렬/소계기준</th>
            <td colSpan={3}>
              <div className="ec-pills">
                {SUBTOTALS.map((v) => (
                  <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                          onClick={() => setSubtotal(v)}>{v}</button>
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full text-left">
        <colgroup>
          <col className="w-[4%]" /><col /><col className="w-[16%]" />
          <col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[9%]" />
          <col className="w-[9%]" /><col className="w-[13%]" />
        </colgroup>
        <thead>
          <tr>
            <th></th><th>사원명</th><th>부서</th>
            <th className="text-right">근무일수</th><th className="text-right">지각</th><th className="text-right">조퇴</th><th className="text-right">결근</th><th className="text-right">총근무시간</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="text-center text-ec-ink">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={`${r.empName}-${i}`}>
              <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>
              <td>{r.empName}</td>
              <td>{r.department ?? ''}</td>
              <td className="text-right">{num(r.workDays)}</td>
              <td style={{ textAlign: 'right', color: r.lateDays ? 'var(--ec-danger)' : undefined }}>{num(r.lateDays)}</td>
              <td style={{ textAlign: 'right', color: r.earlyLeaveDays ? 'var(--ec-warn)' : undefined }}>{num(r.earlyLeaveDays)}</td>
              <td style={{ textAlign: 'right', color: r.absentDays ? 'var(--ec-danger)' : undefined }}>{num(r.absentDays)}</td>
              <td className="text-right">{r.totalWorkHours.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right font-bold bg-ec-page">합계</td>
              <td className="text-right font-bold bg-ec-page">{num(totals.workDays)}</td>
              <td className="text-right font-bold bg-ec-page">{num(totals.lateDays)}</td>
              <td className="text-right font-bold bg-ec-page">{num(totals.earlyLeaveDays)}</td>
              <td className="text-right font-bold bg-ec-page">{num(totals.absentDays)}</td>
              <td className="text-right font-bold bg-ec-page">
                {totals.totalWorkHours.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {shown.length > 0 && (
        <>
          <h3 className="text-[13px] font-bold mt-[16px] mx-0 mb-[6px]">{subtotal} 소계</h3>
          <table className="w-full text-left">
            <thead><tr>
              <th>{subtotal}</th>
              <th className="w-[80px] text-right">사원수</th>
              <th className="w-[90px] text-right">근무일수</th>
              <th className="w-[70px] text-right">지각</th>
              <th className="w-[70px] text-right">조퇴</th>
              <th className="w-[70px] text-right">결근</th>
              <th className="w-[110px] text-right">총근무시간</th>
            </tr></thead>
            <tbody>
              {subtotals.map((g) => (
                <tr key={g.label}>
                  <td className="font-semibold">{g.label}</td>
                  <td className="text-right">{num(g.count)}</td>
                  <td className="text-right">{num(g.sums.workDays)}</td>
                  <td style={{ textAlign: 'right', color: g.sums.lateDays ? 'var(--ec-danger)' : undefined }}>{num(g.sums.lateDays)}</td>
                  <td style={{ textAlign: 'right', color: g.sums.earlyLeaveDays ? 'var(--ec-warn)' : undefined }}>{num(g.sums.earlyLeaveDays)}</td>
                  <td style={{ textAlign: 'right', color: g.sums.absentDays ? 'var(--ec-danger)' : undefined }}>{num(g.sums.absentDays)}</td>
                  <td className="text-right">
                    {g.sums.totalWorkHours.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
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
