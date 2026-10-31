import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import type { JournalEntry } from '../../../types/api'
import { useDeptProjectItems } from '../../../features/cashquick/useDeptProject'
import { scopeEntries } from '../../../utils/deptProject'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { useAuth } from '../../../features/auth/AuthContext'
import AggregateTable from '../../../features/journalstatus/AggregateTable'
import { AggregateConditions, useAggState, type AggSnapshot } from '../../../features/journalstatus/useAggregate'
import { TRANSFER_GROUPS, TRANSFER_TARGETS, buildTree, shiftPeriod, type AggEntry } from '../../../utils/journalAggregate'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import { fmtAmountBlank } from '../../../utils/format'

/** 원본 [YYYY/MM 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게, 앞 여섯 칸 묶음. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; name: string; bankName: string | null; accountNo: string | null }
/** 돈이 나가는 계정 — 현금 · 당좌예금 · 보통예금(StandardAccounts). 이 계정 대변이 이체 금액이다. */
const OUT_CODES = ['1019', '1029', '1039']
/** 지출결의서에 해당하는 우리 전표 — 지출 · 수금·지급. */
const SOURCES = ['EXPENSE', 'SETTLEMENT']
type Unit = '건별' | '일별' | '월별' | '전표별' | '거래처별'
const UNITS: Unit[] = ['건별', '일별', '월별', '전표별', '거래처별']
type Status = '전체' | '결재중' | '미확인' | '확인'
interface Row { key: string; date: string; text: string; partner: string; text1: string; bank: string; acct: string; amount: number; agg?: AggEntry }

/**
 * 회계 I &gt; 출력물 &gt; 기타 &gt; <b>지출결의서이체리스트</b>(E010834) — 2026-10-03 loginaa 실측(자료가 든 판, 최근30일).
 *
 * <p>조건: 구분(<b>내역</b> | 집계) — 내역이면 <b>건별</b> · 일별 · 월별 · 전표별 · 거래처별 — · 기준일자(구간, 기본 <b>최근30일</b>,
 * 빠른선택 금일 … 전월 · 종료일 · 최근30일) · 회계전표No. · 부서 · 프로젝트 · 출금계좌 · 상태(전체 · 결재중 · 미확인 · <b>확인</b>) ·
 * 적용양식 · 양식구분([결재방표시]) · 데이터 보기형식.
 *
 * <p>인쇄 머리 제목도 화면 이름과 같은 <b>지출결의서이체리스트</b>(다시 열어 확인). 열 전표일자 · 적요 · 거래처명 · 적요1 · 은행 · 계좌번호 · 금액, 달마다 [YYYY/MM 계], 끝 [합계](앞 여섯 칸 묶음).
 * 지출 · 수금·지급 전표에서 현금 · 예금(101 · 102 · 103) 대변이 한 줄이고, 은행 · 계좌번호는 거래처의 이체정보다.
 * 원본 판에서 은행 · 계좌번호 · 적요1 은 비어 있었다(거래처 이체정보가 없는 자료). [출금계좌]는 돈이 나간 계정으로 거른다.
 * 우리 전표는 결재 없이 곧 확인이라 결재중 · 미확인은 비어 있다. 일별 · 월별 · 전표별 · 거래처별은 원본 판을 못 재 하루 · 한 달 · 전표 · 거래처로 묶는다.
 * [집계]는 ○집계 판이라 아직 없고, [부서] · [프로젝트]는 회계전표 줄의 것(V343)으로 거른다.
 */
export default function TransferListPage() {
  const init = periodOf('최근30일')!
  const [unit, setUnit] = useState<Unit>('건별')
  /* 구분 ◉내역 ○집계(2026-10-22 실측) — 집계조건 · 집계대상(금액 · 외화금액 · 수수료) · 비교기간 · 기타. */
  const agg = useAggState()
  const [cmpAll, setCmpAll] = useState<JournalEntry[]>([])
  const [aggShown, setAggShown] = useState<AggSnapshot | null>(null)
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [outAccount, setOutAccount] = useState('')
  const [status, setStatus] = useState<Status>('확인')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [allEntries, setEntries] = useState<JournalEntry[]>([])
  /* 원본 조건 [부서] · [프로젝트] — 회계전표 줄의 것(V343)으로 좁힌다. */
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const entries = useMemo(() => scopeEntries(allEntries, dept, project), [allEntries, dept, project])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  const { companyName } = useAuth()
  /* 원본은 [검색(F8)] 전에 격자 · 머리를 그리지 않는다(2026-10-20 실측) — 조건 판만. */
  const [searched, setSearched] = useState(false)
  const [shown, setShown] = useState({ from: init.from, to: init.to })
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      setEntries(r.data.rows)
      if (agg.mode === '집계' && agg.compare !== '사용안함') {
        const c = shiftPeriod(from, to, agg.compare)
        setCmpAll((await api.get<JournalList>('/journals', { params: { from: c.from, to: c.to, all: true } })).data.rows)
      } else setCmpAll([])
      setAggShown(agg.mode === '집계' ? agg.snapshot(from, to) : null)
      setShown({ from, to })
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  const search = () => {
    if (agg.mode === '집계' && !agg.check()) return
    setSearched(true)
    void load()
  }

  const pById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners])
  const outAccounts = useMemo(() => [...new Set(entries.flatMap((e) => e.lines.filter((l) => OUT_CODES.includes(l.accountCode)).map((l) => l.accountName)))].sort(), [entries])

  const nameCode = (items: { value: string; name: string; code?: string | null }[], id: number | null | undefined) => {
    const it = id == null ? undefined : items.find((i) => i.value === String(id))
    return { name: it?.name ?? '', code: it?.code ?? '' }
  }
  const rowsOf = (list: JournalEntry[]): Row[] => {
    if (status === '결재중' || status === '미확인') return []
    const out: Row[] = []
    const sorted = [...list].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      if (!SOURCES.includes(e.sourceType)) continue
      if (docNo && !e.docNo.includes(docNo)) continue
      const p = e.partnerId != null ? pById.get(e.partnerId) : undefined
      for (const l of e.lines) {
        if (!OUT_CODES.includes(l.accountCode) || Number(l.credit) === 0) continue
        if (outAccount && l.accountName !== outAccount) continue
        const d = nameCode(deptProject.departments, l.departmentId)
        const pr = nameCode(deptProject.projects, l.projectId)
        out.push({ key: `${e.id}-${l.id}`, date: e.entryDate, text: e.description ?? l.description ?? '', partner: e.partnerName ?? '',
          text1: e.docNo, bank: p?.bankName ?? '', acct: p?.accountNo ?? '', amount: Number(l.credit),
          agg: { date: e.entryDate, partner: e.partnerName ?? '', partnerCode: l.partnerCode ?? '', dept: d.name, deptCode: d.code, project: pr.name, projectCode: pr.code,
            account: l.accountName, accountCode: l.accountCode, vals: { 금액: Number(l.credit), 외화금액: Number(l.foreignAmount ?? 0), 수수료: 0 } } })
      }
    }
    return out
  }
  const base = useMemo(() => rowsOf(entries),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [entries, pById, docNo, outAccount, status, deptProject])
  const aggTree = useMemo(() => {
    if (!aggShown) return null
    const cmp = aggShown.compare === '사용안함' ? [] : [rowsOf(scopeEntries(cmpAll, dept, project)).map((r) => r.agg!)]
    return buildTree([base.map((r) => r.agg!), ...cmp], aggShown.conds, aggShown.targets)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggShown, base, cmpAll])

  /* 건별 말고는 하루 · 한 달 · 전표 · 거래처를 한 줄로 묶는다. */
  const rows = useMemo(() => {
    if (unit === '건별') return base.map((r) => ({ ...r, text1: '' }))
    const keyOf = (r: Row) => unit === '일별' ? r.date : unit === '월별' ? r.date.slice(0, 7) : unit === '전표별' ? `${r.date}|${r.text1}` : r.partner
    const m = new Map<string, Row>()
    for (const r of base) {
      const k = keyOf(r)
      if (!m.has(k)) m.set(k, { ...r, key: k, text: unit === '거래처별' ? '' : r.text, text1: unit === '전표별' ? r.text1 : '', amount: 0 })
      m.get(k)!.amount += r.amount
    }
    return [...m.values()]
  }, [base, unit])
  const months = unit === '거래처별' ? [''] : [...new Set(rows.map((r) => r.date.slice(0, 7)))]
  const total = rows.reduce((s, r) => s + r.amount, 0)

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '지출결의서이체리스트', [rows.length, unit])

  return (
    <EcListShell
      title="지출결의서이체리스트"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: search },
        { label: '다시 작성', onClick: () => { agg.reset(); setDept(''); setProject(''); setUnit('건별'); setFrom(init.from); setTo(init.to); setDocNo(''); setOutAccount(''); setStatus('확인') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="radio" name="tl-kind" checked={agg.mode === '내역'} onChange={() => agg.setMode('내역')} /> 내역
          </label>
          <label className="inline-flex items-center gap-[3px] mr-[16px] text-[12.5px]">
            <input type="radio" name="tl-kind" checked={agg.mode === '집계'} onChange={() => agg.setMode('집계')} /> 집계
          </label>
          {agg.mode === '내역' && UNITS.map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="tl-unit" checked={unit === v} onChange={() => setUnit(v)} /> {v}
            </label>
          ))}
        </EcCond>
        {agg.mode === '집계' && (
          <AggregateConditions st={agg} groups={TRANSFER_GROUPS} targetList={TRANSFER_TARGETS} label={['집계조건1', '집계조건2', '집계조건3', '집계조건4']}
            targetLabel="집계대상" compareLabel="비교기간" etcLabel="기타" />
        )}
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="출금계좌">
          <select className="ec-input" value={outAccount} onChange={(e) => setOutAccount(e.target.value)} style={{ width: 160 }}>
            <option value="">전체</option>
            {outAccounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </EcCond>
        <EcCond label="상태">
          {(['전체', '결재중', '미확인', '확인'] as Status[]).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="tl-status" checked={status === v} onChange={() => setStatus(v)} /> {v}
            </label>
          ))}
        </EcCond>
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      {searched && aggShown && aggTree && (<>
        <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">지출결의서이체리스트</h3>
        <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
          <span>회사명 : {companyName ?? ''}</span>
          <span>{slash(shown.from)} ~ {slash(shown.to)}</span>
        </div>
        {loading ? <p className="ec-empty">불러오는 중…</p> : aggTree.children.length === 0
          ? <p className="ec-empty">등록된 데이터가 없습니다.</p>
          : <AggregateTable tree={aggTree} conds={aggShown.conds} targets={aggShown.targets} periodLabels={aggShown.periods}
              horizontal={aggShown.horizontal} ratio={aggShown.ratio} withCode={aggShown.withCode} />}
      </>)}
      {searched && !aggShown && (<>
      <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">지출결의서이체리스트</h3>
      <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
        <span>회사명 : {companyName ?? ''}</span>
        <span>{slash(shown.from)} ~ {slash(shown.to)}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">전표일자</th>
            <th>적요</th>
            <th>거래처명</th>
            <th>적요1</th>
            <th>은행</th>
            <th>계좌번호</th>
            <th className="text-right">금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {months.map((mo) => {
                const ms = mo ? rows.filter((r) => r.date.slice(0, 7) === mo) : rows
                return (
                  <Fragment key={mo || 'all'}>
                    {ms.map((r) => (
                      <tr key={r.key}>
                        <td className="text-center">{unit === '월별' ? slash(r.date.slice(0, 7)) : unit === '거래처별' ? '' : slash(r.date)}</td>
                        <td>{r.text}</td>
                        <td>{r.partner}</td>
                        <td>{r.text1}</td>
                        <td>{r.bank}</td>
                        <td>{r.acct}</td>
                        <td className="text-right">{fmtAmountBlank(r.amount)}</td>
                      </tr>
                    ))}
                    {mo && (
                      <tr style={SUB_ROW}>
                        <td colSpan={6} className="text-center">{slash(mo)}  계</td>
                        <td className="text-right">{fmtAmountBlank(ms.reduce((s, r) => s + r.amount, 0))}</td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              <tr style={SUB_ROW}>
                <td colSpan={6} className="text-center">합계</td>
                <td className="text-right">{fmtAmountBlank(total)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      </>)}
    </EcListShell>
  )
}
