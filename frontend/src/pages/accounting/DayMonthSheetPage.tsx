import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { AccountLedger, JournalEntry } from '../../types/api'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { scopeEntries } from '../../utils/deptProject'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { useAuth } from '../../features/auth/AuthContext'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmountBlank } from '../../utils/format'

/** 원본 [월계] · [금일/전일] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const CASH = '1019'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { id: number; code: string; name: string }
interface Line { code: string; name: string; dCash: number; dTrans: number; cCash: number; cTrans: number }

const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00`)
  t.setDate(t.getDate() + n)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>일/월계표</b>(E010803) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 구분(<b>월계표</b> | 일계표) · 조회일자(월계표는 달 구간 — 이날 기본 2026/09 ~ 2026/09 = 전월, 빠른선택 금일 … 전월 · 종료일) · 부서 · 프로젝트 ·
 * 기타(결재방표시). 열: 차변합계 · 차변대체 · 차변현금(출금) · 계정명 · 대변현금(입금) · 대변대체 · 대변합계. 계정마다 한 줄,
 * 끝에 [월계](일계표면 [일계]) · [금일/전일] · [합계] 줄(바탕 rgb(243,243,243) · 굵게).
 *
 * <p>2026-10-21 원본 실측(재집계 후 조회, 일반전표 1출 · 2입 · 대체 세 장): 원본은 전표 줄을 <b>모두 '대체'</b> 칸에 둔다
 * (2입 잡이익 11,000 도 대변대체). 현금 · 출금 칸은 계정 줄에서 늘 빈칸이다. 현금 계정(101) 자신도 한 줄로 서되(차변대체 = 현금 차변 합,
 * 대변대체 = 현금 대변 합) [일계] · [월계] 합에서는 뺀다. 그래서 [일계] 차 · 대는 현금이 오간 만큼 어긋나고,
 * [금일/전일](차변 = 기간 끝 현금 잔고 · 대변 = 기간 첫날 전 잔고, 현금 칸과 합계 칸에)을 더한 [합계]에서 맞는다.
 * 예전(2026-10-03)엔 교과서대로 현금 반대편 줄을 현금 칸에 나눴다 — 원본과 달랐다.
 * 머리 날짜는 하루면 '2026/10/21' 하나, 구간이면 '2026/10/01 ~ 2026/10/21'.
 * [부서] · [프로젝트]는 회계전표 줄의 것(V343)으로 거른다(현금 이월도 그 줄만).
 */
export default function DayMonthSheetPage() {
  const { companyName } = useAuth()
  const [mode, setMode] = useState<'월계표' | '일계표'>('월계표')
  const initM = periodOf('전월')!
  const [from, setFrom] = useState(initM.from)
  const [to, setTo] = useState(initM.to)
  const [allEntries, setEntries] = useState<JournalEntry[]>([])
  /* 원본 조건 [부서] · [프로젝트] — 회계전표 줄의 것(V343)으로 좁힌다. */
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const entries = useMemo(() => scopeEntries(allEntries, dept, project), [allEntries, dept, project])
  const [openCash, setOpenCash] = useState(0)
  const [cashId, setCashId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setCashId(r.data.find((a) => a.code === CASH)?.id ?? null)).catch(() => setCashId(null))
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [j, l] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from, to, all: true } }),
        cashId != null
          ? api.get<AccountLedger>('/journals/ledger', { params: { accountId: cashId, from: '1900-01-01', to: addDays(from, -1), departmentId: dept || undefined, projectId: project || undefined } })
          : Promise.resolve(null),
      ])
      setEntries(j.data.rows)
      setOpenCash(l ? Number(l.data.closingBalance) : 0)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [dept, project, from, to, cashId])

  const { lines, cashIn, cashOut } = useMemo(() => {
    const by = new Map<string, Line>()
    let cashIn = 0, cashOut = 0
    const get = (code: string, name: string) => {
      if (!by.has(code)) by.set(code, { code, name, dCash: 0, dTrans: 0, cCash: 0, cTrans: 0 })
      return by.get(code)!
    }
    /* 원본: 모든 줄이 '대체' — 현금 계정 줄도 대체 칸에 찍고 합에서는 뺀다(위 설명). */
    for (const e of entries) {
      for (const l of e.lines) {
        const row = get(l.accountCode, l.accountName)
        row.dTrans += Number(l.debit); row.cTrans += Number(l.credit)
        if (l.accountCode === CASH) { cashIn += Number(l.debit); cashOut += Number(l.credit) }
      }
    }
    return { lines: [...by.values()].sort((a, b) => a.code.localeCompare(b.code)), cashIn, cashOut }
  }, [entries])
  const sum = lines.filter((l) => l.code !== CASH).reduce((s, l) => ({ dCash: s.dCash + l.dCash, dTrans: s.dTrans + l.dTrans, cCash: s.cCash + l.cCash, cTrans: s.cTrans + l.cTrans }),
    { dCash: 0, dTrans: 0, cCash: 0, cTrans: 0 })
  const closeCash = openCash + cashIn - cashOut
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일/월계표', [lines.length, mode])

  const setModeTo = (m: '월계표' | '일계표') => {
    setMode(m)
    const p = periodOf(m === '월계표' ? '전월' : '금일')!
    setFrom(p.from)
    setTo(p.to)
  }

  return (
    <EcListShell
      title="일/월계표"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setDept(''); setProject(''); setModeTo('월계표') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {(['월계표', '일계표'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="dm-mode" checked={mode === v} onChange={() => setModeTo(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="조회일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
      </ul>

      <h3 className="text-[13px] font-bold mt-[4px] mx-0 mb-[6px]">{mode}</h3>
      {/* 원본 머리(2026-10-20 실측): '회사명 : (주)… ' 한 줄과 '2026/10/20 ~ 2026/10/20'. */}
      <div className="flex flex-col text-[12px] mt-0 mx-0 mb-[4px]">
        <span>회사명 : {companyName ?? ''}</span>
        <span>{from === to ? from.replace(/-/g, '/') : `${from.replace(/-/g, '/')} ~ ${to.replace(/-/g, '/')}`}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-right">차변합계</th>
            <th className="text-right">차변대체</th>
            <th className="text-right">차변현금(출금)</th>
            <th className="text-center">계정명</th>
            <th className="text-right">대변현금(입금)</th>
            <th className="text-right">대변대체</th>
            <th className="text-right">대변합계</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : lines.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : lines.map((l) => (
            <tr key={l.code}>
              <td className="text-right">{fmtAmountBlank(l.dCash + l.dTrans)}</td>
              <td className="text-right">{fmtAmountBlank(l.dTrans)}</td>
              <td className="text-right">{fmtAmountBlank(l.dCash)}</td>
              <td className="text-center">{l.name}</td>
              <td className="text-right">{fmtAmountBlank(l.cCash)}</td>
              <td className="text-right">{fmtAmountBlank(l.cTrans)}</td>
              <td className="text-right">{fmtAmountBlank(l.cCash + l.cTrans)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={SUB_ROW}>
            <td className="text-right">{fmtAmountBlank(sum.dCash + sum.dTrans)}</td>
            <td className="text-right">{fmtAmountBlank(sum.dTrans)}</td>
            <td className="text-right">{fmtAmountBlank(sum.dCash)}</td>
            <td className="text-center">{mode === '월계표' ? '[월계]' : '[일계]'}</td>
            <td className="text-right">{fmtAmountBlank(sum.cCash)}</td>
            <td className="text-right">{fmtAmountBlank(sum.cTrans)}</td>
            <td className="text-right">{fmtAmountBlank(sum.cCash + sum.cTrans)}</td>
          </tr>
          <tr style={SUB_ROW}>
            <td className="text-right">{fmtAmountBlank(closeCash)}</td>
            <td></td>
            <td className="text-right">{fmtAmountBlank(closeCash)}</td>
            <td className="text-center">[금일/전일]</td>
            <td className="text-right">{fmtAmountBlank(openCash)}</td>
            <td></td>
            <td className="text-right">{fmtAmountBlank(openCash)}</td>
          </tr>
          <tr style={SUB_ROW}>
            <td className="text-right">{fmtAmountBlank(sum.dCash + sum.dTrans + closeCash)}</td>
            <td className="text-right">{fmtAmountBlank(sum.dTrans)}</td>
            <td className="text-right">{fmtAmountBlank(sum.dCash + closeCash)}</td>
            <td className="text-center">[합계]</td>
            <td className="text-right">{fmtAmountBlank(sum.cCash + openCash)}</td>
            <td className="text-right">{fmtAmountBlank(sum.cTrans)}</td>
            <td className="text-right">{fmtAmountBlank(sum.cCash + sum.cTrans + openCash)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
