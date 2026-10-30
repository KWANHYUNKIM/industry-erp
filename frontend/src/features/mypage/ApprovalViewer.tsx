import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { ApprovalDoc, ApprovalField, ApprovalFormTemplate } from '../../types/api'
import { useAuth } from '../auth/AuthContext'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import ApprovalDetailModal from '../approval/components/ApprovalDetailModal'

/**
 * 전자결재 위젯의 제목 · [보기] → 기안서 보기 창(원본 2026-10-30 홈 실측). 내결재관리(ApprovalListPage)와 같은 상세 창을 쓰고,
 * 결재 · 반려 · 상신 · 삭제도 그 화면과 같은 API 로 한다. [복사] 는 onCopy — 대시보드가 기안서작성 창을 그 기안서로 채워 띄운다.
 * copy 면 상세 창 없이 문서만 받아 바로 onCopy(위젯 줄의 [복사]).
 */
export default function ApprovalViewer({ id, copy, onClose, onCopy }: {
  id: number
  copy?: boolean
  onClose: () => void
  onCopy: (d: ApprovalDoc) => void
}) {
  const { user } = useAuth()
  const [doc, setDoc] = useState<ApprovalDoc | null>(null)
  const [fields, setFields] = useState<ApprovalField[]>([])

  useEffect(() => {
    let live = true
    api.get<ApprovalDoc>(`/approvals/${id}`)
      .then((r) => {
        if (!live) return
        if (copy) { onCopy(r.data); return }
        setDoc(r.data)
        return api.get<ApprovalFormTemplate[]>('/approval-form-templates')
          .then((t) => { if (live) setFields(t.data.find((x) => x.id === r.data.formTemplateId)?.fieldSchema ?? []) })
          .catch(() => {})
      })
      .catch((err) => { if (live) { void ecAlert(extractErrorMessage(err)); onClose() } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, copy])

  if (!doc) return null
  const mine = doc.drafterName === user?.name
  const myTurn = !doc.deleted && doc.status === 'IN_PROGRESS' && doc.currentApproverName === user?.name

  async function act(d: ApprovalDoc, kind: 'approve' | 'reject') {
    const comment = kind === 'reject' ? window.prompt('반려 사유를 입력하세요.', '') : window.prompt('결재 의견(선택).', '')
    if (kind === 'reject' && comment === null) return
    try {
      await api.post(`/approvals/${d.id}/${kind}`, { comment: comment || undefined })
      onClose()
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  async function remove(d: ApprovalDoc) {
    if (!(await ecConfirm('기안서를 삭제하겠습니까?\n삭제된 기안서는 복구되지 않습니다.'))) return
    try { await api.delete(`/approvals/${d.id}`); onClose() } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  async function submit(d: ApprovalDoc) {
    try { await api.post(`/approvals/${d.id}/submit`); onClose() } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  return (
    <ApprovalDetailModal
      doc={doc}
      fields={fields}
      isMyTurn={myTurn}
      canDelete={mine && !doc.deleted && doc.status !== 'APPROVED'}
      onClose={onClose}
      onAct={act}
      onCopy={onCopy}
      onDelete={remove}
      onSubmit={mine && !doc.deleted && doc.status === 'DRAFTING' ? submit : undefined}
    />
  )
}
