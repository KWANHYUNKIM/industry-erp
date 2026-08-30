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
  /*
   * 원본 조건은 <b>[사원명]과 [부서]가 따로</b>다. 우리는 한 칸으로 둘을 함께 훑어서
   * "김" 을 치면 <b>김씨 사원과 김포지점이 같이</b> 걸렸다 — 부서로만 좁힐 수가 없었다.
   */
  const [deptCond, setDeptCond] = useState('')
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
    .filter((r) => !keyword || r.empName.includes(keyword))
    .filter((r) => !deptCond || (r.department ?? '').includes(deptCond))
    .map((r) => {
      const cin = toMinutes(r.clockIn)
      return { ...r, lateMin: cin != null ? Math.max(0, cin - START_MIN) : 0 }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.lateMin - a.lateMin),
  [rows, keyword, deptCond])

  /*
   * 원본 조건 <b>[정렬/소계기준]</b> — 소계를 <b>무엇으로 묶을지</b> 고른다(사본 실측).
   * 우리는 사원으로 <b>박아 두어</b>, "어느 부서가 늦나" 를 볼 수가 없었다. 지각은 사람의
   * 일이기도 하지만 <b>교대·현장 사정</b>의 일이기도 해서 부서로 묶어야 보이는 것이 있다.
   * 기본값은 예전 그대로라 지금 보이던 요약은 안 바뀐다.
   */
  const SUBTOTALS = ['사원', '부서'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('사원')

  /** 고른 축으로 묶은 지각 횟수·총 지각시간 */
  const byEmp = useMemo(() => {
    const m = new Map<string, { label: string; sub: string; count: number; totalMin: number }>()
    for (const r of late) {
      /* 부서가 안 적힌 줄을 빈 이름으로 묶으면 누구 것인지 모르는 덩어리가 된다. */
      const key = subtotal === '부서' ? (r.department ?? '(미지정)') : r.empName
      const cur = m.get(key) ?? { label: key, sub: subtotal === '부서' ? '' : (r.department ?? ''), count: 0, totalMin: 0 }
      cur.count += 1; cur.totalMin += r.lateMin
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.totalMin - a.totalMin)
  }, [late, subtotal])

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
        {/* 원본 차례: 기간 · <b>사원명 · 부서</b> (사본 실측) */}
        <EcCond label="사원명">
          <input className="ec-input" placeholder="사원명 일부" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="부서">
          <input className="ec-input" placeholder="부서 일부" value={deptCond}
                 onChange={(e) => setDeptCond(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        {/* 원본 차례: 조건 판 <b>맨 끝</b>이다(사본 실측). */}
        <EcCond label="정렬/소계기준">
          <div className="ec-pills">
            {SUBTOTALS.map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                      onClick={() => setSubtotal(v)}>{v}</button>
            ))}
          </div>
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
            <div key={e.label} style={{ border: '1px solid #e2e6eb', borderRadius: 5, padding: '6px 12px', background: '#fbfcfe', minWidth: 120 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#3c4553' }}>{e.label}
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> {e.sub}</span></div>
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
