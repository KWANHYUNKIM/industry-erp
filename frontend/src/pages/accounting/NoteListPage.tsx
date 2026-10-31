import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { dateNo } from '../../utils/dateNo'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import EcDateField from '../../components/EcDateField'
import { useCondPickers } from '../../utils/useCondPickers'
import { ymd } from '../../components/EcPeriodPicks'
import type { NoteSummary, NoteType, PromissoryNote } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { useRequired } from '../../utils/useRequired'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmount } from '../../utils/format'


/** 원본 [내역만등록]으로 넣은 어음은 분개가 없다(recordOnly). 감소로 닫으면 상태 RECORD_DECREASED('어음만감소'). */
type Note = PromissoryNote & { issueVia?: string | null; issueJournalEntryId?: number | null;   recordOnly?: boolean; departmentId?: number | null; projectId?: number | null
  /** [내역만등록] 감소 줄의 자기 적요 · 부서 · 프로젝트(V361) — 원본 감소 줄은 증가 쪽이 아니라 이 값을 찍는다. */
  closeRemark?: string | null; closeDepartmentId?: number | null; closeProjectId?: number | null
  /** 받을어음감소(E010602) 한 장 전표 — 있으면 감소 줄 거래유형 '받을어음감소' · 일자를 누르면 감소 수정 창 */
  closeJournalEntryId?: number | null
  /** 'VOUCHER' — 받을어음 · 지급어음일괄감소 [입금보고서작성] · [지출결의서작성] 으로 닫힘. 감소 줄 거래유형 '입금보고서' · '지출결의서'(결의서를 지우면 보유로). */
  closeVia?: string | null
}
const recordDecreased = (n: Note) => (n.status as string) === 'RECORD_DECREASED'
/** 받을어음거래처지급(E010603)으로 닫힌 어음 — 감소 줄 거래유형 '받을어음거래처지급', 일자를 누르면 거래처지급 수정 창. */
const endorsed = (n: Note) => (n.status as string) === 'ENDORSED'
const byVoucher = (n: Note) => n.closeVia === 'VOUCHER'
/** 한 장 입력 · 결의서로 닫힌 감소 줄의 거래유형 */
const closeKind = (n: Note, receivable: boolean) => byVoucher(n) ? (receivable ? '입금보고서' : '지출결의서')
  : endorsed(n) ? '받을어음거래처지급' : receivable ? '받을어음감소' : '지급어음감소'
/** 어음 한 장이 남기는 움직임 — 받은(발행한) 날 증가, 손을 떠난 날(결제 · 할인 · 부도) 감소. */
interface Move { key: string; date: string; inc: boolean; n: Note }
/** 그 줄의 적요 · 부서 · 프로젝트 — 감소 줄은 감소 때 적은 값. */
const lineRemark = (m: Move) => (m.inc ? m.n.remark : m.n.closeRemark) ?? ''
const lineDept = (m: Move) => String((m.inc ? m.n.departmentId : m.n.closeDepartmentId) ?? '')
const lineProject = (m: Move) => String((m.inc ? m.n.projectId : m.n.closeProjectId) ?? '')
/** 내역만등록 창의 한 줄 */
interface RecLine { noteNo: string; amount: string; dueDate: string; dept: string; project: string; remark: string }

/**
 * 회계 I &gt; 어음거래 &gt; 받을어음 &gt; <b>받을어음조회</b>(E010622) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>) · 만기일자(구간, 옆 [사용] 체크로 켠다 — 기본 꺼짐) · 어음번호 ·
 * 증감구분(전체 · 어음증가 · 어음감소, 다 켜짐) · 거래유형 · 입력구분(전체 · 연결전표 · 직접입력, 다 켜짐) · 거래처 · 부서 · 프로젝트 · 적요 ·
 * 최초작성자 · 최종수정자. 열: 일자 · 어음번호 · 증감구분 · 거래처명 · 금액 · 만기일자 · 적요 · 거래유형 · 회계전표일자-No.
 * 버튼줄 받을어음증가 · 내역만등록 · 선택삭제 · Excel. 수령수표조회와 같은 판이다.
 *
 * <p>한 줄은 어음이 아니라 <b>움직임</b>이다 — 받은 날 '어음증가', 결제 · 할인 · 부도로 손을 떠난 날 '어음감소'.
 * 우리 어음은 모두 어음등록 화면에서 직접 적어 입력구분은 늘 '직접입력'이다. 부서 · 프로젝트는 [내역만등록]에서 적은 것만 든다.
 * <b>회계전표일자-No.</b>: 증가 줄은 수취/발행 분개(출처 어음 · 그 어음 id), 감소 줄은 닫힌 날 적요에 어음번호가 든 분개
 * (만기결제 · 할인 입금은 계좌 입출금이, 부도는 어음이 만든다 — JournalService.createFromNote 주석).
 * 첫 칸 체크로 골라 <b>[선택삭제]</b> — 보유 중인 어음만 지워진다(서버가 막는다, 수취 분개도 같이 지운다).
 * <b>지급어음조회</b>(E010630)도 같은 판이다(type).
 */
export default function NoteListPage({ type }: { type: NoteType }) {
  const receivable = type === 'RECEIVABLE'
  const title = receivable ? '받을어음조회' : '지급어음조회'
  const navigate = useNavigate()
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [useDue, setUseDue] = useState(false)
  const [dueFrom, setDueFrom] = useState(init.from)
  const [dueTo, setDueTo] = useState(init.to)
  const [noteNo, setNoteNo] = useState('')
  const [showInc, setShowInc] = useState(true)
  const [showDec, setShowDec] = useState(true)
  const [kind, setKind] = useState('')
  const [direct, setDirect] = useState(true)
  const [partner, setPartner] = useState('')
  const [remark, setRemark] = useState('')
  const [author, setAuthor] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const [notes, setNotes] = useState<Note[]>([])
  /* 원본 [내역만등록] '받을어음내역입력' 창(2026-10-13 실측) — 전표일자 · 전표구분 · 거래처코드 · 계정코드 + 격자. */
  const pickers = useCondPickers(['partners'])
  const blankLine = (): RecLine => ({ noteNo: '', amount: '', dueDate: ymd(new Date()), dept: '', project: '', remark: '' })
  const [recOpen, setRecOpen] = useState(false)
  const [recDate, setRecDate] = useState(ymd(new Date()))
  const [recPartner, setRecPartner] = useState('')
  /** 원본 [전표구분] 증가 · 감소. 감소 격자는 만기일자 열이 없다(어음번호 · 금액 · 부서 · 프로젝트 · 적요). */
  const [recDec, setRecDec] = useState(false)
  const [recLines, setRecLines] = useState<RecLine[]>([blankLine(), blankLine(), blankLine()])
  const [recError, setRecError] = useState('')
  const req = useRequired()
  const recName = receivable ? '받을어음내역입력' : '지급어음내역입력'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 어음 줄 → 회계전표일자-No. 를 찾으려고 같은 기간의 회계전표를 받는다. */
  const [journals, setJournals] = useState<{ id: number; docNo: string; entryDate: string; description: string | null; sourceType: string; sourceId: number | null }[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)

  /* 감소는 닫힌 날로 걸어야 해 기간 끝날까지 받은(발행한) 어음을 다 받아 화면에서 날짜로 다시 거른다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, j] = await Promise.all([
        api.get<NoteSummary>('/notes', { params: { to } }),
        api.get<{ rows: typeof journals }>('/journals', { params: { from, to, all: true } }).catch(() => ({ data: { rows: [] as typeof journals } })),
      ])
      setNotes(r.data.notes)
      setJournals(j.data.rows)
      setChecked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, type])

  const ofType = useMemo(() => notes.filter((n) => n.type === type), [notes, type])
  /* 원본 거래유형(2026-10-13 실측): 받을어음증가 화면으로 넣은 것 '받을어음증가', [내역만등록] 증가 '어음만증가' · 감소 '어음만감소'. */
  const kindOf = (m: Move) => (m.inc ? (m.n.issueVia === 'VOUCHER' ? (receivable ? '입금보고서' : '지출결의서') : m.n.recordOnly ? '어음만증가' : receivable ? '받을어음증가' : '지급어음증가') : m.n.closeJournalEntryId ? closeKind(m.n, receivable) : m.n.statusName)
  /** 감소 줄 [일자] 가 여는 수정 창 — 거래처지급 · 받을어음감소 · 지급어음감소. */
  /** 증가 줄 [일자] → 증가 수정 창(원본 2026-10-21 — 보유 중인 증가만, 내역만등록 줄은 체크해 지운다). */
  const incPath = receivable ? 'notes-increase' : 'notes-pay-increase'
  const editPathOf = (n: Note) => endorsed(n) ? 'notes-endorse' : receivable ? 'notes-decrease' : 'notes-pay-decrease'
  /** 원본 [일자] '2026/10/13-2' — 그날 넣은 어음 중 몇 번째(id 차례). 감소 줄은 날짜만. */
  const dayNo = (m: Move) => {
    if (!m.inc) return dateText(m.date)
    const seq = ofType.filter((x) => x.issueDate === m.n.issueDate && x.id <= m.n.id).length
    return `${dateText(m.date)}-${seq}`
  }
  const moves = useMemo(() => {
    const out: Move[] = []
    for (const n of ofType) {
      out.push({ key: `${n.id}-i`, date: n.issueDate, inc: true, n })
      if (n.closedDate) out.push({ key: `${n.id}-d`, date: n.closedDate, inc: false, n })
    }
    return out
      .filter((m) => m.date >= from && m.date <= to)
      .filter((m) => !useDue || (m.n.dueDate >= dueFrom && m.n.dueDate <= dueTo))
      .filter((m) => !noteNo || m.n.noteNo.includes(noteNo))
      .filter((m) => (m.inc ? showInc : showDec))
      .filter((m) => !kind || kindOf(m) === kind)
      .filter(() => direct)
      .filter((m) => !partner || String(m.n.partnerId) === partner)
      .filter((m) => !remark || lineRemark(m).includes(remark))
      .filter((m) => !author || (m.n.createdBy ?? '') === author)
      .filter((m) => !dept || lineDept(m) === dept)
      .filter((m) => !project || lineProject(m) === project)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.n.noteNo.localeCompare(b.n.noteNo) || (a.inc ? -1 : 1)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofType, from, to, useDue, dueFrom, dueTo, noteNo, showInc, showDec, kind, direct, partner, remark, author, dept, project])
  const partners = useMemo(() => {
    const m = new Map<number, string>()
    ofType.forEach((n) => m.set(n.partnerId, n.partnerName))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), name }))
  }, [ofType])
  const authors = useMemo(() => [...new Set(ofType.map((n) => n.createdBy).filter(Boolean) as string[])].sort(), [ofType])
  const kinds = useMemo(() => [...new Set([receivable ? '받을어음증가' : '지급어음증가', '어음만증가', ...ofType.filter((n) => n.closedDate).map((n) => n.closeJournalEntryId ? closeKind(n, receivable) : n.statusName)])], [ofType, receivable])
  /** 회계전표일자-No. — '2026/10/13 -3'. 증가는 출처(어음 · id), 감소는 닫힌 날 적요의 어음번호로 찾는다. */
  const journalOf = (m: Move) => {
    if (!m.inc && recordDecreased(m.n)) return ''
    const j = m.inc
      ? (m.n.issueJournalEntryId ? journals.find((x) => x.id === m.n.issueJournalEntryId) : journals.find((x) => x.sourceType === 'NOTE' && x.sourceId === m.n.id))
      : m.n.closeJournalEntryId ? journals.find((x) => x.id === m.n.closeJournalEntryId)
      : journals.find((x) => x.entryDate === m.date && (x.description ?? '').includes(m.n.noteNo))
    return j ? dateNo(j.entryDate, j.docNo) : ''
  }
  const picked = moves.filter((m) => checked.has(m.key))
  /* 원본은 회계전표가 붙은 줄을 체크할 수 없다(받을어음증가 줄을 눌러도 체크되지 않고 '리스트에 선택된 자료가 없습니다.').
     전표 있는 어음은 회계거래조회에서 전표째 지운다. [내역만등록] 줄만 고를 수 있다 — 감소 줄을 지우면 어음이 다시 보유로 돌아온다. */
  const selectable = (m: Move) => (m.inc ? !!m.n.recordOnly && m.n.status === 'HELD' : recordDecreased(m.n))

  async function saveRecord() {
    setRecError('')
    /* 원본(2026-10-21 받을어음조회 [내역만등록] 실측): 빈 저장은 글 없이 거래처코드 · 계정코드 · 첫 줄 어음번호 · 금액 칸만
       빨간 테두리(말풍선 글 없음). 줄을 하나라도 적었으면 그 줄의 빈 금액(감소면 어음번호도)만 두른다. */
    const used = recLines.map((_, i) => i).filter((i) => recLines[i].noteNo.trim() || Number(recLines[i].amount) > 0)
    const rows = used.length ? used : [0]
    const need: Record<string, boolean> = { partner: !!recPartner }
    for (const i of rows) {
      if (recDec || !used.length) need[`no${i}`] = !!recLines[i].noteNo.trim()
      need[`amt${i}`] = Number(recLines[i].amount) > 0
    }
    if (!req.check(need)) return
    const lines = used.map((i) => recLines[i])
    try {
      for (const l of lines) {
        if (recDec) await api.post('/notes/record-decrease', { type, noteNo: l.noteNo.trim(), date: recDate, remark: l.remark.trim() || undefined,
          departmentId: l.dept ? Number(l.dept) : undefined, projectId: l.project ? Number(l.project) : undefined })
        else await api.post('/notes', { type, partnerId: Number(recPartner), issueDate: recDate, dueDate: l.dueDate,
          amount: Number(l.amount), remark: l.remark.trim() || undefined, recordOnly: true, noteNo: l.noteNo.trim() || undefined,
          departmentId: l.dept ? Number(l.dept) : undefined, projectId: l.project ? Number(l.project) : undefined })
      }
      setRecOpen(false)
      setRecLines([blankLine(), blankLine(), blankLine()])
      await load()
    } catch (e) {
      setRecError(extractErrorMessage(e))
    }
  }

  /** 원본 [선택삭제]. 증가 줄은 어음을 지우고, 감소 줄은 어음을 다시 보유로 돌린다(감소를 먼저). */
  async function removeChecked() {
    setConfirmDelete(false)
    if (picked.length === 0) { setError('지울 줄을 고르세요.'); return }
    setError('')
    const decs = picked.filter((m) => !m.inc).map((m) => () => api.delete(`/notes/${m.n.id}/record-decrease`))
    const incs = picked.filter((m) => m.inc).map((m) => () => api.delete(`/notes/${m.n.id}`))
    const ids = [...decs, ...incs]
    const results: PromiseSettledResult<unknown>[] = []
    for (const run of ids) results.push(await run().then((v) => ({ status: 'fulfilled', value: v }) as const, (reason) => ({ status: 'rejected', reason }) as const))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    await load()
    if (failed.length > 0) setError(`${ids.length - failed.length}건 삭제, ${failed.length}건 실패 — ${extractErrorMessage(failed[0].reason)}`)
  }

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [moves.length])

  const box = (label: string, checked: boolean, set: (v: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setUseDue(false); setNoteNo(''); setShowInc(true); setShowDec(true); setKind(''); setDirect(true); setPartner(''); setDept(''); setProject(''); setRemark(''); setAuthor('') } },
        { label: receivable ? '받을어음증가' : '지급어음증가', onClick: () => navigate(receivable ? '/accounting/notes-increase' : '/accounting/notes-pay-increase') },
        { label: '내역만등록', onClick: () => { setRecError(''); req.reset(); setRecDate(ymd(new Date())); setRecDec(false); setRecOpen(true) } },
        { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: () => setConfirmDelete(true), disabled: checked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="만기일자">
          <EcDateRange from={{ className: "ec-input", value: dueFrom, disabled: !useDue, onChange: (e) => setDueFrom(e.target.value) }} to={{ className: "ec-input", value: dueTo, disabled: !useDue, onChange: (e) => setDueTo(e.target.value) }} />
          <label className="inline-flex items-center gap-[3px] ml-[8px] text-[12.5px]">
            <input type="checkbox" checked={useDue} onChange={(e) => setUseDue(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <EcCond label="어음번호">
          <input className="ec-input" value={noteNo} onChange={(e) => setNoteNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="증감구분">
          {box('전체', showInc && showDec, (v) => { setShowInc(v); setShowDec(v) })}
          {box('어음증가', showInc, setShowInc)}
          {box('어음감소', showDec, setShowDec)}
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 120 }}>
            <option value="">전체</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        {/* 원본 [입력구분] — 우리 어음은 모두 어음등록 화면에서 직접 적는다. 연결전표에서 생기는 어음이 없다. */}
        <EcCond label="입력구분">
          {box('전체', direct, setDirect)}
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px] text-ec-hint">
            <input type="checkbox" checked={false} disabled /> 연결전표
          </label>
          {box('직접입력', direct, setDirect)}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체" value={author} onChange={setAuthor}
                           items={authors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px]">
              <input type="checkbox" aria-label="전체 선택" checked={moves.some(selectable) && moves.filter(selectable).every((m) => checked.has(m.key))}
                     onChange={(e) => setChecked(e.target.checked ? new Set(moves.filter(selectable).map((m) => m.key)) : new Set())} />
            </th>
            <th>일자</th>
            <th>어음번호</th>
            <th>증감구분</th>
            <th>거래처명</th>
            <th className="text-right">금액</th>
            <th className="text-center">만기일자</th>
            <th>적요</th>
            <th className="text-center">거래유형</th>
            <th className="text-center">회계전표일자-No.</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : moves.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : moves.map((m) => (
            <tr key={m.key}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${m.n.noteNo} ${m.inc ? '증가' : '감소'} 선택`} checked={checked.has(m.key)}
                       disabled={!selectable(m)}
                       onChange={(e) => setChecked((prev) => {
                         const next = new Set(prev)
                         if (e.target.checked) next.add(m.key); else next.delete(m.key)
                         return next
                       })} />
              </td>
              <td>{m.inc && !m.n.recordOnly && m.n.status === 'HELD'
                ? <a className="ec-link" href={`/accounting/${incPath}?id=${m.n.id}`} onClick={(e) => { e.preventDefault(); navigate(`/accounting/${incPath}?id=${m.n.id}`) }}>{dayNo(m)}</a>
                : !m.inc && m.n.closeJournalEntryId && !byVoucher(m.n)
                ? <a className="ec-link" href={`/accounting/${editPathOf(m.n)}?id=${m.n.id}`} onClick={(e) => { e.preventDefault(); navigate(`/accounting/${editPathOf(m.n)}?id=${m.n.id}`) }}>{dayNo(m)}</a>
                : dayNo(m)}</td>
              <td>{m.n.noteNo}</td>
              <td>{m.inc ? '증가' : '감소'}</td>
              <td>{m.n.partnerName}</td>
              <td className="text-right">{fmtAmount(Number(m.n.amount))}</td>
              <td className="text-center">{dateText(m.n.dueDate)}</td>
              <td>{lineRemark(m)}</td>
              <td className="text-center">{kindOf(m)}</td>
              <td className="text-center">{journalOf(m)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 원본 창(2026-10-13 실측): '전표를 삭제하겠습니까? - 받을어음내역입력'. */}
      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- {recName}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={picked.length === 0} onClick={() => void removeChecked()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>

      <Modal open={recOpen} title={receivable ? '받을어음내역입력' : '지급어음내역입력'} width={760} error={recError} onClose={() => setRecOpen(false)}>
        {/* 창 머리 — 조회 조건이 아니라 입력 칸이라 EcCond(조건 판) 대신 이름표 + 칸으로 그린다. */}
        <div className="grid grid-cols-[90px_1fr_90px_1fr] items-center gap-[6px] mb-[8px] text-[12.5px]">
          <span>전표일자</span><EcDateField value={recDate} onChange={setRecDate} />
          {/* 원본 [전표구분] 증가 · 감소 — 감소는 받아 둔 어음을 어음번호로 찾아 분개 없이 닫는다(거래유형 '어음만감소'). */}
          <span>전표구분</span>
          <select className="ec-input w-full" aria-label="전표구분" value={recDec ? '감소' : '증가'} onChange={(e) => setRecDec(e.target.value === '감소')}>
            <option>증가</option><option>감소</option>
          </select>
          <span>거래처코드</span>
          <CodePickerField label="거래처코드" hideLabel fill emptyLabel="(없음)" invalid={req.on('partner', !!recPartner)} value={recPartner} onChange={setRecPartner} items={pickers.partners} />
          <span>계정코드</span>
          <input className="ec-input w-full" aria-label="계정코드" disabled value={receivable ? '110 받을어음' : '252 지급어음'} />
        </div>
        <table className="w-full text-left mb-[8px]">
          <thead>
            <tr><th className="w-[30px]"></th><th>어음번호</th><th className="text-right">금액</th>{!recDec && <th className="text-center">만기일자</th>}<th>부서</th><th>프로젝트</th><th>적요</th></tr>
          </thead>
          <tbody>
            {recLines.map((l, i) => (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td><div className={req.cls(`no${i}`, !!l.noteNo.trim())}><input className="ec-input w-full" aria-label={`어음번호${i + 1}`} maxLength={30} value={l.noteNo}
                           onChange={(e) => setRecLines((p) => p.map((x, j) => (j === i ? { ...x, noteNo: e.target.value } : x)))} /></div></td>
                <td><div className={req.cls(`amt${i}`, Number(l.amount) > 0)}><EcNumInput className="ec-input w-full text-right" aria-label={`금액${i + 1}`} value={l.amount}
                                onValue={(v) => setRecLines((p) => p.map((x, j) => (j === i ? { ...x, amount: v } : x)))} /></div></td>
                {!recDec && <td className="text-center"><EcDateField value={l.dueDate}
                                onChange={(v) => setRecLines((p) => p.map((x, j) => (j === i ? { ...x, dueDate: v } : x)))} /></td>}
                <td><CodePickerField label={`부서${i + 1}`} hideLabel fill emptyLabel="" value={l.dept} items={deptProject.departments}
                                     onChange={(v) => setRecLines((p) => p.map((x, j) => (j === i ? { ...x, dept: v } : x)))} /></td>
                <td><CodePickerField label={`프로젝트${i + 1}`} hideLabel fill emptyLabel="" value={l.project} items={deptProject.projects}
                                     onChange={(v) => setRecLines((p) => p.map((x, j) => (j === i ? { ...x, project: v } : x)))} /></td>
                <td><input className="ec-input w-full" aria-label={`적요${i + 1}`} maxLength={300} value={l.remark}
                           onChange={(e) => setRecLines((p) => p.map((x, j) => (j === i ? { ...x, remark: e.target.value } : x)))} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={2}></td>
              <td className="text-right">{fmtAmount(recLines.reduce((a, l) => a + (Number(l.amount) || 0), 0))}</td>
              <td colSpan={recDec ? 3 : 4}></td>
            </tr>
          </tfoot>
        </table>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveRecord()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => { setRecPartner(''); setRecLines([blankLine(), blankLine(), blankLine()]); setRecError(''); req.reset() }}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={() => setRecOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
