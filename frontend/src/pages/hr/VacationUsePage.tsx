import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { formatDays } from '../../utils/dayCount'

/** 관리 > 휴가사용실적현황 — 사원별 휴가 종류·기간·사용일수 실적 조회 (백엔드 /api/hr/vacations 연동) */
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
const EMPLOYMENTS = [['ACTIVE', '재직자'], ['RESIGNED', '퇴사자'], ['ALL', '전체']] as const

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
  if (s === 'APPROVED') return '#1c7c3c'
  if (s === 'REJECTED') return '#c60a2e'
  return '#c07a00'
}

export default function VacationUsePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emp, setEmp] = useState('')
  const [dept, setDept] = useState('')
  const [vtype, setVtype] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState('전체')
  const [employment, setEmployment] = useState<'ACTIVE' | 'RESIGNED' | 'ALL'>('ACTIVE')
  const [grants, setGrants] = useState<Map<string, number>>(new Map())

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
    if (emp && !r.empName.includes(emp)) return false
    if (dept && !(r.department ?? '').includes(dept)) return false
    if (vtype && !r.type.includes(vtype)) return false
    if (reason && !(r.reason ?? '').includes(reason)) return false
    if (status !== '전체' && r.status !== (status === '결재중' ? 'PENDING' : 'APPROVED')) return false
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
   */
  const withRemain = (() => {
    const byEmp = new Map<string, Row[]>()
    for (const r of shown) {
      if (!byEmp.has(r.empName)) byEmp.set(r.empName, [])
      byEmp.get(r.empName)!.push(r)
    }
    const out: { row: Row; grant: number | null; remain: number | null; first: boolean }[] = []
    for (const [name, list] of [...byEmp.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      list.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id)
      const grant = grants.get(name)
      let remain = grant ?? null
      list.forEach((row, idx) => {
        if (remain != null && row.status === 'APPROVED') remain = Math.round((remain - row.days) * 1000) / 1000
        out.push({ row, grant: idx === 0 ? (grant ?? null) : null, remain, first: idx === 0 })
      })
    }
    return out
  })()

  return (
    <EcListShell
      title="휴가사용실적현황"
      searchable={false}
      onNew={undefined}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setEmp(''); setDept(''); setVtype(''); setReason(''); setStatus('전체'); setEmployment('ACTIVE') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="휴가코드" pick>
          <input className="ec-input" placeholder="휴가종류 일부" value={vtype}
                 onChange={(e) => setVtype(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="사원" pick>
          <input className="ec-input" placeholder="사원명 일부" value={emp}
                 onChange={(e) => setEmp(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="부서" pick>
          <input className="ec-input" placeholder="부서명 일부" value={dept}
                 onChange={(e) => setDept(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="사유 일부" value={reason}
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
        <EcCond label="재직구분">
          <div className="ec-pills">
            {EMPLOYMENTS.map(([v, label]) => (
              <button key={v} type="button" className={`ec-pill no-ec${employment === v ? ' active' : ''}`}
                      onClick={() => setEmployment(v)}>{label}</button>
            ))}
          </div>
        </EcCond>
      </ul>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        휴가 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        사용일수 합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{totalDays.toLocaleString('ko-KR')}</b>일
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/* 원본 휴가사용실적현황의 첫 열 [전표번호]. 어느 근태 전표에서 나온 줄인지가 없었다. */}
            <th style={{ width: 150 }}>전표번호</th>
            <th>사원명</th>
            <th>부서</th>
            <th>휴가종류</th>
            <th>시작일</th>
            <th>종료일</th>
            <th>적요</th>
            <th style={{ textAlign: 'right' }}>휴가일수</th>
            <th style={{ textAlign: 'right' }}>휴가사용일수</th>
            <th style={{ textAlign: 'right' }}>휴가잔여일수</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ width: 90, textAlign: 'center' }}>결재</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : withRemain.map(({ row: r, grant, remain, first }, i) => (
            <tr key={r.id} style={first && i > 0 ? { borderTop: '2px solid #d7dce3' } : undefined}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={mono}>{r.docNo}</td>
              <td>{first ? r.empName : ''}</td>
              <td>{first ? (r.department ?? '') : ''}</td>
              <td style={{ textAlign: 'center' }}>{r.type}</td>
              <td style={mono}>{r.startDate}</td>
              <td style={mono}>{r.endDate}</td>
              <td>{r.reason ?? ''}</td>
              <td style={{ textAlign: 'right', color: '#5a626e' }}>{grant != null ? days(grant) : ''}</td>
              <td style={{ textAlign: 'right' }}>{days(r.days)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: remain != null && remain < 0 ? '#c60a2e' : undefined }}>
                {remain != null ? days(remain) : ''}
              </td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: statusColor(r.status) }}>{r.statusName}</td>
              <td style={{ textAlign: 'center' }}>
                {r.status === 'PENDING' ? (
                  <>
                    <button onClick={() => changeStatus(r, 'APPROVED')} style={{ color: '#1c7c3c', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>승인</button>
                    <button onClick={() => changeStatus(r, 'REJECTED')} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>반려</button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
