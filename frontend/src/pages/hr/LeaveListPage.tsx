import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'

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

const days = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

export default function LeaveListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('전체')
  const [emp, setEmp] = useState('')
  const [type, setType] = useState('')
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

  const shown = useMemo(() => rows.filter((r) => {
    if (emp && !r.empName.includes(emp)) return false
    if (type && !r.type.includes(type)) return false
    if (tab === '결재중' && r.status !== 'PENDING') return false
    if (tab === '확인' && r.status !== 'APPROVED') return false
    if (tab === '이력' && r.status !== 'REJECTED') return false
    return true
  }), [rows, emp, type, tab])

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
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: removeChecked },
        { label: '인쇄' },
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
        <EcCond label="근태코드" pick>
          <input className="ec-input" placeholder="연차·반차 등" value={type}
                 onChange={(e) => setType(e.target.value)} style={{ width: 160 }} />
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
              <th style={{ width: 190 }}>근태일자</th>
              <th style={{ width: 110 }}>사원번호</th>
              <th style={{ width: 110 }}>사원명</th>
              <th style={{ width: 100 }}>근태코드</th>
              <th style={{ width: 100, textAlign: 'right' }}>근태수</th>
              <th>적요</th>
              <th style={{ width: 80, textAlign: 'center' }}>진행상태</th>
              <th style={{ width: 100, textAlign: 'center' }}>결재</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
                <td style={{ fontFamily: 'monospace' }}>
                  {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                </td>
                <td style={{ fontFamily: 'monospace', color: r.empCode ? undefined : '#c9ced6' }}>{r.empCode ?? '-'}</td>
                <td>{r.empName}</td>
                <td>{r.type}</td>
                <td style={{ textAlign: 'right' }}>{days(r.days)}</td>
                <td>{r.reason ?? ''}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
