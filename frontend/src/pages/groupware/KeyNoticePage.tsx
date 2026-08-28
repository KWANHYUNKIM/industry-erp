import { useEffect, useState, useRef} from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useAuth } from '../../auth/AuthContext'
import EcListShell from '../../components/EcListShell'
import ApprovalDetailModal, { STATUS_LABEL, statusColor } from '../../components/approval/ApprovalDetailModal'
import type { ApprovalDoc, ApprovalField, ApprovalFormTemplate } from '../../api/types'

/**
 * 그룹웨어 > 공유정보 > 주요전달사항 (이카운트 E070205)
 *
 * 원본은 검색 조건 없이 세 구획을 번호 붙여 쌓아 놓은 개인 전달함이다.
 *   1. 미확인쪽지보기 — 아직 확인하지 않은 쪽지(사람이 보낸 것 + 시스템 자동알림)
 *   2. 결재할문서     — 내 결재 차례인 기안서
 *   3. 수신참조문서   — 내가 수신참조로 지정된 기안서
 * 상단에는 [Option]·[도움말]뿐이고 검색창도 하단 버튼줄도 없다.
 *
 * 컬럼 폭은 원본 실측(컨테이너 2266px 기준)을 비율로 옮겼다.
 */

interface ShortMessage {
  id: number
  senderName: string
  content: string
  sentAt: string
  readAt: string | null
  linkSource: string | null
  linkRef: string | null
  linkPath: string | null
}

const dateOf = (iso: string) => iso.slice(0, 10).replace(/-/g, '/')

/** 원본 실측 폭 → 비율. 합이 100%가 되게 맞춰 두었다. */
const NOTE_COLS = ['5.3%', '83.7%', '6.6%', '4.4%']
const DOC_COLS = ['10.4%', '23.3%', '11.6%', '13.9%', '11.6%', '11.6%', '7%', '7%', '3.5%']
const DOC_HEADS = ['기안일자', '제목', 'ERP전표(건)', '구분', '기안자', '결재자', '진행상태', '결재', '조회']

function SectionTitle({ children }: { children: string }) {
  return <div style={{ fontSize: 12, color: 'var(--ec-text-grid)', marginBottom: 4 }}>{children}</div>
}

export default function KeyNoticePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [notes, setNotes] = useState<ShortMessage[]>([])
  const [pending, setPending] = useState<ApprovalDoc[]>([])
  const [referenced, setReferenced] = useState<ApprovalDoc[]>([])
  const [error, setError] = useState('')
  /** 상세 팝업. approve=true 면 승인·반려 버튼이 나온다(내 결재 차례일 때만). */
  const [detail, setDetail] = useState<{ doc: ApprovalDoc; approve: boolean } | null>(null)
  const [schemas, setSchemas] = useState<Record<number, ApprovalField[]>>({})

  async function load() {
    setError('')
    try {
      const [n, p, r] = await Promise.all([
        api.get<ShortMessage[]>('/short-messages', { params: { box: 'unread' } }),
        api.get<ApprovalDoc[]>('/approvals', { params: { scope: 'pending' } }),
        api.get<ApprovalDoc[]>('/approvals', { params: { scope: 'reference' } }),
      ])
      setNotes(n.data)
      setPending(p.data)
      setReferenced(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
      setNotes([]); setPending([]); setReferenced([])
    }
  }
  useEffect(() => { void load() }, [])

  // 상세에서 formData 키를 사람이 읽는 라벨로 바꾸려면 양식 스키마가 필요하다.
  useEffect(() => {
    api.get<ApprovalFormTemplate[]>('/approval-form-templates')
      .then((r) => setSchemas(Object.fromEntries(r.data.map((t) => [t.id, t.fieldSchema]))))
      .catch(() => {})
  }, [])

  async function act(d: ApprovalDoc, kind: 'approve' | 'reject') {
    const comment = kind === 'reject' ? window.prompt('반려 사유를 입력하세요.', '') : window.prompt('결재 의견(선택).', '')
    if (kind === 'reject' && comment === null) return
    try {
      await api.post(`/approvals/${d.id}/${kind}`, { comment: comment || undefined })
      setDetail(null)
      void load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /** 쪽지를 열면 확인 처리하고 목록에서 빠진다 — '미확인'만 모으는 구획이기 때문이다. */
  async function readNote(m: ShortMessage) {
    try {
      await api.post(`/short-messages/${m.id}/read`)
    } catch { /* 읽음 처리 실패가 이동을 막을 이유는 없다 */ }
    if (m.linkPath) navigate(m.linkPath)
    else void load()
  }

  const isMyTurn = (d: ApprovalDoc) =>
    !d.deleted && d.status === 'IN_PROGRESS' && d.currentApproverName === user?.name

  const docRows = (rows: ApprovalDoc[]) =>
    rows.length === 0 ? (
      <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
    ) : rows.map((d) => (
      <tr key={d.id}>
        <td style={{ textAlign: 'center' }}>{d.draftDate?.replace(/-/g, '/')}</td>
        <td>
          <span onClick={() => setDetail({ doc: d, approve: isMyTurn(d) })} style={{ cursor: 'pointer', color: 'var(--ec-blue-dark)' }}>{d.title}</span>
        </td>
        <td style={{ textAlign: 'center' }}>{d.voucherCount || ''}</td>
        <td style={{ textAlign: 'center' }}>{d.formTypeName}</td>
        <td style={{ textAlign: 'center' }}>{d.drafterName}</td>
        <td style={{ textAlign: 'center' }}>{d.currentApproverName ?? ''}</td>
        <td style={{ textAlign: 'center', color: statusColor(d.status) }}>{STATUS_LABEL[d.status]}</td>
        <td style={{ textAlign: 'center' }}>
          {isMyTurn(d) && <button className="ec-btn ec-btn-sm" onClick={() => setDetail({ doc: d, approve: true })}>결재</button>}
        </td>
        <td style={{ textAlign: 'center' }}>
          <button className="ec-btn ec-btn-sm" onClick={() => setDetail({ doc: d, approve: false })}>조회</button>
        </td>
      </tr>
    ))


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '주요공지', [])

  return (
    <EcListShell title="주요전달사항" searchable={false}>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <SectionTitle>1. 미확인쪽지보기</SectionTitle>
      <table className="w-full text-left" style={{ marginBottom: 12 }}>
        <colgroup>{NOTE_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead>
          <tr><th>보낸사람</th><th>내용</th><th>발송일자</th><th>연결전표</th></tr>
        </thead>
        <tbody>
          {notes.length === 0 ? (
            <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
          ) : notes.map((m) => (
            <tr key={m.id}>
              <td style={{ textAlign: 'center' }}>{m.senderName}</td>
              <td>
                {/* 자동알림 본문은 이미 '전자결재 > …' 처럼 출처를 달고 오므로 linkSource 를 덧붙이지 않는다. */}
                <span onClick={() => void readNote(m)} style={{ cursor: 'pointer' }}>{m.content}</span>
              </td>
              <td style={{ textAlign: 'center' }}>{dateOf(m.sentAt)}</td>
              <td style={{ textAlign: 'center', color: 'var(--ec-blue)' }}>{m.linkRef || m.linkPath ? '✓' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionTitle>2. 결재할문서</SectionTitle>
      <table ref={tableRef} className="w-full text-left" style={{ marginBottom: 12 }}>
        <colgroup>{DOC_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead><tr>{DOC_HEADS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{docRows(pending)}</tbody>
      </table>

      <SectionTitle>3. 수신참조문서</SectionTitle>
      <table className="w-full text-left">
        <colgroup>{DOC_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead><tr>{DOC_HEADS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{docRows(referenced)}</tbody>
      </table>

      {detail && (
        <ApprovalDetailModal
          doc={detail.doc}
          fields={schemas[detail.doc.formTemplateId] ?? []}
          isMyTurn={detail.approve}
          canDelete={false}
          onClose={() => setDetail(null)}
          onAct={act}
          onCopy={(d) => navigate('/groupware/approval/draft', { state: { copyFrom: d } })}
          onDelete={() => { /* 이 화면에서는 삭제하지 않는다 */ }}
        />
      )}
    </EcListShell>
  )
}
