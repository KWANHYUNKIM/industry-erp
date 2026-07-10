import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { ApprovalDoc } from '../../api/types'

const TABS = ['전체', '기안중', '진행중', '완료', '반려'] as const
type Tab = (typeof TABS)[number]

const statusColor = (name: string) =>
  name === '반려' ? '#c60a2e' : name === '완료' ? '#1c7c3c' : 'var(--ec-blue)'

/** 내결재관리(scope=mine) / 기안서통합관리(scope=all) 공용 목록 — 실제 결재 연동 */
export default function ApprovalListPage({
  title, scope, bottomActions = [],
}: {
  title: string
  scope: 'mine' | 'all'
  bottomActions?: string[]
}) {
  const { user } = useAuth()
  const [rows, setRows] = useState<ApprovalDoc[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ApprovalDoc | null>(null)

  // 목록 표 내보내기/인쇄/검색을 위한 참조·상태 (EcListShell 자동배선을 못 받는 화면이라 직접 배선)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2500)
  }

  // 렌더된 tbody 행을 텍스트 부분일치로 숨기는 클라이언트 필터
  const filterRows = (q: string) => {
    const table = findDataTable(bodyRef.current)
    if (!table) return
    const needle = q.trim().toLowerCase()
    let hit = 0
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row = tr as HTMLTableRowElement
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return // 안내행은 항상 노출
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
      const r = await api.get<ApprovalDoc[]>('/approvals', { params: { scope } })
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

  const filtered = rows.filter((r) => tab === '전체' || r.statusName === tab)

  const isMyTurn = (d: ApprovalDoc) =>
    d.status === 'IN_PROGRESS' && d.currentApproverName === user?.name

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

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent',
            color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t}{t !== '전체' ? ` (${rows.filter((r) => r.statusName === t).length})` : ` (${rows.length})`}</button>
        ))}
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>문서번호</th>
              <th>기안일자 ▼</th>
              <th>양식</th>
              <th>제목</th>
              <th>기안자</th>
              <th>현재결재자</th>
              <th style={{ textAlign: 'center' }}>진행상태</th>
              <th style={{ textAlign: 'center' }}>결재</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>해당하는 데이터가 없습니다.</td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
                <td>{r.draftDate}</td>
                <td>{r.formTypeName}</td>
                <td><a onClick={() => setDetail(r)} style={{ color: 'var(--ec-blue)', cursor: 'pointer' }}>{r.title}</a></td>
                <td>{r.drafterName}</td>
                <td>{r.currentApproverName ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: statusColor(r.statusName) }}>{r.statusName}</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {isMyTurn(r) ? (
                    <div style={{ display: 'inline-flex', gap: 3 }}>
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => act(r, 'approve')}>승인</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => act(r, 'reject')}>반려</button>
                    </div>
                  ) : (
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setDetail(r)}>보기</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        {bottomActions.map((a) => {
          // 라벨에 따라 기본 동작 배선 (Excel/인쇄). 그 외 라벨은 동작 미정이라 그대로 둔다
          const onClick = a.includes('Excel') || a.includes('엑셀') ? () => { void doExcel() }
            : a.includes('인쇄') || a.includes('출력') ? () => doPrint()
            : undefined
          return <button key={a} className="ec-btn" onClick={onClick}>{a}</button>
        })}
      </div>

      {detail && <DetailModal doc={detail} isMyTurn={isMyTurn(detail)} onClose={() => setDetail(null)} onAct={act} />}

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 420, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{title} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                <li>상단 <b>탭</b>으로 기안중·진행중·완료·반려 상태별 문서를 걸러 봅니다.</li>
                <li><b>Search(F3)</b> — 입력한 낱말이 문서번호·제목·기안자 등에 포함된 행만 추립니다.</li>
                <li><b>Excel/인쇄</b> — 지금 화면에 보이는 목록을 파일로 내려받거나 인쇄합니다.</li>
                <li>내 차례인 문서는 <b>승인·반려</b> 버튼으로 바로 결재할 수 있습니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailModal({ doc, isMyTurn, onClose, onAct }: {
  doc: ApprovalDoc
  isMyTurn: boolean
  onClose: () => void
  onAct: (d: ApprovalDoc, kind: 'approve' | 'reject') => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 620, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{doc.formTypeName} | {doc.title}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <tbody>
              <tr><th style={{ width: 90, background: '#f5f7fa' }}>문서번호</th><td style={{ fontFamily: 'monospace' }}>{doc.docNo}</td><th style={{ width: 90, background: '#f5f7fa' }}>기안일</th><td>{doc.draftDate}</td></tr>
              <tr><th style={{ background: '#f5f7fa' }}>기안자</th><td>{doc.drafterName}</td><th style={{ background: '#f5f7fa' }}>상태</th><td style={{ color: statusColor(doc.statusName), fontWeight: 700 }}>{doc.statusName}</td></tr>
              {doc.reference && <tr><th style={{ background: '#f5f7fa' }}>참조</th><td colSpan={3}>{doc.reference}</td></tr>}
            </tbody>
          </table>

          <div style={{ whiteSpace: 'pre-wrap', border: '1px solid var(--ec-border)', padding: 12, minHeight: 120, fontSize: 13, marginBottom: 14 }}>{doc.content}</div>

          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#5a626e', marginBottom: 6 }}>결재선</div>
          <table className="w-full text-left">
            <thead><tr><th style={{ width: 44, textAlign: 'center' }}>순번</th><th>결재자</th><th style={{ textAlign: 'center' }}>상태</th><th>의견</th><th>처리일시</th></tr></thead>
            <tbody>
              {doc.lines.map((l) => (
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
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          {isMyTurn && <>
            <button className="ec-btn ec-btn-primary" onClick={() => onAct(doc, 'approve')}>승인</button>
            <button className="ec-btn" style={{ color: '#c60a2e' }} onClick={() => onAct(doc, 'reject')}>반려</button>
          </>}
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
