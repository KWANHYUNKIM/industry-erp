import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/**
 * 그룹웨어 > 주요전달사항 (이카운트 E070205)
 * 로그인 사용자가 지금 처리해야 할 결재를 모아 보는 개인 전달함.
 *  1. 결재할 문서   — 내 결재 차례인 문서(scope=pending)
 *  2. 상신 진행중   — 내가 올려 아직 진행중인 문서(scope=drafted, IN_PROGRESS)
 * 백엔드 무변경(GET /api/approvals?scope=pending|drafted).
 * 원본의 '미확인 쪽지' 섹션은 쪽지(단문 메시지) 엔티티가 없어 제외(사내메일=MailPage로 대체).
 */
type ApprovalStatus = 'DRAFTING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED'
interface ApprovalDoc {
  id: number; docNo: string | null; draftNo: string | null
  formTypeName: string; title: string
  drafterName: string; draftDate: string
  status: ApprovalStatus; statusName: string
  currentApproverName: string | null; voucherCount: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const statusColor = (s: ApprovalStatus) =>
  s === 'APPROVED' ? '#1c7c3c' : s === 'REJECTED' ? '#c60a2e' : s === 'IN_PROGRESS' ? 'var(--ec-blue)' : '#8a929c'

function Section({ title, accent, rows, emptyText, onOpen, showApprover }: {
  title: string; accent: string; rows: ApprovalDoc[]; emptyText: string
  onOpen: () => void; showApprover?: boolean
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ width: 4, height: 15, background: accent, borderRadius: 2, marginRight: 7 }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#3c4553' }}>{title}</span>
        <span style={{ marginLeft: 7, fontSize: 12, fontWeight: 700, color: accent }}>{rows.length}</span>
        <button className="ec-btn" style={{ marginLeft: 'auto', height: 22 }} onClick={onOpen}>전체보기</button>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 120 }}>기안일</th><th>제목</th><th style={{ width: 130 }}>구분</th>
            <th style={{ width: 100 }}>기안자</th>
            {showApprover && <th style={{ width: 110 }}>현재결재자</th>}
            <th style={{ width: 90, textAlign: 'center' }}>ERP전표</th>
            <th style={{ width: 90, textAlign: 'center' }}>진행상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={showApprover ? 8 : 7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>{emptyText}</td></tr>
          ) : rows.map((d, i) => (
            <tr key={d.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{d.draftDate}</td>
              <td style={{ fontWeight: 600 }}>{d.title}</td>
              <td style={{ color: '#5a626e' }}>{d.formTypeName}</td>
              <td>{d.drafterName}</td>
              {showApprover && <td style={{ color: 'var(--ec-blue-dark)' }}>{d.currentApproverName ?? '-'}</td>}
              <td style={{ textAlign: 'center', color: d.voucherCount ? 'var(--ec-blue)' : '#c5cbd3' }}>{d.voucherCount ? `${d.voucherCount}건` : '-'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: statusColor(d.status) }}>{d.statusName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function KeyNoticePage() {
  const navigate = useNavigate()
  const [pending, setPending] = useState<ApprovalDoc[]>([])
  const [drafted, setDrafted] = useState<ApprovalDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [p, d] = await Promise.all([
        api.get<ApprovalDoc[]>('/approvals', { params: { scope: 'pending' } }),
        api.get<ApprovalDoc[]>('/approvals', { params: { scope: 'drafted' } }),
      ])
      setPending(p.data)
      setDrafted(d.data.filter((x) => x.status === 'IN_PROGRESS'))
    } catch (err) { setError(extractErrorMessage(err)); setPending([]); setDrafted([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const voucherTotal = useMemo(() => [...pending, ...drafted].reduce((s, d) => s + d.voucherCount, 0), [pending, drafted])

  return (
    <EcListShell title="주요전달사항" actions={[{ label: '새로고침', onClick: load }]}>
      <div style={{ marginBottom: 12, fontSize: 12.5, color: '#5a626e', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#9aa1ab' }}>내가 지금 처리해야 할 결재를 모았습니다.</span>
        <span style={{ marginLeft: 'auto' }}>
          결재대기 <b style={{ color: '#c60a2e', fontSize: 14 }}>{pending.length}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          상신진행 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{drafted.length}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          연결전표 <b>{won(voucherTotal)}</b>건
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {loading ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : (
        <>
          <Section title="결재할 문서" accent="#c60a2e" rows={pending} showApprover={false}
            emptyText="결재할 문서가 없습니다." onOpen={() => navigate('/groupware/approval/my')} />
          <Section title="상신 진행중 문서" accent="var(--ec-blue)" rows={drafted} showApprover
            emptyText="진행중인 상신 문서가 없습니다." onOpen={() => navigate('/groupware/approval/my')} />
        </>
      )}
    </EcListShell>
  )
}
