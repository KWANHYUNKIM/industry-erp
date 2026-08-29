import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'

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
    setAllDates(false); setEmpName(''); setDepartment('')
  }

  // 사원·부서 목록은 조회된 결과에서 뽑는다. 이 화면만 쓰자고 별도 요청을 늘리지 않는다.
  const empNames = useMemo(() => [...new Set(rows.map((r) => r.empName))].sort(), [rows])
  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort(), [rows])

  const shown = rows
    .filter((r) => !empName || r.empName === empName)
    .filter((r) => !department || r.department === department)

  const totals = shown.reduce((t, r) => ({
    workDays: t.workDays + r.workDays,
    lateDays: t.lateDays + r.lateDays,
    earlyLeaveDays: t.earlyLeaveDays + r.earlyLeaveDays,
    absentDays: t.absentDays + r.absentDays,
    totalWorkHours: t.totalWorkHours + r.totalWorkHours,
  }), { workDays: 0, lateDays: 0, earlyLeaveDays: 0, absentDays: 0, totalWorkHours: 0 })

  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 110 }
  const num = (n: number) => n.toLocaleString('ko-KR')

  return (
    <EcListShell
      title="근태현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <table className="w-full text-left" style={{ marginBottom: 10 }}>
        <tbody>
          <tr>
            <th style={th}>기간</th>
            <td colSpan={3}>
              <input type="date" className="ec-input" value={from} disabled={allDates}
                     onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
              <input type="date" className="ec-input" value={to} disabled={allDates}
                     onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
              <label style={{ marginLeft: 12, fontSize: 12 }}>
                <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} /> 모든날짜검색
              </label>
            </td>
          </tr>
          <tr>
            <th style={th}></th>
            <td colSpan={3} style={{ paddingTop: 0 }}>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
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
        </tbody>
      </table>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <colgroup>
          <col style={{ width: '4%' }} /><col /><col style={{ width: '16%' }} />
          <col style={{ width: '10%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} /><col style={{ width: '13%' }} />
        </colgroup>
        <thead>
          <tr>
            <th></th><th>사원명</th><th>부서</th>
            <th style={{ textAlign: 'right' }}>근무일수</th><th style={{ textAlign: 'right' }}>지각</th><th style={{ textAlign: 'right' }}>조퇴</th><th style={{ textAlign: 'right' }}>결근</th><th style={{ textAlign: 'right' }}>총근무시간</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={`${r.empName}-${i}`}>
              <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
              <td>{r.empName}</td>
              <td>{r.department ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{num(r.workDays)}</td>
              <td style={{ textAlign: 'right', color: r.lateDays ? '#c60a2e' : undefined }}>{num(r.lateDays)}</td>
              <td style={{ textAlign: 'right', color: r.earlyLeaveDays ? '#c07a00' : undefined }}>{num(r.earlyLeaveDays)}</td>
              <td style={{ textAlign: 'right', color: r.absentDays ? '#c60a2e' : undefined }}>{num(r.absentDays)}</td>
              <td style={{ textAlign: 'right' }}>{r.totalWorkHours.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.workDays)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.lateDays)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.earlyLeaveDays)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.absentDays)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
                {totals.totalWorkHours.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
