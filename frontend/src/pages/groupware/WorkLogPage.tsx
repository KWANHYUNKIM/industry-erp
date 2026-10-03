import { Fragment, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcPeriodPicks, { periodOf, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Project, WorkJournal } from '../../types/api'
import { useAuth } from '../../features/auth/AuthContext'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { inactiveDeptNames, showsJournal, type DeptRow } from '../../utils/inactiveDept'
import { openPrintWindow, fillAndPrint } from '../../utils/print'
import { escapeHtml } from '../../utils/escapeHtml'

const WORKLOG_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월', '전월', '금년', '전년', '종료일', '최근3일+7일'] as const

const today = () => ymd(new Date())
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dow = (d: string) => (d ? DOW[new Date(`${d}T00:00:00`).getDay()] : '')
const pad2 = (n: number) => String(n).padStart(2, '0')
/** 격자 머리 '10/05(월)'. */
const dayHead = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}(${dow(d)})`
/** 원본 '조회' 머리의 작성 시각 — '2026/10/03 오후 6:20:13'. */
const stampText = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${d.toLocaleTimeString('ko-KR')}`
}
/** from ~ to 의 날짜(요일 조건이 있으면 그 요일만). 너무 긴 기간은 1년으로 자른다. */
function daysOf(from: string, to: string, onlyDow: string): string[] {
  if (!from || !to || from > to) return []
  const out: string[] = []
  const d = new Date(`${from}T00:00:00`)
  for (let i = 0; i < 366 && ymd(d) <= to; i++) {
    const s = ymd(d)
    if (!onlyDow || dow(s) === onlyDow) out.push(s)
    d.setDate(d.getDate() + 1)
  }
  return out
}

type Form = { reportDate: string; department: string; partnerName: string; projectId: string; title: string; content: string }
const emptyForm = (): Form => ({ reportDate: today(), department: '', partnerName: '', projectId: '', title: '', content: '' })

/**
 * 그룹웨어 > 업무관리 > 업무일지 (이카운트 E070304)
 *
 * <p><b>2026-10-03 원본에 QA그룹웨어-일지를 넣어 재고 지웠다.</b> 원본 업무일지의 결과는 목록이 아니라
 * <b>부서 × 일자 격자</b>다 — 줄은 부서(회계팀 · 인사팀 …), 칸은 업무보고일 기간의 날마다 '10/05(월)' 머리 아래
 * 두 칸(제목 150 · 빈 칸 30). 일지 제목이 그 부서 · 그날 칸에 가운데 링크로 찍히고, 기간이 길면 표가 옆으로 민다.
 * [요일] 조건을 걸면 그 요일 칸만 남는다(회사가 저장해 둔 '업무일지' 탭은 월요일만). 하단은 [신규(F2)] 하나.
 *
 * <p>[신규(F2)] → '업무일지게시글작성': 작성자 · 업무보고일 · 부서 · 거래처 · 프로젝트 · 제목 · 첨부 · 본문,
 * [저장(F8)][닫기]. 본문 없이도 저장된다. 제목을 누르면 '조회' 창 — 머리 '8 QA그룹웨어-일지 guest 2026/10/03 오후 6:20:13',
 * 업무보고일 : 20261005 · 부서 · 거래처 · 프로젝트, [삭제]는 '게시글을 삭제하면 복구할 수 없습니다. 삭제하겠습니까?'.
 * 우리는 일지 목록 하나였고 고치거나 지울 길이 없었다(서버에 PUT · DELETE 를 더했다).
 *
 * <p>두지 않은 것: 조회 창의 답글(F8) · 복사 · 답변 · R · 답글펼치기, 입력 창의 첨부 · 서식 편집기, 격자 둘째 칸의 쓰임(원본도 비어 있었다).
 */
export default function WorkLogPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<WorkJournal[]>([])
  const [error, setError] = useState('')
  const [view, setView] = useState<'cond' | 'result'>('cond')
  const [projects, setProjects] = useState<Project[]>([])
  /** 부서 마스터 — 격자의 줄이고 조건 [부서]의 후보다. */
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [inactiveDepts, setInactiveDepts] = useState<Set<string>>(new Set())

  /* 원본 조건 차례: 업무보고일 · 요일 · 부서 · 프로젝트 · 거래처 · 제목 · 내용 · 최초작성자 · 기타. */
  const initCond = () => {
    const m = periodOf('최근3일+7일')!
    return { from: m.from, to: m.to, dow: '', department: '', projectId: '', partnerName: '', title: '', content: '', author: '' }
  }
  const [cond, setCond] = useState(initCond)
  const setC = (k: keyof ReturnType<typeof initCond>, v: string) => setCond((c) => ({ ...c, [k]: v }))
  /** 원본 [기타]의 [사용중단부서포함] — 기본은 꺼져 있다. */
  const [withInactiveDept, setWithInactiveDept] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const [viewing, setViewing] = useState<WorkJournal | null>(null)

  useEffect(() => {
    api.get<DeptRow[]>('/departments')
      .then((r) => { setDepts(r.data); setInactiveDepts(inactiveDeptNames(r.data)) })
      .catch(() => { /* 못 받으면 일지에 적힌 부서만 줄로 세운다 */ })
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
  }, [])

  async function search() {
    setError('')
    try {
      const r = await api.get<WorkJournal[]>('/work-journals', { params: { from: cond.from || undefined, to: cond.to || undefined } })
      setRows(r.data)
      setView('result')
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useShortcut('F8', () => void search(), view === 'cond' && !showForm && !viewing)
  useShortcut('F8', () => void submit(), showForm)

  const has = (v: string | null | undefined, q: string) => !q || (v ?? '').includes(q)
  const shown = rows.filter((r) =>
    (!cond.dow || dow(r.reportDate) === cond.dow)
    && has(r.department, cond.department)
    && (!cond.projectId || String(r.projectId ?? '') === cond.projectId)
    && has(r.partnerName, cond.partnerName)
    && has(r.title, cond.title)
    && has(r.content, cond.content)
    && has(r.authorName, cond.author)
    && showsJournal(r.department, inactiveDepts, withInactiveDept))

  /** 격자의 줄 — 부서 마스터 차례, 그 뒤에 마스터에 없는 이름으로 적힌 일지의 부서. */
  const deptRows = (() => {
    const names = depts.filter((d) => withInactiveDept || d.active).map((d) => d.name)
    for (const r of shown) if (r.department && !names.includes(r.department)) names.push(r.department)
    return cond.department ? names.filter((n) => n.includes(cond.department)) : names
  })()
  const days = daysOf(cond.from, cond.to, cond.dow)
  const gridRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(gridRef, '업무일지 부서×일자', [view, days.length, deptRows.length])

  function openNew() {
    setEditId(null)
    setForm(emptyForm())
    setError('')
    setShowForm(true)
  }
  function openEdit(r: WorkJournal) {
    setViewing(null)
    setEditId(r.id)
    setForm({
      reportDate: r.reportDate, department: r.department ?? '', partnerName: r.partnerName ?? '',
      projectId: r.projectId != null ? String(r.projectId) : '', title: r.title, content: r.content ?? '',
    })
    setError('')
    setShowForm(true)
  }

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    const body = {
      reportDate: form.reportDate,
      department: form.department || undefined,
      partnerName: form.partnerName || undefined,
      projectId: form.projectId ? Number(form.projectId) : undefined,
      title: form.title,
      content: form.content,
    }
    try {
      if (editId != null) await api.put(`/work-journals/${editId}`, body)
      else await api.post('/work-journals', body)
      setShowForm(false)
      if (view === 'result') void search()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(r: WorkJournal) {
    if (!window.confirm('게시글을 삭제하면 복구할 수 없습니다.\n삭제하겠습니까?')) return
    try {
      await api.delete(`/work-journals/${r.id}`)
      setViewing(null)
      void search()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  function printOne(r: WorkJournal) {
    const win = openPrintWindow()
    if (!win) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>업무일지</title></head><body>
<h1>${escapeHtml(r.title)}</h1><p>${escapeHtml(r.authorName)} ${escapeHtml(stampText(r.createdAt))}</p>
<p>업무보고일 : ${r.reportDate.replace(/-/g, '')}<br>부서 : ${escapeHtml(r.department ?? '')}<br>거래처 : ${escapeHtml(r.partnerName ?? '')}<br>프로젝트 : ${escapeHtml(r.projectName ?? '')}</p>
<pre>${escapeHtml(r.content ?? '')}</pre></body></html>`)
  }

  const deptItems = depts.filter((d) => withInactiveDept || d.active).map((d) => ({ value: d.name, code: d.code ?? '', name: d.name }))
  const projectItems = projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))

  return (
    <EcListShell title="업무일지" searchable={view === 'result'} onSearch={() => setView('cond')}
                 onNew={view === 'result' ? openNew : undefined}>
      {error && !showForm && !viewing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {view === 'cond' ? (
        <div>
          <ul className="ec-form">
            <li className="wide">
              <div className="title">업무보고일</div>
              <div className="form">
                <input type="date" className="ec-input w-[150px]" value={cond.from} onChange={(e) => setC('from', e.target.value)} />
                <span className="text-ec-label">~</span>
                <input type="date" className="ec-input w-[150px]" value={cond.to} onChange={(e) => setC('to', e.target.value)} />
              </div>
            </li>
            <li className="wide">
              <div className="title">요일</div>
              <div className="form">
                <select className="ec-input w-[120px]" aria-label="요일" value={cond.dow} onChange={(e) => setC('dow', e.target.value)}>
                  <option value="">전체</option>
                  {DOW.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </li>
            <li className="wide">
              <div className="title">부서</div>
              <div className="form"><CodePickerField label="부서" hideLabel fill value={cond.department} onChange={(v) => setC('department', v)} items={deptItems} /></div>
            </li>
            <li className="wide">
              <div className="title">프로젝트</div>
              <div className="form"><CodePickerField label="프로젝트" hideLabel fill value={cond.projectId} onChange={(v) => setC('projectId', v)} items={projectItems} /></div>
            </li>
            <li className="wide">
              <div className="title">거래처</div>
              <div className="form"><input className="ec-input w-full" placeholder="거래처" value={cond.partnerName} onChange={(e) => setC('partnerName', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">제목</div>
              <div className="form"><input className="ec-input w-full" placeholder="제목" value={cond.title} onChange={(e) => setC('title', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">내용</div>
              <div className="form"><input className="ec-input w-full" placeholder="내용" value={cond.content} onChange={(e) => setC('content', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">최초작성자</div>
              <div className="form"><input className="ec-input w-full" placeholder="최초작성자" value={cond.author} onChange={(e) => setC('author', e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">기타</div>
              <div className="form">
                <label className="inline-flex items-center gap-[4px] cursor-pointer">
                  <input type="checkbox" checked={withInactiveDept} onChange={(e) => setWithInactiveDept(e.target.checked)} />
                  사용중단부서포함
                </label>
              </div>
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-[6px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
            {/* 원본 빠른선택: 금일 · 전일 · 금주(~오늘) · 전주 · 금월 · 전월 · 금년 · 전년 · 종료일 · 최근3일+7일 */}
            <EcPeriodPicks labels={WORKLOG_PICKS} onPick={(r) => setCond((c) => ({ ...c, from: r.from || c.from, to: r.to }))} />
            <button type="button" className="ec-btn" onClick={() => { setCond(initCond()); setWithInactiveDept(false) }}>다시 작성</button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table ref={gridRef} className="table-fixed">
            <thead>
              <tr>
                <th className="w-[150px] text-center">부서</th>
                {days.map((d) => <th key={d} colSpan={2} className="w-[180px] text-center">{dayHead(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {deptRows.map((name) => (
                <tr key={name}>
                  <td className="w-[150px]">{name}</td>
                  {days.map((d) => {
                    const hits = shown.filter((r) => r.department === name && r.reportDate === d)
                    return (
                      <Fragment key={d}>
                        <td className="w-[150px] text-center">
                          {hits.map((r) => (
                            <button key={r.id} type="button" onClick={() => setViewing(r)}
                                    className="no-ec block w-full bg-transparent border-0 p-0 cursor-pointer text-center text-ec-navy truncate">
                              {r.title}
                            </button>
                          ))}
                        </td>
                        <td className="w-[30px]" />
                      </Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 원본 '업무일지게시글작성' */}
      <Modal error={error} open={showForm} title="업무일지게시글작성" width={780} onClose={() => setShowForm(false)}>
        <div className="text-right text-[12px] text-ec-ink mb-[6px]">작성자 : {user?.name ?? ''}</div>
        <ul className="ec-form mb-[10px]">
          <li>
            <div className="title">업무보고일</div>
            <div className="form"><input type="date" className="ec-input w-[150px]" value={form.reportDate} onChange={(e) => setF('reportDate', e.target.value)} /></div>
          </li>
          <li>
            <div className="title">부서</div>
            <div className="form"><CodePickerField label="부서" hideLabel fill value={form.department} onChange={(v) => setF('department', v)} items={deptItems} /></div>
          </li>
          <li>
            <div className="title">거래처</div>
            <div className="form"><input className="ec-input w-full" placeholder="거래처" value={form.partnerName} onChange={(e) => setF('partnerName', e.target.value)} /></div>
          </li>
          <li>
            <div className="title">프로젝트</div>
            <div className="form"><CodePickerField label="프로젝트" hideLabel fill value={form.projectId} onChange={(v) => setF('projectId', v)} items={projectItems} /></div>
          </li>
          <li className="wide">
            <div className="title">제목</div>
            <div className="form"><input className="ec-input w-full" placeholder="제목" value={form.title} onChange={(e) => setF('title', e.target.value)} /></div>
          </li>
        </ul>
        <textarea className="ec-input w-full h-[200px] py-[8px] resize-y" aria-label="본문" value={form.content}
                  onChange={(e) => setF('content', e.target.value)} />
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
        </div>
      </Modal>

      {/* 원본 '조회' */}
      <Modal error={error} open={!!viewing} title="조회" width={780} onClose={() => setViewing(null)}>
        {viewing && (
          <>
            <div className="flex flex-wrap items-baseline gap-[9px] py-[6px] px-[9px] bg-ec-page rounded-ec">
              <span>{viewing.id}</span>
              <b>{viewing.title}</b>
              <span className="text-ec-navy">{viewing.authorName}</span>
              <span>{stampText(viewing.createdAt)}</span>
            </div>
            <div className="py-[9px] px-[9px] text-[12px] leading-[1.8]">
              <div>업무보고일 : {viewing.reportDate.replace(/-/g, '')}</div>
              <div>부서 : {viewing.department ?? ''}</div>
              <div>거래처 : {viewing.partnerName ?? ''}</div>
              <div>프로젝트 : {viewing.projectName ?? ''}</div>
              <div className="whitespace-pre-wrap mt-[6px]">{viewing.content ?? ''}</div>
            </div>
            <div className="flex gap-[6px] mt-[10px]">
              <button type="button" className="ec-btn" onClick={() => openEdit(viewing)}>수정</button>
              <button type="button" className="ec-btn" onClick={() => void remove(viewing)}>삭제</button>
              <button type="button" className="ec-btn" onClick={() => printOne(viewing)}>인쇄</button>
              <button type="button" className="ec-btn" onClick={() => setViewing(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
