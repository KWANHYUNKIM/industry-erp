import { useEffect, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import EcPeriodPicks, { periodOf, ymd } from '../../components/EcPeriodPicks'

const WORKLOG_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월', '전월', '금년', '전년', '종료일', '최근3일+7일'] as const
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { useTableSort } from '../../utils/useTableSort'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'
import type { Project, WorkJournal } from '../../types/api'
import { useShortcut } from '../../utils/useShortcut'
import { inactiveDeptNames, showsJournal, type DeptRow } from '../../utils/inactiveDept'
import { dateText } from '../../utils/dateText'

const TITLE = '업무일지'

const today = () => ymd(new Date())
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dow = (d: string) => (d ? DOW[new Date(d).getDay()] : '')

/** 그룹웨어 > 업무관리 > 업무일지 — 실제 일지 목록 + 작성 */
export default function WorkLogPage() {
  const [rows, setRows] = useState<WorkJournal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ reportDate: today(), department: '', projectId: '', partnerName: '', title: '', content: '' })

  // 표 내보내기/인쇄/검색 직접 배선
  const bodyRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [projects, setProjects] = useState<Project[]>([])

  /*
   * 조회 조건. 원본 업무일지는 목록이 아니라 **조건 화면**이고, [검색(F8)] 을 눌러야 결과가 나온다.
   * 조건은 업무보고일(기간) · 요일 · 부서 · 프로젝트 · 거래처 · 제목 · 내용 · 최초작성자다.
   * 우리는 조건 없이 전부 뿌리고 있었다 — 일지가 쌓이면 못 쓴다.
   */
  const [cond, setCond] = useState(() => {
    const m = periodOf('최근3일+7일')!
    return { from: m.from, to: m.to, dow: '', department: '', projectId: '', partnerName: '', title: '', content: '', author: '' }
  })
  const setC = (k: keyof typeof cond, v: string) => setCond((c) => ({ ...c, [k]: v }))
  /**
   * 원본 조건 [기타]의 <b>[사용중단부서포함]</b>. 원본과 같이 기본은 꺼져 있다 —
   * 없어진 부서의 일지가 기본 화면에 계속 섞여 나오고 있었다.
   */
  const [withInactiveDept, setWithInactiveDept] = useState(false)
  const [inactiveDepts, setInactiveDepts] = useState<Set<string>>(new Set())
  /** 부서 코드도움 후보. 원본 조건의 [부서]도 자유입력이 아니라 [선택]이다. */
  const [depts, setDepts] = useState<DeptRow[]>([])

  /** 조건에 맞는 일지만. 문자열 조건은 부분일치 — 원본도 코드도움에서 고르되 부분일치로 찾는다. */
  const has = (v: string | null | undefined, q: string) => !q || (v ?? '').includes(q)
  const shown = rows.filter((r) =>
    (!cond.from || r.reportDate >= cond.from)
    && (!cond.to || r.reportDate <= cond.to)
    && (!cond.dow || dow(r.reportDate) === cond.dow)
    && has(r.department, cond.department)
    && (!cond.projectId || String(r.projectId ?? '') === cond.projectId)
    && has(r.partnerName, cond.partnerName)
    && has(r.title, cond.title)
    && has(r.content, cond.content)
    && has(r.authorName, cond.author)
    // 원본 조건 [기타]의 [사용중단부서포함]. 규칙은 utils/inactiveDept 에 있다 —
    // '마스터에 없으면 뺀다' 로 만들면 옛 부서명으로 적힌 일지가 통째로 사라진다.
    && showsJournal(r.department, inactiveDepts, withInactiveDept))

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

  // Search(F3) — 버튼 라벨이 약속한 단축키.
  // 훅은 반드시 컴포넌트 본문 최상위에서 부른다. 예전에 이 줄이 useState 초기화 함수
  // 안에 들어가 있었다 — 초기화는 첫 렌더에만 돌아서 두 번째 렌더에 훅 개수가 달라지고,
  // React 가 "Rendered fewer hooks than expected" 로 화면을 통째로 죽인다.
  useShortcut('F3', () => filterRows(search))

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
      const r = await api.get<WorkJournal[]>('/work-journals', { params: { from: cond.from || undefined, to: cond.to || undefined } })
      setRows(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* 기간을 서버로 보낸다 — 조건 판에 물어 놓고 전 기간을 받아 브라우저에서 걸렀다. */
  useEffect(() => { load() }, [cond.from, cond.to])

  useEffect(() => {
    let alive = true
    api.get<DeptRow[]>('/departments')
      .then((r) => { if (alive) { setDepts(r.data); setInactiveDepts(inactiveDeptNames(r.data)) } })
      .catch(() => { /* 못 받으면 아무것도 숨기지 않는다 */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
  }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    if (!form.content.trim()) return setError('내용을 입력하세요.')
    try {
      await api.post('/work-journals', {
        reportDate: form.reportDate,
        department: form.department || undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        partnerName: form.partnerName || undefined,
        title: form.title,
        content: form.content,
      })
      setForm({ reportDate: today(), department: '', projectId: '', partnerName: '', title: '', content: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    업무보고일: (r) => r.reportDate,
  })

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">업무일지</span>
        <div className="ml-auto flex items-center gap-[4px] relative">
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
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41, background: '#fff', border: '1px solid var(--ec-line)', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: 4 }}>
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

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <Modal error={error} open={showForm} title="신규 등록" onClose={() => setShowForm(false)}>{(
        <div className="border border-ec-line border-solid bg-white p-[16px] mb-[10px]">
          <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">업무일지 작성</div>
          <table className="w-full text-left mb-[10px]">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">업무보고일</th>
                <td><input className="ec-input" type="date" value={form.reportDate} onChange={(e) => set('reportDate', e.target.value)} style={{ width: 150 }} /> <span className="text-ec-hint">({dow(form.reportDate)})</span></td>
                <th className="w-[90px] bg-ec-page">부서</th>
                <td><input className="ec-input" value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="미입력시 소속부서" style={{ width: 160 }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">프로젝트</th>
                <td>
                  <CodePickerField label="프로젝트" hideLabel width={200} value={form.projectId}
                                   onChange={(v) => set('projectId', v)}
                                   items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
                </td>
                <th className="bg-ec-page">거래처</th>
                <td><input className="ec-input" value={form.partnerName} onChange={(e) => set('partnerName', e.target.value)} style={{ width: 200 }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">제목 *</th>
                <td colSpan={3}><input className="ec-input" value={form.title} onChange={(e) => set('title', e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page align-top">내용 *</th>
                <td colSpan={3}><textarea value={form.content} onChange={(e) => set('content', e.target.value)} style={{ width: '100%', height: 120, border: '1px solid var(--ec-border)', padding: 8, fontSize: 13, resize: 'vertical', outline: 'none' }} /></td>
              </tr>
            </tbody>
          </table>
          <div className="flex gap-[6px]">
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
            <button className="ec-btn" onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}</Modal>

      {/*
        원본 조회 조건 — 업무보고일(기간) · 요일 · 부서 · 프로젝트 · 거래처 · 제목 · 내용 · 최초작성자.
        그 아래에 [검색(F8)] 과 기간 빠른선택 버튼줄이 붙는다.
      */}
      <ul className="ec-form" style={{ marginBottom: 8 }}>
        <li className="wide">
          <div className="title">업무보고일</div>
          <div className="form gap-[6px]">
            <input type="date" className="ec-input" value={cond.from} onChange={(e) => setC('from', e.target.value)} style={{ width: 150 }} />
            <span>~</span>
            <input type="date" className="ec-input" value={cond.to} onChange={(e) => setC('to', e.target.value)} style={{ width: 150 }} />
          </div>
        </li>
        <li>
          <div className="title">요일</div>
          <div className="form">
            <select className="ec-input" value={cond.dow} onChange={(e) => setC('dow', e.target.value)} style={{ width: 120 }}>
              <option value="">전체</option>
              {DOW.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </li>
        {/*
          원본 조건의 [부서]는 자유입력이 아니라 [선택](코드도움)이다.
          [사용중단부서포함]을 끄면 후보에서도 빠진다 — 목록에서 고를 수 있는데
          고르면 아무것도 안 나오는 부서를 남겨 두면 사람이 화면을 의심한다.
          값은 id 가 아니라 <b>부서명</b>이다. 업무일지가 부서를 이름으로 들고 있어서다.
        */}
        <li>
          <div className="title">부서</div>
          <div className="form">
            <CodePickerField
              label="부서" hideLabel fill value={cond.department}
              onChange={(v) => setC('department', v)}
              items={depts.filter((d) => withInactiveDept || d.active)
                .map((d) => ({ value: d.name, code: d.code ?? '', name: d.name }))}
            />
          </div>
        </li>
        <li>
          <div className="title">프로젝트</div>
          <div className="form">
            <CodePickerField label="프로젝트" hideLabel fill value={cond.projectId}
                             onChange={(v) => setC('projectId', v)}
                             items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
          </div>
        </li>
        <li>
          <div className="title">거래처</div>
          <div className="form"><input className="ec-input" value={cond.partnerName} onChange={(e) => setC('partnerName', e.target.value)} style={{ width: '100%' }} /></div>
        </li>
        <li>
          <div className="title">제목</div>
          <div className="form"><input className="ec-input" value={cond.title} onChange={(e) => setC('title', e.target.value)} style={{ width: '100%' }} /></div>
        </li>
        <li>
          <div className="title">내용</div>
          <div className="form"><input className="ec-input" value={cond.content} onChange={(e) => setC('content', e.target.value)} style={{ width: '100%' }} /></div>
        </li>
        <li>
          <div className="title">최초작성자</div>
          <div className="form"><input className="ec-input" value={cond.author} onChange={(e) => setC('author', e.target.value)} style={{ width: '100%' }} /></div>
        </li>
        {/* 원본 조건 판의 [기타] 칸. 원본도 기본은 꺼져 있다. */}
        <li>
          <div className="title">기타</div>
          <div className="form">
            <label className="text-[12.5px] inline-flex items-center gap-[4px] cursor-pointer">
              <input type="checkbox" checked={withInactiveDept}
                     onChange={(e) => setWithInactiveDept(e.target.checked)} />
              사용중단부서포함
            </label>
          </div>
        </li>
      </ul>

      {/* 원본 하단: 검색(F8) + 기간 빠른선택 + 다시 작성 */}
      <div className="flex flex-wrap gap-[4px] items-center mb-[10px]">
        <button className="ec-btn ec-btn-primary" onClick={() => flash(`조회 결과 ${shown.length}건`)}>검색(F8)</button>
        {/* 원본 업무일지 빠른선택(2026-10-03 실측): 금일 · 전일 · 금주(~오늘) · 전주 · 금월 · 전월 · 금년 · 전년 · <b>종료일</b> · 최근3일+7일.
            공용 기본 묶음(JOURNAL_PICKS)에는 [종료일]이 없어 이 화면만 따로 넘긴다 — 공용 기본을 바꾸면 다른 화면이 같이 바뀐다. */}
        <EcPeriodPicks labels={WORKLOG_PICKS} onPick={(r) => setCond((c) => ({ ...c, from: r.from, to: r.to }))} />
        <button
          className="ec-btn"
          onClick={() => {
            setCond({ from: periodOf('최근3일+7일')!.from, to: periodOf('최근3일+7일')!.to, dow: '', department: '', projectId: '', partnerName: '', title: '', content: '', author: '' })
            setWithInactiveDept(false)
          }}
        >
          다시 작성
        </button>
      </div>

      <div ref={bodyRef} className="flex-1 min-h-0">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="cursor-pointer" onClick={() => sort.toggle('업무보고일')}>업무보고일 {sort.mark('업무보고일')}</th>
              <th className="w-[44px] text-center">요일</th>
              <th>부서</th>
              <th>프로젝트</th>
              <th>거래처</th>
              <th>제목</th>
              <th>작성자</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : sort.sorted.map((r, i) => (
              <tr key={r.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{dateText(r.reportDate)}</td>
                <td className="text-center">{dow(r.reportDate)}</td>
                <td>{r.department ?? ''}</td>
                <td>{r.projectName ?? ''}</td>
                <td>{r.partnerName ?? ''}</td>
                <td>{r.title}</td>
                <td>{r.authorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-[6px] mt-[10px] pt-[8px] border-t border-t-ec-line-soft border-solid">
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '입력닫기' : '신규(F2)'}</button>
        <button className="ec-btn" onClick={() => { void doExcel() }}>Excel</button>
      </div>

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 420, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
              <span>{TITLE} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div className="p-[14px] text-[12.5px] leading-[1.7] text-ec-text">
              <ul className="pl-[16px] m-0">
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
