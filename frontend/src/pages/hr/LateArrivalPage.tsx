import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

/**
 * 관리 > 지각현황 (이카운트 E070307 지각현황(ID))
 * 근태 기록 중 '지각' 건을 건별로 펼치고, 정상 출근기준(09:00) 대비 지각시간(분)을 계산한다.
 * 사원별 지각 횟수·총 지각시간도 집계. 근태현황(AttendanceStatusPage)이 사원별 지각 '일수' 카운트만
 * 보여주는 데 반해, 이 화면은 어느 날 몇 분 지각했는지 건별 상세를 제공한다.
 * 백엔드 무변경 — `/api/hr/attendance` 가 이미 서버에서 계산한 status('지각')·출근시각을 반환한다.
 * (지각 판정 기준 09:00 은 HrDtos.WORK_START — 서버 단일 소스와 일치.)
 */
interface AttendanceRow {
  id: number
  date: string
  empName: string
  department: string | null
  clockIn: string | null
  clockOut: string | null
  workHours: number
  status: string
  note: string | null
}

const WORK_START = '09:00'
const mono = { fontFamily: 'monospace' as const }

/** "HH:mm" → 분(자정 기준). 파싱 실패 시 null. */
function toMinutes(t: string | null): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
const START_MIN = toMinutes(WORK_START)!

export default function LateArrivalPage() {
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      const res = await api.get<AttendanceRow[]>('/hr/attendance', { params })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  /** 지각 건별(지각시간 분 포함), 최근일자 → 지각시간 큰 순 */
  const late = useMemo(() => rows
    .filter((r) => r.status === '지각')
    .filter((r) => !keyword || r.empName.includes(keyword) || (r.department ?? '').includes(keyword))
    .map((r) => {
      const cin = toMinutes(r.clockIn)
      return { ...r, lateMin: cin != null ? Math.max(0, cin - START_MIN) : 0 }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.lateMin - a.lateMin),
  [rows, keyword])

  /** 사원별 지각 횟수·총 지각시간 */
  const byEmp = useMemo(() => {
    const m = new Map<string, { empName: string; department: string | null; count: number; totalMin: number }>()
    for (const r of late) {
      const cur = m.get(r.empName) ?? { empName: r.empName, department: r.department, count: 0, totalMin: 0 }
      cur.count += 1; cur.totalMin += r.lateMin
      m.set(r.empName, cur)
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.totalMin - a.totalMin)
  }, [late])

  const totalMin = useMemo(() => late.reduce((s, r) => s + r.lateMin, 0), [late])
  const reset = () => { setFrom(''); setTo(''); setKeyword('') }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(late, {
    일자: (r) => r.date,
  })

  return (
    <EcListShell
      title="지각현황(ID)"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS}
        dateLabel="기간"
      >
        <EcCond label="사원" pick>
          <input className="ec-input" placeholder="사원명 일부" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} style={{ width: 260 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#9aa1ab' }}>출근기준 {WORK_START} 이후 = 지각</span>
        <span style={{ marginLeft: 'auto' }}>
          지각 <b style={{ color: '#c60a2e', fontSize: 14 }}>{late.length}</b>건
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          총 지각시간 <b style={{ color: '#c07a00', fontSize: 14 }}>{totalMin.toLocaleString()}</b>분
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 사원별 지각 요약 */}
      {byEmp.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {byEmp.slice(0, 8).map((e) => (
            <div key={e.empName} style={{ border: '1px solid #e2e6eb', borderRadius: 5, padding: '6px 12px', background: '#fbfcfe', minWidth: 120 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#3c4553' }}>{e.empName}
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> {e.department ?? ''}</span></div>
              <div style={{ fontSize: 11.5, color: '#8a929c', marginTop: 2 }}>
                <b style={{ color: '#c60a2e', fontSize: 13 }}>{e.count}</b>회 · {e.totalMin.toLocaleString()}분
              </div>
            </div>
          ))}
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('일자')}>일자 {sort.mark('일자')}</th><th>사원명</th><th>부서</th>
            <th style={{ textAlign: 'center' }}>출근시각</th>
            <th style={{ textAlign: 'right' }}>지각시간</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : late.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={mono}>{dateText(r.date)}</td>
              <td>{r.empName}</td>
              <td>{r.department ?? ''}</td>
              <td style={{ ...mono, textAlign: 'center', color: '#c07a00', fontWeight: 600 }}>{r.clockIn ?? ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#c60a2e' }}>{r.lateMin.toLocaleString()}분</td>
              <td>{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
