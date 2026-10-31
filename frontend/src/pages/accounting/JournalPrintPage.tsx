import { Fragment, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcNumInput from '../../components/EcNumInput'
import { periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { JournalEntry } from '../../types/api'
import { JOURNAL_INQUIRY_PICKS } from '../../utils/periods'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { lineInDeptProject } from '../../utils/deptProject'
import SlipPrintModal from '../../features/journalprint/SlipPrintModal'
import { journalSlipHtml, loadSlipHeader, slipNoLong } from '../../features/journalprint/slipPrint'
import { fmtAmountNz } from '../../utils/format'

const dot = (d: string) => d.replaceAll('-', '/')

/**
 * 회계 I › 회계거래관리 › <b>전표인쇄</b>(E010702) — 2026-10-20 loginaa 실측.
 *
 * <p>조건(처음 펼침, 기본 <b>최근30일</b>): 기준일자 · 회계전표No. · 거래처 · 계정 · 부서 · 프로젝트 · 거래유형 · 금액 ~ ·
 * 어음번호 · 적요 · 최초작성자 · 최종수정자. [검색(F8)] → '전표리스트'(회사명 · 기간) 격자
 * [☐ · 전표번호 · 계정명 · 거래처명 · 차변금액 · 대변금액], 둘째 머리 줄 [적요]. 전표 한 장 = 분개 줄들 + 적요 한 줄,
 * 체크는 전표마다 하나. 아래 [인쇄] — 고른 전표를 전표 서식(회계거래조회 [전표] 인쇄와 같은 것)으로 이어 찍는다.
 * 어음번호는 회계전표가 들지 않아 없다.
 */
export default function JournalPrintPage() {
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partner, setPartner] = useState('')
  const [account, setAccount] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [kind, setKind] = useState('')
  const [amtFrom, setAmtFrom] = useState('')
  const [amtTo, setAmtTo] = useState('')
  const [remark, setRemark] = useState('')
  const [author, setAuthor] = useState('')
  const [editor, setEditor] = useState('')
  const deptProject = useDeptProjectItems()
  const [entries, setEntries] = useState<(JournalEntry & { updatedBy?: string | null })[]>([])
  const [range, setRange] = useState(init)
  const [company, setCompany] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState<string | null>(null)

  async function load() {
    setError('')
    try {
      const [r, h] = await Promise.all([
        api.get<{ rows: JournalEntry[] }>('/journals', { params: { from, to, all: true } }),
        loadSlipHeader(),
      ])
      setEntries(r.data.rows); setCompany(h.company); setRange({ from, to }); setChecked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const partners = useMemo(() => [...new Set(entries.map((e) => e.partnerName).filter(Boolean) as string[])].sort().map((p) => ({ value: p, name: p })), [entries])
  const accounts = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of entries) for (const l of e.lines) m.set(l.accountCode, l.accountName)
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([code, name]) => ({ value: code, code, name }))
  }, [entries])
  const kinds = useMemo(() => [...new Set(entries.map((e) => e.sourceTypeName))].sort().map((k) => ({ value: k, name: k })), [entries])
  const people = (f: (e: JournalEntry & { updatedBy?: string | null }) => string | null | undefined) =>
    [...new Set(entries.map(f).filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))

  const shown = useMemo(() => entries
    .filter((e) => !docNo || e.docNo.includes(docNo) || slipNoLong(e.docNo, e.entryDate).includes(docNo))
    .filter((e) => !partner || (e.partnerName ?? '') === partner)
    .filter((e) => !account || e.lines.some((l) => l.accountCode === account))
    .filter((e) => (!dept && !project) || e.lines.some((l) => lineInDeptProject(l, dept, project)))
    .filter((e) => !kind || e.sourceTypeName === kind)
    .filter((e) => amtFrom === '' || e.totalDebit >= Number(amtFrom))
    .filter((e) => amtTo === '' || e.totalDebit <= Number(amtTo))
    .filter((e) => !remark || (e.description ?? '').includes(remark) || e.lines.some((l) => (l.description ?? '').includes(remark)))
    .filter((e) => !author || e.createdBy === author)
    .filter((e) => !editor || (e.updatedBy ?? e.createdBy) === editor)
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo))),
  [entries, docNo, partner, account, dept, project, kind, amtFrom, amtTo, remark, author, editor])

  async function print() {
    const picked = shown.filter((e) => checked.has(e.id))
    const h = await loadSlipHeader()
    setPrinting(journalSlipHtml(picked, h.company, h.sign))
  }

  const reset = () => {
    setFrom(init.from); setTo(init.to); setDocNo(''); setPartner(''); setAccount(''); setDept(''); setProject('')
    setKind(''); setAmtFrom(''); setAmtTo(''); setRemark(''); setAuthor(''); setEditor('')
  }

  return (
    <EcListShell
      title="전표인쇄"
      onSearch={load}
      searchable={false}
      onReset={reset}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄', onClick: () => void print(), selected: checked.size },
      ]}
    >
      <EcStatusPanel from={from} to={to} onPeriod={(r) => { setFrom(r.from); setTo(r.to) }} picks={JOURNAL_INQUIRY_PICKS}>
        <EcCond label="회계전표No.">
          <input className="ec-input w-full" placeholder="회계전표No." value={docNo} onChange={(e) => setDocNo(e.target.value)} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel fill emptyLabel="전체" value={partner} onChange={setPartner} items={partners} />
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel fill emptyLabel="전체" value={account} onChange={setAccount} items={accounts} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel fill emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="거래유형" pick>
          <CodePickerField label="거래유형" hideLabel fill emptyLabel="전체" value={kind} onChange={setKind} items={kinds} />
        </EcCond>
        <EcCond label="금액">
          <span className="inline-flex w-full items-center gap-[4px]">
            <EcNumInput className="ec-input w-full text-right" aria-label="금액부터" placeholder="금액" value={amtFrom} onValue={setAmtFrom} />
            <span>~</span>
            <EcNumInput className="ec-input w-full text-right" aria-label="금액까지" value={amtTo} onValue={setAmtTo} />
          </span>
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-full" placeholder="적요" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel fill emptyLabel="전체" value={author} onChange={setAuthor} items={people((e) => e.createdBy)} />
        </EcCond>
        <EcCond label="최종수정자" pick>
          <CodePickerField label="최종수정자" hideLabel fill emptyLabel="전체" value={editor} onChange={setEditor} items={people((e) => e.updatedBy ?? e.createdBy)} />
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="ec-report">
        <h2 className="text-center text-[22px] font-bold mb-[6px]">전표리스트</h2>
        <div className="flex justify-between text-[12px] mb-[4px]">
          <span>회사명 : {company}</span>
          <span>{dot(range.from)} ~ {dot(range.to)}</span>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th rowSpan={2} className="w-[30px] text-center">
                <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((e) => checked.has(e.id))}
                       onChange={(ev) => setChecked(ev.target.checked ? new Set(shown.map((e) => e.id)) : new Set())} />
              </th>
              <th rowSpan={2} className="text-center">전표번호</th>
              <th>계정명</th><th>거래처명</th>
              <th className="text-right">차변금액</th><th className="text-right">대변금액</th>
            </tr>
            <tr><th colSpan={4} className="text-center">적요</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((e) => (
              <Fragment key={e.id}>
                {e.lines.map((l, i) => (
                  <tr key={l.id}>
                    {i === 0 && (
                      <>
                        <td rowSpan={e.lines.length + 1} className="text-center align-top">
                          <input type="checkbox" aria-label={`${slipNoLong(e.docNo, e.entryDate)} 선택`} checked={checked.has(e.id)}
                                 onChange={(ev) => setChecked((prev) => {
                                   const next = new Set(prev)
                                   if (ev.target.checked) next.add(e.id); else next.delete(e.id)
                                   return next
                                 })} />
                        </td>
                        <td rowSpan={e.lines.length + 1} className="align-top">{slipNoLong(e.docNo, e.entryDate).replace(/-(\d+)$/, ' -$1')}</td>
                      </>
                    )}
                    <td>{l.accountName}</td>
                    <td>{l.partnerName ?? e.partnerName ?? ''}</td>
                    <td className="text-right">{fmtAmountNz(l.debit)}</td>
                    <td className="text-right">{fmtAmountNz(l.credit)}</td>
                  </tr>
                ))}
                <tr><td colSpan={4}>{e.description ?? ''}</td></tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <SlipPrintModal title="전표" html={printing} onClose={() => setPrinting(null)} />
    </EcListShell>
  )
}
