import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'

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
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  statusName: string
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function AttendanceKindStatusPage() {
  const [rows, setRows] = useState<Vacation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [dept, setDept] = useState('')
  const [emp, setEmp] = useState('')
  const [kind, setKind] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState('전체')

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
    setDept(''); setEmp(''); setKind(''); setReason(''); setStatus('전체')
  }

  /** 근태일자가 구간에 <b>걸치기만 해도</b> 본다 — 연차가 월말·월초에 걸치면 잘리면 안 된다. */
  const shown = useMemo(() => rows.filter((r) => {
    if (r.endDate < from || r.startDate > to) return false
    if (dept && !(r.department ?? '').includes(dept)) return false
    if (emp && !r.empName.includes(emp)) return false
    if (kind && !r.type.includes(kind)) return false
    if (reason && !(r.reason ?? '').includes(reason)) return false
    if (status !== '전체' && r.status !== (status === '결재중' ? 'PENDING' : 'APPROVED')) return false
    return true
  }), [rows, from, to, dept, emp, kind, reason, status])

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
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        dateLabel="근태일자"
      >
        <EcCond label="부서명" pick>
          <input className="ec-input" placeholder="부서명 일부" value={dept}
                 onChange={(e) => setDept(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="사원명" pick>
          <input className="ec-input" placeholder="사원명 일부" value={emp}
                 onChange={(e) => setEmp(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="근태종류" pick>
          <input className="ec-input" placeholder="연차·반차·병가 …" value={kind}
                 onChange={(e) => setKind(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={reason}
                 onChange={(e) => setReason(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="상태">
          <div className="ec-pills">
            {['전체', '결재중', '확인'].map((s) => (
              <button key={s} type="button" className={`ec-pill no-ec${status === s ? ' active' : ''}`}
                      onClick={() => setStatus(s)}>{s}</button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        근태 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(totalDays)}</b>일
        {byKind.length > 0 && (
          <span style={{ marginLeft: 10, color: '#8a929c' }}>
            {byKind.map(([k, v]) => `${k} ${num(v)}일`).join(' · ')}
          </span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 110 }}>전표일자</th>
            <th style={{ textAlign: 'center', width: 190 }}>근태일자</th>
            <th style={{ width: 150 }}>부서명</th>
            <th style={{ width: 90 }}>직급</th>
            <th style={{ width: 110 }}>사원번호</th>
            <th style={{ width: 120 }}>사원명</th>
            <th style={{ width: 120 }}>근태종류</th>
            <th style={{ width: 100, textAlign: 'right' }}>근태</th>
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
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.docDate}</td>
              <td style={{ fontFamily: 'monospace' }}>
                {r.startDate}{r.endDate !== r.startDate ? ` ~ ${r.endDate}` : ''}
              </td>
              <td>{r.department ?? ''}</td>
              <td style={{ color: r.jobTitle ? undefined : '#c9ced6' }}>{r.jobTitle ?? '-'}</td>
              <td style={{ fontFamily: 'monospace', color: r.empCode ? undefined : '#c9ced6' }}>{r.empCode ?? '-'}</td>
              <td>{r.empName}</td>
              <td>{r.type}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(r.days)}</td>
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
            <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totalDays)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
