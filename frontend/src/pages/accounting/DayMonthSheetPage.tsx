import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { cashSplit } from '../../utils/cashSplit'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { AccountLedger, JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [월계] · [금일/전일] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const CASH = '101'

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
 * <p>현금(101)이 든 전표에서 현금 반대편 줄에 현금 금액만큼이 '현금'(출금 · 입금)이고, 넘치는 몫과 나머지는 모두 '대체'다
 * (현금 열 합 = 현금 계정의 대 · 차 합). 현금 계정 자신은 줄로 세우지 않는다.
 * [금일/전일]은 현금 잔고다 — 차변 쪽에 기간 끝 잔고, 대변 쪽에 기간 첫날 전 잔고. [합계] = [월계] + [금일/전일](그래서 차 · 대가 맞는다).
 * 부서 · 프로젝트는 회계전표가 들지 않는다.
 */
export default function DayMonthSheetPage() {
  const [mode, setMode] = useState<'월계표' | '일계표'>('월계표')
  const initM = periodOf('전월')!
  const [from, setFrom] = useState(initM.from)
  const [to, setTo] = useState(initM.to)
  const [entries, setEntries] = useState<JournalEntry[]>([])
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
          ? api.get<AccountLedger>('/journals/ledger', { params: { accountId: cashId, from: '1900-01-01', to: addDays(from, -1) } })
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
  useEffect(() => { void load() }, [from, to, cashId])

  const { lines, cashIn, cashOut } = useMemo(() => {
    const by = new Map<string, Line>()
    let cashIn = 0, cashOut = 0
    const get = (code: string, name: string) => {
      if (!by.has(code)) by.set(code, { code, name, dCash: 0, dTrans: 0, cCash: 0, cTrans: 0 })
      return by.get(code)!
    }
    for (const e of entries) {
      const cash = e.lines.filter((l) => l.accountCode === CASH)
      const cashDebit = cash.reduce((s, l) => s + Number(l.debit), 0)
      const cashCredit = cash.reduce((s, l) => s + Number(l.credit), 0)
      cashIn += cashDebit
      cashOut += cashCredit
      /* 현금 반대편 줄에 현금 금액만큼만 '현금'을 주고 넘치는 몫은 '대체' — utils/cashSplit. */
      const parts = cashSplit(e.lines, CASH)
      e.lines.forEach((l, i) => {
        if (l.accountCode === CASH) return
        const row = get(l.accountCode, l.accountName)
        const x = parts[i]
        row.dCash += x.dCash; row.dTrans += x.dTrans; row.cCash += x.cCash; row.cTrans += x.cTrans
      })
    }
    return { lines: [...by.values()].sort((a, b) => a.code.localeCompare(b.code)), cashIn, cashOut }
  }, [entries])
  const sum = lines.reduce((s, l) => ({ dCash: s.dCash + l.dCash, dTrans: s.dTrans + l.dTrans, cCash: s.cCash + l.cCash, cTrans: s.cTrans + l.cTrans }),
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
        { label: '다시 작성', onClick: () => setModeTo('월계표') },
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
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
      </ul>

      <h3 className="text-[13px] font-bold mt-[4px] mx-0 mb-[6px]">{mode}</h3>
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
              <td className="text-right">{won(l.dCash + l.dTrans)}</td>
              <td className="text-right">{won(l.dTrans)}</td>
              <td className="text-right">{won(l.dCash)}</td>
              <td className="text-center">{l.name}</td>
              <td className="text-right">{won(l.cCash)}</td>
              <td className="text-right">{won(l.cTrans)}</td>
              <td className="text-right">{won(l.cCash + l.cTrans)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={SUB_ROW}>
            <td className="text-right">{won(sum.dCash + sum.dTrans)}</td>
            <td className="text-right">{won(sum.dTrans)}</td>
            <td className="text-right">{won(sum.dCash)}</td>
            <td className="text-center">{mode === '월계표' ? '[월계]' : '[일계]'}</td>
            <td className="text-right">{won(sum.cCash)}</td>
            <td className="text-right">{won(sum.cTrans)}</td>
            <td className="text-right">{won(sum.cCash + sum.cTrans)}</td>
          </tr>
          <tr style={SUB_ROW}>
            <td className="text-right">{won(closeCash)}</td>
            <td></td>
            <td className="text-right">{won(closeCash)}</td>
            <td className="text-center">[금일/전일]</td>
            <td className="text-right">{won(openCash)}</td>
            <td></td>
            <td className="text-right">{won(openCash)}</td>
          </tr>
          <tr style={SUB_ROW}>
            <td className="text-right">{won(sum.dCash + sum.dTrans + closeCash)}</td>
            <td className="text-right">{won(sum.dTrans)}</td>
            <td className="text-right">{won(sum.dCash + closeCash)}</td>
            <td className="text-center">[합계]</td>
            <td className="text-right">{won(sum.cCash + openCash)}</td>
            <td className="text-right">{won(sum.cTrans)}</td>
            <td className="text-right">{won(sum.cCash + sum.cTrans + openCash)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
