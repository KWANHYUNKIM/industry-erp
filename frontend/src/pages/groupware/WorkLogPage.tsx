import { useEffect, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { WorkJournal } from '../../api/types'

const TITLE = '업무일지'

const today = () => new Date().toISOString().slice(0, 10)
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dow = (d: string) => (d ? DOW[new Date(d).getDay()] : '')

/** 그룹웨어 > 업무관리 > 업무일지 — 실제 일지 목록 + 작성 */
export default function WorkLogPage() {
  const [rows, setRows] = useState<WorkJournal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ reportDate: today(), department: '', partnerName: '', title: '', content: '' })

  // 표 내보내기/인쇄/검색 직접 배선
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
    if (!(await exportTableToXlsx(table, TITLE))) flash('내보낼 자료가 없습니다.')
  }

  function doPrint() {
    const table = findDataTable(bodyRef.current)
    if (!table) return flash('이 화면에는 인쇄할 표가 없습니다.')
    if (!printTable(table, TITLE)) flash('인쇄할 자료가 없습니다.')
  }

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<WorkJournal[]>('/work-journals')
      setRows(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    if (!form.content.trim()) return setError('내용을 입력하세요.')
    try {
      await api.post('/work-journals', {
        reportDate: form.reportDate,
        department: form.department || undefined,
        partnerName: form.partnerName || undefined,
        title: form.title,
        content: form.content,
      })
      setForm({ reportDate: today(), department: '', partnerName: '', title: '', content: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>업무일지</span>
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

      <Modal open={showForm} title="신규 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 16, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>업무일지 작성</div>
          <table className="w-full text-left" style={{ marginBottom: 10 }}>
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>업무보고일</th>
                <td><input className="ec-input" type="date" value={form.reportDate} onChange={(e) => set('reportDate', e.target.value)} style={{ width: 150 }} /> <span style={{ color: '#8a929c' }}>({dow(form.reportDate)})</span></td>
                <th style={{ width: 90, background: '#f5f7fa' }}>부서</th>
                <td><input className="ec-input" value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="미입력시 소속부서" style={{ width: 160 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>거래처</th>
                <td colSpan={3}><input className="ec-input" value={form.partnerName} onChange={(e) => set('partnerName', e.target.value)} style={{ width: 320 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>제목 *</th>
                <td colSpan={3}><input className="ec-input" value={form.title} onChange={(e) => set('title', e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa', verticalAlign: 'top' }}>내용 *</th>
                <td colSpan={3}><textarea value={form.content} onChange={(e) => set('content', e.target.value)} style={{ width: '100%', height: 120, border: '1px solid var(--ec-border)', padding: 8, fontSize: 13, resize: 'vertical', outline: 'none' }} /></td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
            <button className="ec-btn" onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}</Modal>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>업무보고일 ▼</th>
              <th style={{ width: 44, textAlign: 'center' }}>요일</th>
              <th>부서</th>
              <th>거래처</th>
              <th>제목</th>
              <th>작성자</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>작성된 업무일지가 없습니다.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.reportDate}</td>
                <td style={{ textAlign: 'center' }}>{dow(r.reportDate)}</td>
                <td>{r.department ?? ''}</td>
                <td>{r.partnerName ?? ''}</td>
                <td>{r.title}</td>
                <td>{r.authorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '입력닫기' : '신규(F2)'}</button>
        <button className="ec-btn" onClick={() => { void doExcel() }}>Excel</button>
      </div>

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 420, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{TITLE} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                <li><b>신규(F2)</b> — 상단 입력폼을 열어 업무보고일·제목·내용으로 일지를 작성합니다.</li>
                <li><b>Search(F3)</b> — 제목·부서·거래처 등 입력한 낱말이 포함된 행만 추립니다.</li>
                <li><b>Excel</b> — 지금 화면에 보이는 업무일지 목록을 .xlsx 파일로 내려받습니다.</li>
                <li><b>Option</b> — 내려받기·인쇄·검색조건 초기화를 모아둔 메뉴입니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
