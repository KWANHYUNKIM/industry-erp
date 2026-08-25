import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { ApprovalDoc, ApprovalField, ApprovalFormTemplate, ApprovalStatus } from '../../api/types'
import ApprovalDetailModal, { STATUS_LABEL, VOUCHER_LABEL, statusColor } from '../../components/approval/ApprovalDetailModal'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 알약(탭)은 화면마다 마지막 하나가 다르다 — 원본에서 확인했다.
 *   내결재관리     : 전체·기안중·진행중·반려·결재·**수신참조**
 *   기안서통합관리 : 전체·기안중·진행중·반려·결재·**삭제**
 * 앞의 다섯은 같고, 내 결재함에서는 '내가 수신참조로 걸린 문서', 통합관리에서는
 * '지운 문서'를 마지막 칸으로 본다. 우리는 둘 다 '삭제'로 두고 있었다.
 */
const COMMON_TABS = ['전체', '기안중', '진행중', '반려', '결재'] as const
const TABS_MINE = [...COMMON_TABS, '수신참조'] as const
const TABS_ALL = [...COMMON_TABS, '삭제'] as const
type Tab = (typeof TABS_MINE)[number] | (typeof TABS_ALL)[number]

const TAB_STATUS: Record<Exclude<Tab, '전체' | '삭제' | '수신참조'>, ApprovalStatus> = {
  기안중: 'DRAFTING',
  진행중: 'IN_PROGRESS',
  반려: 'REJECTED',
  결재: 'APPROVED',
}

const inTab = (d: ApprovalDoc, tab: Tab, myName?: string) => {
  if (tab === '삭제') return d.deleted
  if (d.deleted) return false
  if (tab === '수신참조') {
    return !!myName && d.participants.some((p) => p.role === 'REFERENCE' && p.userName === myName)
  }
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
  const TABS: readonly Tab[] = scope === 'mine' ? TABS_MINE : TABS_ALL
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ApprovalDoc | null>(null)
  // 상세에서 formData 의 키를 사람이 읽는 라벨로 바꾸기 위해 양식 스키마를 받아둔다.
  const [schemas, setSchemas] = useState<Record<number, ApprovalField[]>>({})
  // 원본 하단 버튼줄의 [결재/검토완료]·[라벨변경]은 **고른 문서에 한꺼번에** 하는 동작이다.
  // 그러려면 행을 고를 수 있어야 하는데 우리 목록엔 그 방법이 없었다.
  // 고르는 방식은 판매조회·전표입력과 같다 — 회색 행번호 칸을 누른다.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // 원본은 목록 위에 기안일자 기간을 놓는다(기본 오늘 −30일 ~ +30일).
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(() => ymd(new Date(Date.now() + 30 * 86400000)))

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

  const inPeriod = (d: ApprovalDoc) =>
    (!from || (d.draftDate ?? '') >= from) && (!to || (d.draftDate ?? '') <= to)
  const filtered = rows.filter((r) => inTab(r, tab, user?.name)).filter(inPeriod)

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

  const toggleSelect = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  /**
   * 원본 [결재/검토완료] — 고른 문서 중 **내 차례인 것만** 결재한다.
   * 내 차례가 아닌 문서는 서버가 막으므로, 미리 걸러 내고 몇 건을 건너뛰었는지 알려 준다.
   */
  async function approveSelected() {
    const targets = filtered.filter((d) => selected.has(d.id) && isMyTurn(d))
    const skipped = selected.size - targets.length
    if (targets.length === 0) {
      flash(selected.size === 0
        ? '결재할 문서를 고르세요. 행번호 칸을 누르면 선택됩니다.'
        : '고른 문서 중 지금 내 차례인 것이 없습니다.')
      return
    }
    if (!window.confirm(`${targets.length}건을 결재할까요?`)) return
    const failed: string[] = []
    for (const d of targets) {
      try {
        await api.post(`/approvals/${d.id}/approve`, {})
      } catch (err) {
        failed.push(`${d.title}: ${extractErrorMessage(err)}`)
      }
    }
    setSelected(new Set())
    load()
    flash(failed.length === 0
      ? `${targets.length}건 결재했습니다.${skipped > 0 ? ` (내 차례가 아닌 ${skipped}건은 건너뜀)` : ''}`
      : `결재하지 못한 문서 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  /** 원본 [라벨변경] — 고른 문서의 꼬리표를 한 번에 바꾼다. 비우면 라벨을 뗀다. */
  async function changeLabelSelected() {
    const targets = filtered.filter((d) => selected.has(d.id))
    if (targets.length === 0) {
      flash('라벨을 바꿀 문서를 고르세요. 행번호 칸을 누르면 선택됩니다.')
      return
    }
    const next = window.prompt(`${targets.length}건의 라벨을 무엇으로 바꿀까요? (비우면 라벨을 뗍니다)`, '')
    if (next === null) return
    const failed: string[] = []
    for (const d of targets) {
      try {
        await api.patch(`/approvals/${d.id}/label`, { labelText: next })
      } catch (err) {
        failed.push(`${d.title}: ${extractErrorMessage(err)}`)
      }
    }
    setSelected(new Set())
    load()
    flash(failed.length === 0
      ? `${targets.length}건의 라벨을 바꿨습니다.`
      : `바꾸지 못한 문서 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  /**
   * 원본 기안서통합관리 하단의 [선택삭제] — 고른 문서를 한꺼번에 지운다(소프트 삭제).
   * 결재가 끝난 문서는 서버가 막는다. 막힌 건은 사유를 모아 보여 주고 나머지는 계속 지운다.
   */
  async function deleteSelected() {
    const targets = filtered.filter((d) => selected.has(d.id) && !d.deleted)
    if (targets.length === 0) {
      flash(selected.size === 0
        ? '지울 문서를 고르세요. 행번호 칸을 누르면 선택됩니다.'
        : '고른 문서 중 지울 수 있는 것이 없습니다.')
      return
    }
    if (!window.confirm(`${targets.length}건을 삭제할까요? (삭제 탭에서 다시 볼 수 있습니다)`)) return
    const failed: string[] = []
    for (const d of targets) {
      try {
        await api.delete(`/approvals/${d.id}`)
      } catch (err) {
        failed.push(`${d.title}: ${extractErrorMessage(err)}`)
      }
    }
    setSelected(new Set())
    load()
    flash(failed.length === 0
      ? `${targets.length}건 삭제했습니다.`
      : `지우지 못한 문서 ${failed.length}건 — ${failed.join(' / ')}`)
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

  const tabCount = (t: Tab) => rows.filter((r) => inTab(r, t, user?.name)).filter(inPeriod).length

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

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>

      {/* 원본은 알약 아래에 기안일자 기간을 적어 둔다 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowX: 'auto' }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              {/* 1열은 행머리다 — 헤더는 전체선택, 본문은 행번호(눌러서 선택). 다른 목록과 같은 규칙. */}
              <th
                style={{ width: 34, cursor: filtered.length > 0 ? 'pointer' : 'default' }}
                title="전체 선택 / 해제"
                onClick={() => setSelected(
                  selected.size === filtered.length ? new Set() : new Set(filtered.map((d) => d.id)),
                )}
              >
                {filtered.length > 0 && selected.size === filtered.length ? '☑' : ''}
              </th>
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
                <td
                  style={{
                    textAlign: 'center',
                    background: selected.has(r.id) ? 'var(--ec-blue-light)' : '#f3f3f3',
                    color: selected.has(r.id) ? 'var(--ec-blue-dark)' : '#8a929c',
                    fontWeight: selected.has(r.id) ? 700 : 400,
                    cursor: 'pointer', userSelect: 'none',
                  }}
                  title="눌러서 이 문서를 고릅니다"
                  onClick={() => toggleSelect(r.id)}
                >
                  {i + 1}
                </td>
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
        {/*
          **두 화면의 하단 버튼줄이 다르다** — 같은 컴포넌트를 쓴다고 같은 버튼을 달면 안 된다.
            내결재관리(mine)     : 신규(F2) · My도장/서명 · 보내기 · 결재/검토완료 · 라벨변경 · 인쇄 · Excel
            기안서통합관리(all)  : 선택삭제 · 라벨변경 · 인쇄 · Excel
          통합관리는 남의 기안서까지 보는 자리라 **거기서 결재하거나 새로 쓰지 않는다.**
          (My도장/서명·보내기는 받쳐 줄 기능이 없어 넣지 않는다 — 눌러도 아무 일 없는 버튼은 거짓말이다.)
        */}
        {scope === 'mine' ? (
          <>
            <button className="ec-btn ec-btn-primary" onClick={() => navigate('/groupware/approval/draft')}>
              신규(F2)
            </button>
            <button className="ec-btn" onClick={() => void approveSelected()}>결재/검토완료</button>
          </>
        ) : (
          <button className="ec-btn" onClick={() => void deleteSelected()}>선택삭제</button>
        )}
        <button className="ec-btn" onClick={() => void changeLabelSelected()}>라벨변경</button>
        {bottomActions.map((a) => {
          const onClick = a.includes('Excel') || a.includes('엑셀') ? () => { void doExcel() }
            : a.includes('인쇄') || a.includes('출력') ? () => doPrint()
            : undefined
          return <button key={a} className="ec-btn" onClick={onClick}>{a}</button>
        })}
      </div>

      {detail && (
        <ApprovalDetailModal
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
