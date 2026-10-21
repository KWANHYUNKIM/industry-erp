import { useEffect, useMemo, useRef, useState } from 'react'
import { vatSlipAmounts, type VatSide } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import type { JournalEntry } from '../../types/api'
import { ecConfirm } from '../../components/EcDialog'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import { STATUS_PICKS } from '../../utils/periods'
import { scopeEntries } from '../../utils/deptProject'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'

type DocKind = 'PAPER' | 'ELECTRONIC' | 'MODIFY_ERROR' | 'MODIFY_AMOUNT' | 'MODIFY_RETURN' | 'MODIFY_CANCEL' | 'MODIFY_LC' | 'MODIFY_DUPLICATE'
type Progress = 'NONE' | 'LATE' | 'ELSEWHERE'
interface Mark { journalEntryId: number; docKind: DocKind; docKindName: string; progress: Progress; progressName: string }
interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface Row {
  id: number; date: string; no: string; side: VatSide; partner: string; supply: number; vat: number
  docKind: DocKind; docKindName: string; progress: Progress; progressName: string
}
type SideCond = '전체' | VatSide
type Order = '일자순' | '거래처순' | '구분순'

/** 원본 드롭다운 차례 그대로. */
const DOC_KINDS: { value: DocKind; label: string }[] = [
  { value: 'PAPER', label: '종이(세금)계산서' }, { value: 'ELECTRONIC', label: '전자(세금)계산서-신규' },
  { value: 'MODIFY_ERROR', label: '기재사항착오·정정' }, { value: 'MODIFY_AMOUNT', label: '공급가액변동' },
  { value: 'MODIFY_RETURN', label: '환입' }, { value: 'MODIFY_CANCEL', label: '계약의해제' },
  { value: 'MODIFY_LC', label: '내국신용장개설' }, { value: 'MODIFY_DUPLICATE', label: '착오에의한이중발급' },
]
/** 원본 진행상태 체크칸(2026-10-14 실측 — 처음엔 모두 꺼짐 = 전부). 전송완료 · 메일발송완료는 국세청 · 메일로 보내야 생겨 우리에겐 늘 비어 있다. */
const PROGRESSES: { value: Progress | 'SENT' | 'MAILED'; label: string }[] = [
  { value: 'NONE', label: '미발행' }, { value: 'SENT', label: '전송완료' }, { value: 'MAILED', label: '메일발송완료' },
  { value: 'ELSEWHERE', label: '타발행' }, { value: 'LATE', label: '기한후발행' },
]
/** 원본 각종구분값변경의 [일자] — '2026/10/14-4'(번호 앞 칸 없음, 진행단계의 '2026/10/14 -4' 와 다르다). */
const dateNoTight = (date: string, docNo: string) => {
  const seq = docNo.split('-').pop() ?? ''
  return `${date.replace(/-/g, '/')}-${Number(seq) || seq}`
}
const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>각종구분값변경</b>(E010723) — 2026-10-04 loginaa 실측.
 *
 * <p>목록 [☐ · 일자 · 구분 · 거래처명 · 공급가액 · 부가세 · 전자세금계산서 · 진행상태], 줄은 부가세 줄이 든 회계전표 한 장(utils/vatSlip).
 * 조건은 접혀 있다([Search(F3)]). 일자순은 최근 일자부터. 기준일자 기본은 전월 1일 ~ 오늘(10/04 에 2026/09/01 ~ 2026/10/04). 아래 버튼줄
 * [구분 드롭다운][변경] — 전자세금계산서 칸을 고른 값으로(전자(세금)계산서-신규는 '전자(세금)계산서' 로 보인다),
 * [기한후발행] → '기한후 발행', [기한내발행으로변경] → '발행 안됨', [타발행] → '타발행'(종이(세금)계산서면 변경불가전표).
 * 확인 창 문구는 원본 그대로.
 *
 * <p>조건 기준일자 옆 빠른선택(금일 … 전월 · <b>전월+금월</b>) · 세무신고거래처코드(전표 거래처) · 부서 · 프로젝트(전표 줄의 것) · 최초작성자(2026-10-21 마무리 묶음 25).
 *
 * <p>두지 않은 것: [전자로변환](원본에서 눌러도 줄이 바뀌지 않아 무엇을 하는지 잴 수 없었다) · 거래처관리담당자 ·
 * 예정누락(◉정상 ○예정누락 — 전표에 칸이 없다) · 세무신고거래처순 · 최종수정자 조건.
 */
export default function VatMarkChangePage() {
  const today = new Date()
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)))
  const [to, setTo] = useState(iso(today))
  const [sideCond, setSideCond] = useState<SideCond>('매출')
  const [docCond, setDocCond] = useState<'' | DocKind>('')
  const [progressCond, setProgressCond] = useState<Set<string>>(new Set())
  const [order, setOrder] = useState<Order>('일자순')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [marks, setMarks] = useState<Map<number, Mark>>(new Map())
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [newKind, setNewKind] = useState<DocKind>('PAPER')
  const [error, setError] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [author, setAuthor] = useState('')
  const [partnerOpts, setPartnerOpts] = useState<{ id: number; code: string | null; name: string }[]>([])
  const deptProject = useDeptProjectItems()

  async function load() {
    setError('')
    try {
      const [j, m] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from, to, all: true } }),
        api.get<Mark[]>('/vat-invoice-marks'),
      ])
      setEntries(j.data.rows)
      setMarks(new Map(m.data.map((x) => [x.journalEntryId, x])))
      setPicked(new Set())
    } catch (e) {
      setEntries([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])
  useEffect(() => { api.get<{ id: number; code: string | null; name: string }[]>('/partners').then((r) => setPartnerOpts(r.data)).catch(() => setPartnerOpts([])) }, [])
  const authors = useMemo(() => [...new Set(entries.map((e) => e.createdBy).filter(Boolean) as string[])].sort(), [entries])

  const rows = useMemo(() => {
    const out: Row[] = []
    const sides: VatSide[] = sideCond === '전체' ? ['매출', '매입'] : [sideCond]
    for (const e of scopeEntries(entries, dept, project, true)) {
      if (partnerCond && String(e.partnerId ?? '') !== partnerCond) continue
      if (author && (e.createdBy ?? '') !== author) continue
      for (const side of sides) {
        const amt = vatSlipAmounts(e.lines, side)
        if (!amt) continue
        const m = marks.get(e.id)
        const row: Row = { id: e.id, date: e.entryDate, no: e.docNo, side, partner: e.partnerName ?? '', supply: amt.supply, vat: amt.vat,
          docKind: m?.docKind ?? 'ELECTRONIC', docKindName: m?.docKindName ?? '전자(세금)계산서',
          progress: m?.progress ?? 'NONE', progressName: m?.progressName ?? '발행 안됨' }
        if (docCond && row.docKind !== docCond) continue
        if (progressCond.size > 0 && !progressCond.has(row.progress)) continue
        out.push(row)
        break
      }
    }
    /* 원본 일자순은 최근 일자부터. */
    const byDate = (a: Row, b: Row) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.no.localeCompare(a.no))
    return out.sort((a, b) => {
      if (order === '거래처순' && a.partner !== b.partner) return a.partner.localeCompare(b.partner)
      if (order === '구분순' && a.side !== b.side) return a.side === '매출' ? -1 : 1
      return byDate(a, b)
    })
  }, [entries, marks, sideCond, docCond, progressCond, order, dept, project, partnerCond, author])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '각종구분값변경', [rows.length])
  const allPicked = rows.length > 0 && picked.size === rows.length

  function pickedIds(): number[] | null {
    if (picked.size === 0) { setError('선택된 전표가 없습니다.'); return null }
    return [...picked]
  }

  async function post(url: string, body: object) {
    setError('')
    try {
      await api.post(url, body)
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  function changeKind() {
    const ids = pickedIds()
    if (ids) void post('/vat-invoice-marks/doc-kind', { ids, docKind: newKind })
  }

  async function changeProgress(progress: Progress, question: string | null) {
    const ids = pickedIds()
    if (!ids) return
    if (question && !(await ecConfirm(question))) return
    void post('/vat-invoice-marks/progress', { ids, progress })
  }

  return (
    <EcListShell title="각종구분값변경" onSearch={load} collapseConditions actions={[{ label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          ~
          <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={STATUS_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="세무신고거래처코드" pick>
          <CodePickerField label="세무신고거래처코드" hideLabel width={220} emptyLabel="전체" value={partnerCond} onChange={setPartnerCond}
                           items={partnerOpts.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체" value={author} onChange={setAuthor} items={authors.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="매출/매입 구분">
          {(['매출', '매입', '전체'] as SideCond[]).map((s) => (
            <label key={s} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="vat-mark-side" checked={sideCond === s} onChange={() => setSideCond(s)} /> {s}
            </label>
          ))}
        </EcCond>
        <EcCond label="(세금)계산서구분">
          <select className="ec-input w-[200px]" value={docCond} onChange={(e) => setDocCond(e.target.value as '' | DocKind)}>
            <option value="">전체</option>
            {DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.value === 'ELECTRONIC' ? '전자(세금)계산서' : k.label}</option>)}
          </select>
        </EcCond>
        <EcCond label="진행상태">
          <label className="inline-flex items-center gap-[3px] mr-[10px]">
            <input type="checkbox" checked={progressCond.size === PROGRESSES.length}
                   onChange={(e) => setProgressCond(e.target.checked ? new Set(PROGRESSES.map((p) => p.value)) : new Set())} /> 전체
          </label>
          {PROGRESSES.map((p) => (
            <label key={p.value} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="checkbox" checked={progressCond.has(p.value)}
                     onChange={() => setProgressCond((c) => { const n = new Set(c); if (n.has(p.value)) n.delete(p.value); else n.add(p.value); return n })} /> {p.label}
            </label>
          ))}
        </EcCond>
        <EcCond label="순서">
          {(['일자순', '거래처순', '구분순'] as Order[]).map((o) => (
            <label key={o} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="vat-mark-order" checked={order === o} onChange={() => setOrder(o)} /> {o}
            </label>
          ))}
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
          </div>
        </li>
      </ul>

      <p className="text-right mb-[4px]">{from.replace(/-/g, '/')} ~{to.replace(/-/g, '/')}</p>
      <table ref={tableRef} className="w-full">
        <thead>
          <tr>
            <th className="w-[47px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th className="text-center">일자</th>
            <th className="text-center">구분</th>
            <th>거래처명</th>
            <th className="text-right">공급가액</th>
            <th className="text-right">부가세</th>
            <th className="text-center">전자세금계산서</th>
            <th className="text-center">진행상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.no} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center">{dateNoTight(r.date, r.no)}</td>
              <td className="text-center">{r.vat === 0 ? '계산서' : '세금계산서'}</td>
              <td>{r.partner}</td>
              <td className="text-right">{won(r.supply)}</td>
              <td className="text-right">{won(r.vat)}</td>
              <td className="text-center">{r.docKindName}</td>
              <td className="text-center">{r.progressName}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ec-footer-btns mt-[8px]">
        <select className="ec-input w-[180px]" aria-label="변경할 구분" value={newKind} onChange={(e) => setNewKind(e.target.value as DocKind)}>
          {DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <button className="ec-btn ec-btn-primary" onClick={changeKind}>변경</button>
        <button className="ec-btn" onClick={() => changeProgress('LATE', '선택하신 전표를 기한 후 발행으로 변환하시겠습니까?')}>기한후발행</button>
        <button className="ec-btn" onClick={() => changeProgress('NONE', '선택하신 전표를 기한 내 발행으로 변환하시겠습니까?')}>기한내발행으로변경</button>
        <button className="ec-btn" onClick={() => changeProgress('ELSEWHERE', null)}>타발행</button>
      </div>
    </EcListShell>
  )
}
