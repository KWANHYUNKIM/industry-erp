import { useCallback, useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../api/client'
import EcListShell from '../components/EcListShell'
import { ecAlert, ecConfirm } from '../components/EcDialog'
import Modal from '../components/Modal'
import { EcDateRange } from '../components/ui/EcDateInput'
import { dateText } from '../utils/dateText'
import { ymd } from '../utils/periods'
import { ACTIONS } from '../features/auth/workPermissions'

type Status = 'PENDING' | 'APPROVED' | 'REJECTED'
type Kind = 'USER' | 'GROUP'

interface PermissionRequest {
  id: number
  requestedAt: string
  requesterId: number
  requesterUsername: string
  requesterName: string
  workCode: string
  workName: string
  menuPath: string | null
  menuName: string | null
  reason: string | null
  status: Status
  processedByName: string | null
  processedByUsername: string | null
  processedAt: string | null
  approveKind: Kind | null
  groupId: number | null
  groupName: string | null
}

const STATUS_LABEL: Record<Status, string> = { PENDING: '대기', APPROVED: '승인', REJECTED: '반려' }
const dt = (v: string | null) => (v ? `${dateText(v.slice(0, 10))} ${v.slice(11, 19)}` : '')

/**
 * Self-Customizing › 사용자관리 › 권한승인대기현황 — 원본 영상 1514 · 1998 · 2000.
 * 머리 빠른 검색 · Search(F3)(조건은 접혀서 시작) — 조회조건 기준일자 · 사용자 ID · 승인여부.
 * 열(원본): 구분 · 요청일자 · 아이디 · 성명 · 요청메뉴 · 요청행위 · 사유 · 승인여부 · 승인ID · 승인일자. 구분은 '메뉴', 요청행위는 '접근'. [승인] 에 마우스를 올리면 개별권한 / 권한그룹 → 그 업무의 권한 창이 '모든 권한' 으로 열리고
 * [상세 권한 설정] 으로 입력 · 수정 · 삭제 · 외부전송을 줄인다. 저장하면 승인. [반려] 는 반려.
 * 요청자 · 승인자 모두 메신저로 결과를 받는다(서버 PermissionRequestMessenger).
 */
export default function PermissionRequestsPage() {
  const today = ymd(new Date())
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const [user, setUser] = useState('')
  const [status, setStatus] = useState<'' | Status>('')
  const [rows, setRows] = useState<PermissionRequest[]>([])
  const [error, setError] = useState('')
  const [approving, setApproving] = useState<{ req: PermissionRequest; kind: Kind } | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (user.trim()) params.set('user', user.trim())
      if (status) params.set('status', status)
      setRows((await api.get<PermissionRequest[]>(`/permission-requests?${params}`)).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }, [from, to, user, status])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function reject(r: PermissionRequest) {
    if (!(await ecConfirm(`${r.requesterName}(${r.requesterUsername}) 님의 (${r.workName}) 권한요청을 반려하시겠습니까?`))) return
    try {
      await api.post(`/permission-requests/${r.id}/reject`)
      void load()
    } catch (e) {
      void ecAlert(extractErrorMessage(e))
    }
  }

  return (
    <EcListShell title="권한승인대기현황" search={user} onSearchChange={setUser} onSearch={() => void load()}>
      <div className="ec-cond mb-[6px]">
        <div className="flex flex-wrap gap-[10px] items-center">
          <span className="flex gap-[4px] items-center">기준일자
            <EcDateRange from={{ 'aria-label': '기준일자 시작', value: from, onChange: (e) => setFrom(e.target.value) }}
                         to={{ 'aria-label': '기준일자 끝', value: to, onChange: (e) => setTo(e.target.value) }} />
          </span>
          <label className="flex gap-[4px] items-center">사용자 ID
            <input className="ec-input w-[140px]" aria-label="사용자 ID" value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="flex gap-[4px] items-center">승인여부
            <select className="ec-input" aria-label="승인여부" value={status} onChange={(e) => setStatus(e.target.value as '' | Status)}>
              <option value="">전체</option>
              <option value="PENDING">대기</option>
              <option value="APPROVED">승인</option>
              <option value="REJECTED">반려</option>
            </select>
          </label>
        </div>
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[6px]">{error}</p>}
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[50px]">구분</th>
            <th className="w-[150px]">요청일자</th>
            <th className="w-[90px]">아이디</th>
            <th className="w-[90px]">성명</th>
            <th>요청메뉴</th>
            <th className="w-[70px]">요청행위</th>
            <th>사유</th>
            <th className="w-[150px] text-center">승인여부</th>
            <th className="w-[90px]">승인ID</th>
            <th className="w-[150px]">승인일자</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} data-request={r.id}>
              <td>메뉴</td>
              <td>{dt(r.requestedAt)}</td>
              <td>{r.requesterUsername}</td>
              <td>{r.requesterName}</td>
              <td>{r.menuName ? `${r.menuName} (${r.workName})` : r.workName}</td>
              <td>접근</td>
              <td>{r.reason ?? ''}</td>
              <td className="text-center">
                {r.status === 'PENDING' ? (
                  <span className="inline-flex gap-[4px]">
                    <span className="ec-approve-hover">
                      <button type="button" className="ec-btn ec-btn-sm ec-btn-primary">승인</button>
                      {/* 권한그룹 승인은 기본권한이 권한그룹인 사람만(서버가 groupId 를 비운다) */}
                      <span className="ec-approve-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => setApproving({ req: r, kind: 'USER' })}>개별권한</button>
                        <button type="button" role="menuitem" disabled={!r.groupId}
                                onClick={() => setApproving({ req: r, kind: 'GROUP' })}>권한그룹{r.groupName ? `(${r.groupName})` : ''}</button>
                      </span>
                    </span>
                    <button type="button" className="ec-btn ec-btn-sm" onClick={() => void reject(r)}>반려</button>
                  </span>
                ) : (
                  <span className={r.status === 'APPROVED' ? 'text-ec-blue' : 'text-ec-danger'}>
                    {STATUS_LABEL[r.status]}{r.approveKind ? `(${r.approveKind === 'USER' ? '개별권한' : '권한그룹'})` : ''}
                  </span>
                )}
              </td>
              <td>{r.processedByUsername ?? ''}</td>
              <td>{dt(r.processedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {approving && (
        <ApproveWindow req={approving.req} kind={approving.kind} onClose={() => setApproving(null)}
                       onDone={() => { setApproving(null); void load() }} />
      )}
    </EcListShell>
  )
}

/**
 * 승인 창 — 요청한 업무 하나에 '모든 권한' 이 미리 골라져 있고, [상세 권한 설정] 을 누르면 입력 · 수정 · 삭제 · 외부전송을 따로 줄인다(영상 1514).
 * [저장] = 권한 저장 + 승인(서버 한 트랜잭션).
 */
function ApproveWindow({ req, kind, onClose, onDone }: { req: PermissionRequest; kind: Kind; onClose: () => void; onDone: () => void }) {
  const [all, setAll] = useState(true)
  const [detail, setDetail] = useState(false)
  const [acts, setActs] = useState({ create: true, update: true, delete: true, export: true })
  const [error, setError] = useState('')

  async function save() {
    setError('')
    try {
      await api.post(`/permission-requests/${req.id}/approve`, {
        kind,
        row: { workCode: req.workCode, mode: all ? 'ALLOW' : 'EXC_ACTION', ...(all ? { create: true, update: true, delete: true, export: true } : acts), menus: {} },
      })
      await ecAlert('저장되었습니다.')
      onDone()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  // 원본(영상 1514): 창 제목 '개별권한설정', 오른쪽 위 '설정대상 : 권해수 (권해수)'
  const who = kind === 'USER' ? `${req.requesterName} (${req.requesterUsername})` : `${req.groupName ?? ''}`
  return (
    <Modal open title={kind === 'USER' ? '개별권한설정' : '권한그룹설정'} onClose={onClose} width={460} error={error}>
      <div className="text-right font-bold mb-[6px]" data-testid="approve-target">설정대상 : {who}</div>
      <table className="w-full">
        <thead><tr><th>업무</th><th className="w-[200px]">권한</th></tr></thead>
        <tbody>
          <tr>
            <td>{req.workName}{req.menuName ? <span className="text-ec-hint"> · {req.menuName}</span> : null}</td>
            <td>
              <label className="mr-[10px]"><input type="radio" name="approve-mode" aria-label="모든 권한" checked={all}
                                                 onChange={() => { setAll(true); setActs({ create: true, update: true, delete: true, export: true }) }} /> 모든 권한</label>
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => setDetail((d) => !d)}>상세 권한 설정</button>
            </td>
          </tr>
        </tbody>
      </table>
      {detail && (
        <table className="w-full mt-[8px]" aria-label="상세 권한">
          <thead><tr><th>상세 권한</th><th className="w-[90px] text-center">허용</th></tr></thead>
          <tbody>
            {ACTIONS.map((a) => (
              <tr key={a.key}>
                <td>{a.label}</td>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${a.label} 허용`} checked={acts[a.key]}
                         onChange={(e) => {
                           const next = { ...acts, [a.key]: e.target.checked }
                           setActs(next)
                           setAll(next.create && next.update && next.delete && next.export)
                         }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-[10px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
