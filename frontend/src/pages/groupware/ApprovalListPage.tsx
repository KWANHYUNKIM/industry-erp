import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { ApprovalDoc, ApprovalField, ApprovalFormTemplate, ApprovalStatus } from '../../api/types'

/** 이카운트 기안서통합관리의 탭. '결재'는 결재완료(APPROVED), '삭제'는 소프트 삭제된 문서. */
const TABS = ['전체', '기안중', '진행중', '반려', '결재', '삭제'] as const
type Tab = (typeof TABS)[number]

const TAB_STATUS: Record<Exclude<Tab, '전체' | '삭제'>, ApprovalStatus> = {
  기안중: 'DRAFTING',
  진행중: 'IN_PROGRESS',
  반려: 'REJECTED',
  결재: 'APPROVED',
}

const statusColor = (s: ApprovalStatus) =>
  s === 'REJECTED' ? '#c60a2e' : s === 'APPROVED' ? '#1c7c3c' : 'var(--ec-blue)'

/** 서버의 statusName 은 '완료'지만, 이 화면은 탭 어휘('결재')로 통일한다. */
const STATUS_LABEL: Record<ApprovalStatus, string> = {
  DRAFTING: '기안중',
  IN_PROGRESS: '진행중',
  REJECTED: '반려',
  APPROVED: '결재',
}

const VOUCHER_LABEL: Record<string, string> = { SALES: '판매', PURCHASE: '구매', EXPENSE: '지출' }

const inTab = (d: ApprovalDoc, tab: Tab) => {
  if (tab === '삭제') return d.deleted
  if (d.deleted) return false
  if (tab === '전체') return true
  return d.status === TAB_STATUS[tab]
}

/** 내결재관리(scope=mine) / 기안서통합관리(scope=all) 공용 목록 — 실제 결재 연동 */
export default function ApprovalListPage({
  title, scope, bottomActions = [],
}: {
  title: string
  scope: 'mine' | 'all'
  bottomActions?: string[]
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<ApprovalDoc[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ApprovalDoc | null>(null)
  // 상세에서 formData 의 키를 사람이 읽는 라벨로 바꾸기 위해 양식 스키마를 받아둔다.
  const [schemas, setSchemas] = useState<Record<number, ApprovalField[]>>({})

  const bodyRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const filterRows = (q: string) => {
    const table = findDataTable(bodyRef.current)
    if (!table) return
    const needle = q.trim().toLowerCase()
    let hit = 0
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row = tr as HTMLTableRowElement
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return
      const match = !needle || (row.textContent ?? '').toLowerCase().includes(needle)
      row.style.display = match ? '' : 'none'
      if (match) hit += 1
    })
    if (needle) flash(`'${q.trim()}' 검색결과 ${hit}건`)
  }

  async function doExcel() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 내보낼 표가 없습니다.')
    if (!(await exportTableToXlsx(table, title))) flash('내보낼 자료가 없습니다.')
  }

  function doPrint() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 인쇄할 표가 없습니다.')
    if (!printTable(table, title)) flash('인쇄할 자료가 없습니다.')
  }

  async function load() {
    setLoading(true)
    try {
      // 삭제 탭을 위해 삭제분까지 한 번에 받아 클라이언트에서 가른다.
      const r = await api.get<ApprovalDoc[]>('/approvals', { params: { scope, includeDeleted: true } })
      setRows(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  useEffect(() => {
    api.get<ApprovalFormTemplate[]>('/approval-form-templates')
      .then((r) => setSchemas(Object.fromEntries(r.data.map((t) => [t.id, t.fieldSchema]))))
      .catch(() => {})
  }, [])

  const filtered = rows.filter((r) => inTab(r, tab))

  const isMyTurn = (d: ApprovalDoc) =>
    !d.deleted && d.status === 'IN_PROGRESS' && d.currentApproverName === user?.name

  const isMine = (d: ApprovalDoc) => d.drafterName === user?.name

  async function act(d: ApprovalDoc, kind: 'approve' | 'reject') {
    const comment = kind === 'reject' ? window.prompt('반려 사유를 입력하세요.', '') : window.prompt('결재 의견(선택).', '')
    if (kind === 'reject' && comment === null) return
    try {
      await api.post(`/approvals/${d.id}/${kind}`, { comment: comment || undefined })
      setDetail(null)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function submitDraft(d: ApprovalDoc) {
    try {
      await api.post(`/approvals/${d.id}/submit`)
      setDetail(null)
      flash('상신되었습니다.')
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function remove(d: ApprovalDoc) {
    if (!window.confirm(`'${d.title}' 기안서를 삭제할까요? (삭제 탭에서 다시 볼 수 있습니다)`)) return
    try {
      await api.delete(`/approvals/${d.id}`)
      setDetail(null)
      flash('삭제되었습니다.')
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const copy = (d: ApprovalDoc) => navigate('/groupware/approval/draft', { state: { copyFrom: d } })

  const tabCount = (t: Tab) => rows.filter((r) => inTab(r, t)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>{title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <button className="ec-btn" onClick={load}>새로고침</button>
          <input
            className="ec-input"
            placeholder="입력 후 [Enter]"
            value={search}
            onChange={(e) => { setSearch(e.target.value); filterRows(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') filterRows(search) }}
            style={{ width: 150 }}
          />
          <button className="ec-btn ec-btn-primary" onClick={() => filterRows(search)}>Search(F3)</button>
          <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>

          {optionOpen && (
            <>
              <div onClick={() => setOptionOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, background: '#fff', border: '1px solid #c9d1da', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: 4 }}>
                {[
                  { label: 'Excel 내려받기', run: () => { void doExcel() } },
                  { label: '인쇄', run: () => doPrint() },
                  { label: '검색조건 초기화', run: () => { setSearch(''); filterRows('') } },
                ].map((m) => (
                  <button key={m.label} onClick={() => { setOptionOpen(false); m.run() }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, background: 'none', border: 0, cursor: 'pointer' }}>{m.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent',
            color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({tabCount(t)})</button>
        ))}
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowX: 'auto' }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>기안일자</th>
              <th>제목</th>
              <th style={{ textAlign: 'center' }}>ERP전표(건)</th>
              <th>구분</th>
              <th>기안자</th>
              <th>결재자</th>
              <th style={{ textAlign: 'center' }}>진행상태</th>
              <th style={{ textAlign: 'center' }}>결재</th>
              <th style={{ textAlign: 'center' }}>기안서복사</th>
              <th style={{ textAlign: 'center' }}>조회</th>
              <th>연결전표</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>해당하는 데이터가 없습니다.</td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r.id} style={{ opacity: r.deleted ? 0.55 : 1 }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.draftNo}</td>
                <td><a onClick={() => setDetail(r)} style={{ color: 'var(--ec-blue)', cursor: 'pointer' }}>{r.title}</a></td>
                <td style={{ textAlign: 'center' }}>{r.voucherCount > 0 ? r.voucherCount : ''}</td>
                <td>{r.formTypeName}</td>
                <td>{r.drafterName}</td>
                <td>{r.currentApproverName ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  {r.deleted
                    ? <span style={{ color: '#8a929c' }}>삭제</span>
                    : <span style={{ color: statusColor(r.status) }}>{STATUS_LABEL[r.status]}</span>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {isMyTurn(r) ? (
                    <div style={{ display: 'inline-flex', gap: 3 }}>
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => act(r, 'approve')}>승인</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => act(r, 'reject')}>반려</button>
                    </div>
                  ) : r.status === 'DRAFTING' && isMine(r) && !r.deleted ? (
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => submitDraft(r)}>상신</button>
                  ) : (
                    <span style={{ color: '#c9ced6' }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => copy(r)}>복사</button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setDetail(r)}>보기</button>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.vouchers.map((v) => (
                    <span key={v.id} style={{ display: 'inline-block', marginRight: 4, padding: '1px 6px', borderRadius: 10, fontSize: 11, background: '#eef5ff', color: '#2b5b91' }}>
                      {VOUCHER_LABEL[v.voucherType] ?? v.voucherType} {v.voucherNo}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        {bottomActions.map((a) => {
          const onClick = a.includes('Excel') || a.includes('엑셀') ? () => { void doExcel() }
            : a.includes('인쇄') || a.includes('출력') ? () => doPrint()
            : undefined
          return <button key={a} className="ec-btn" onClick={onClick}>{a}</button>
        })}
      </div>

      {detail && (
        <DetailModal
          doc={detail}
          fields={schemas[detail.formTemplateId] ?? []}
          isMyTurn={isMyTurn(detail)}
          canDelete={isMine(detail) && !detail.deleted && detail.status !== 'APPROVED'}
          onClose={() => setDetail(null)}
          onAct={act}
          onCopy={copy}
          onDelete={remove}
        />
      )}

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 460, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{title} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                <li>탭으로 <b>기안중·진행중·반려·결재·삭제</b> 상태별 문서를 걸러 봅니다.</li>
                <li><b>ERP전표(건)</b> — 이 기안서에 연결된 판매·구매·지출 전표 건수입니다. 오른쪽 <b>연결전표</b>에 전표번호가 보입니다.</li>
                <li><b>기안서복사</b> — 양식·제목·입력값을 그대로 가져와 새 기안서를 씁니다. 결재선은 다시 지정합니다.</li>
                <li>삭제는 문서를 지우지 않고 <b>삭제 탭</b>으로 옮깁니다. 기안번호는 그대로 남습니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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

function DetailModal({ doc, fields, isMyTurn, canDelete, onClose, onAct, onCopy, onDelete }: {
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
