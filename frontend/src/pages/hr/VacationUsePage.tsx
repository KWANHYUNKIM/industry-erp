import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'

/** 관리 > 휴가사용실적현황 — 사원별 휴가 종류·기간·사용일수 실적 조회 (백엔드 /api/hr/vacations 연동) */
interface Row {
  id: number
  empName: string
  department: string | null
  type: string
  startDate: string
  endDate: string
  days: number
  reason: string | null
  /** PENDING / APPROVED / REJECTED */
  status: VacationStatus
  /** 대기 / 승인 / 반려 (표시용) */
  statusName: string
}

type VacationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

const mono = { fontFamily: 'monospace' as const }
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

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Row[]>('/hr/vacations')
      setRows(res.data)
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
   * 프로젝트·재직구분·사용중단휴가코드는 휴가 응답에 그 값이 없어 칸을 만들지 않는다.
   * 원본의 '확인'은 결재가 끝난 것이라 우리 APPROVED, '결재중'은 PENDING 이다.
   */
  const shown = rows.filter((r) => {
    if (emp && !r.empName.includes(emp)) return false
    if (dept && !(r.department ?? '').includes(dept)) return false
    if (vtype && !r.type.includes(vtype)) return false
    if (reason && !(r.reason ?? '').includes(reason)) return false
    if (status !== '전체' && r.status !== (status === '결재중' ? 'PENDING' : 'APPROVED')) return false
    return true
  })
  const totalDays = shown.reduce((n, r) => n + r.days, 0)

  return (
    <EcListShell
      title="휴가사용실적현황"
      searchable={false}
      onNew={undefined}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setEmp(''); setDept(''); setVtype(''); setReason(''); setStatus('전체') } },
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
            <th>사원명</th>
            <th>부서</th>
            <th>휴가종류</th>
            <th>시작일</th>
            <th>종료일</th>
            <th style={{ textAlign: 'right' }}>사용일수</th>
            <th>사유</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ width: 90, textAlign: 'center' }}>결재</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.empName}</td>
              <td>{r.department ?? ''}</td>
              <td style={{ textAlign: 'center' }}>{r.type}</td>
              <td style={mono}>{r.startDate}</td>
              <td style={mono}>{r.endDate}</td>
              <td style={{ textAlign: 'right' }}>{r.days.toLocaleString()}</td>
              <td>{r.reason ?? ''}</td>
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
