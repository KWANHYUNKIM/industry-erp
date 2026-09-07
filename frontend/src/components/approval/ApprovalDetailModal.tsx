import type { ApprovalDoc, ApprovalField, ApprovalStatus } from '../../api/types'

/**
 * 기안서 상세 팝업. 내결재관리·기안서통합관리(ApprovalListPage)와 주요전달사항(KeyNoticePage)이
 * 같은 화면을 쓴다. 목록마다 상세를 따로 만들면 결재선 표시 규칙이 화면별로 어긋난다.
 */

export const statusColor = (s: ApprovalStatus) =>
  s === 'REJECTED' ? '#c60a2e' : s === 'APPROVED' ? '#1c7c3c' : 'var(--ec-blue)'

/** 서버의 statusName 은 '완료'지만, 결재 화면은 탭 어휘('결재')로 통일한다. */
export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  DRAFTING: '기안중',
  IN_PROGRESS: '진행중',
  REJECTED: '반려',
  APPROVED: '결재',
}

export const VOUCHER_LABEL: Record<string, string> = { SALES: '판매', PURCHASE: '구매', EXPENSE: '지출' }

/**
 * formData 를 사람이 읽을 표로 편다.
 * 양식 스키마를 알면 라벨·순서를 그대로 따르고, 모르면(양식이 지워진 경우) 키를 그대로 쓴다.
 */
function FormDataView({ data, fields }: { data: Record<string, unknown>; fields: ApprovalField[] }) {
  const entries = Object.entries(data ?? {})
  if (entries.length === 0) return null

  const known = fields.filter((f) => data[f.key] !== undefined)
  const extraKeys = entries.map(([k]) => k).filter((k) => !fields.some((f) => f.key === k))

  const row = (key: string, label: string, field?: ApprovalField) => (
    <tr key={key}>
      <th style={{ width: 150, background: '#f5f7fa' }}>{label}</th>
      <td>
        {Array.isArray(data[key])
          ? <RowsView rows={data[key] as Record<string, unknown>[]} field={field} />
          : String(data[key] ?? '')}
      </td>
    </tr>
  )

  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 12.5, color: '#5a626e', marginBottom: 6 }}>기안 항목</div>
      <table className="w-full text-left" style={{ marginBottom: 14 }}>
        <tbody>
          {known.map((f) => row(f.key, f.label, f))}
          {extraKeys.map((k) => row(k, k))}
        </tbody>
      </table>
    </>
  )
}

function RowsView({ rows, field }: { rows: Record<string, unknown>[]; field?: ApprovalField }) {
  if (rows.length === 0) return <span style={{ color: '#9aa1ab' }}>(없음)</span>

  const cols = field?.columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).map((k) => ({ key: k, label: k }))
  const totalKey = field?.totalOf
  const total = totalKey
    ? rows.reduce((sum, r) => sum + (Number.isFinite(Number(r[totalKey])) ? Number(r[totalKey]) : 0), 0)
    : null

  return (
    <table className="w-full text-left">
      <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{cols.map((c) => <td key={c.key}>{r[c.key] == null ? '' : String(r[c.key])}</td>)}</tr>
        ))}
        {total !== null && (
          <tr>
            <td colSpan={Math.max(1, cols.length - 1)} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>
              {field?.totalLabel ?? '합계'}
            </td>
            <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{total.toLocaleString()}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

export default function ApprovalDetailModal({ doc, fields, isMyTurn, canDelete, onClose, onAct, onCopy, onDelete }: {
  doc: ApprovalDoc
  fields: ApprovalField[]
  isMyTurn: boolean
  canDelete: boolean
  onClose: () => void
  onAct: (d: ApprovalDoc, kind: 'approve' | 'reject') => void
  onCopy: (d: ApprovalDoc) => void
  onDelete: (d: ApprovalDoc) => void
}) {
  const refs = doc.participants.filter((p) => p.role === 'REFERENCE')
  const shares = doc.participants.filter((p) => p.role === 'SHARE')

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 720, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{doc.formTypeName} | {doc.title}</span>
          {doc.deleted && <span style={{ marginLeft: 8, fontSize: 11, background: '#f0f2f5', color: '#8a929c', padding: '1px 6px', borderRadius: 10 }}>삭제됨</span>}
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>기안No.</th><td style={{ fontFamily: 'monospace' }}>{doc.draftNo}</td>
                <th style={{ width: 90, background: '#f5f7fa' }}>기안서No.</th><td style={{ fontFamily: 'monospace' }}>{doc.docNo}</td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>기안자</th><td>{doc.drafterName}</td>
                <th style={{ background: '#f5f7fa' }}>기안일</th><td>{doc.draftDate}</td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>부서</th><td>{doc.department ?? ''}</td>
                <th style={{ background: '#f5f7fa' }}>상태</th>
                <td style={{ color: statusColor(doc.status), fontWeight: 700 }}>{doc.deleted ? '삭제' : STATUS_LABEL[doc.status]}</td>
              </tr>
              {(refs.length > 0 || shares.length > 0) && (
                <tr>
                  <th style={{ background: '#f5f7fa' }}>수신참조</th>
                  <td>{refs.map((p) => p.userName).join(', ') || '—'}</td>
                  <th style={{ background: '#f5f7fa' }}>공유자</th>
                  <td>{shares.map((p) => p.userName).join(', ') || '—'}</td>
                </tr>
              )}
            </tbody>
          </table>

          <FormDataView data={doc.formData} fields={fields} />

          {doc.content && (
            <div style={{ whiteSpace: 'pre-wrap', border: '1px solid var(--ec-border)', padding: 12, minHeight: 80, fontSize: 13, marginBottom: 14 }}>{doc.content}</div>
          )}

          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#5a626e', marginBottom: 6 }}>결재선</div>
          <table className="w-full text-left" style={{ marginBottom: 14 }}>
            <thead><tr><th style={{ width: 44, textAlign: 'center' }}>순번</th><th>결재자</th><th style={{ textAlign: 'center' }}>상태</th><th>의견</th><th>처리일시</th></tr></thead>
            <tbody>
              {doc.lines.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 10 }}>결재선이 없습니다 (기안중).</td></tr>
              ) : doc.lines.map((l) => (
                <tr key={l.id} style={{ background: l.stepOrder === doc.currentStep && doc.status === 'IN_PROGRESS' ? 'var(--ec-blue-light)' : undefined }}>
                  <td style={{ textAlign: 'center' }}>{l.stepOrder}</td>
                  <td>{l.approverName}</td>
                  <td style={{ textAlign: 'center', color: l.status === 'REJECTED' ? '#c60a2e' : l.status === 'APPROVED' ? '#1c7c3c' : '#8a929c' }}>{l.statusName}</td>
                  <td>{l.comment ?? ''}</td>
                  <td style={{ color: '#8a929c' }}>{l.actedAt ? l.actedAt.replace('T', ' ').slice(0, 16) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#5a626e', marginBottom: 6 }}>연결전표 ({doc.voucherCount})</div>
          <table className="w-full text-left">
            <thead><tr><th style={{ width: 90 }}>구분</th><th>전표번호</th></tr></thead>
            <tbody>
              {doc.vouchers.length === 0 ? (
                <tr><td colSpan={2} style={{ textAlign: 'center', color: '#9aa1ab', padding: 10 }}>연결된 ERP 전표가 없습니다.</td></tr>
              ) : doc.vouchers.map((v) => (
                <tr key={v.id}>
                  <td>{VOUCHER_LABEL[v.voucherType] ?? v.voucherType}</td>
                  <td style={{ fontFamily: 'monospace' }}>{v.voucherNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          {isMyTurn && <>
            <button className="ec-btn ec-btn-primary" onClick={() => onAct(doc, 'approve')}>승인</button>
            <button className="ec-btn" style={{ color: '#c60a2e' }} onClick={() => onAct(doc, 'reject')}>반려</button>
          </>}
          <button className="ec-btn" onClick={() => onCopy(doc)}>기안서복사</button>
          {canDelete && <button className="ec-btn" style={{ color: '#c60a2e' }} onClick={() => onDelete(doc)}>삭제</button>}
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
