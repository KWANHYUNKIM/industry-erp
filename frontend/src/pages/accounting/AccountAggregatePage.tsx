import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { PRICE_REQUEST_PICKS, fiscalYearStartOf, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 회계집계표 원본 빠른선택 — 금일 … 전월 · 금년 · 전년 · 종료일 · 최근30일(기본). */
const AGG_PICKS = [...PRICE_REQUEST_PICKS, '최근30일'] as const

/** 묶는 축 — 원본 [집계조건]의 코드도움에서 기본이 [계정]이었다. 우리 회계전표가 드는 축만 둔다. */
const AXES = ['계정', '거래처', '거래유형', '월별', '일별'] as const
type Axis = (typeof AXES)[number]
const CODE_LABEL: Partial<Record<Axis, string>> = { 계정: '계정코드', 거래처: '거래처코드' }

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; code: string; name: string; manager: string | null }
interface Cell { carry: number; d: number; c: number }
interface Line { name: string; code: string; cell: Cell }

/**
 * 회계 I &gt; 경영자료 &gt; <b>회계집계표</b>(E010843) — 2026-10-03 loginaa 실측(자료가 든 판, 최근30일).
 *
 * <p>조건: 집계조건(집계조건1 기본 <b>계정</b> · 정렬 코드순 · 집계조건2 · 집계조건3 · 집계대상 · 비교기간(<b>사용안함</b> · 전년 · 전월 · 전주 · 전일동일기간) ·
 * 기타(가로보기 · 비율표시 · 코드포함)) · 기준일자(구간, 기본 <b>최근30일</b>, 빠른선택 금일 … 전월 · 금년 · 전년 · 종료일 · 최근30일) ·
 * 부서 · 프로젝트 · 계정 · 거래처 · 거래처관리담당자 · 기타([결재방표시]).
 *
 * <p>기본 판은 계정마다 한 줄 — 계정 · 이월잔액 · 차변 · 대변 · 금액, 끝 [합계](굵게 · 회색). 금액 = 이월잔액 + 차변 − 대변 으로 계정 구분과
 * 상관없이 차변 쪽 부호다(원본에서 외상매입금 −518,824,300). 계정 코드 차례. 수익 · 비용 계정의 이월잔액은 기수 첫날부터만 쌓는다
 * — 지난 기수 손익은 이익잉여금으로 넘어가므로(원본 ↗ 새 창이라 직접 재지 못했고 회계 원칙을 따랐다).
 * 우리는 집계조건1 · 2(계정 · 거래처 · 거래유형 · 월별 · 일별)와 [코드포함] · [비율표시](금액 비율)를 만든다.
 * 집계조건3 · 집계대상 · 비교기간 · 가로보기는 원본에서 고르는 판을 못 재 두지 않았다. 부서 · 프로젝트는 회계전표에 없다.
 * 이 화면은 인라인 style · 색 값을 쓰지 않는다(style-check 래칫, 새 파일 기준 0).
 */
export default function AccountAggregatePage() {
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [axis1, setAxis1] = useState<Axis>('계정')
  const [axis2, setAxis2] = useState<Axis | ''>('')
  const [withCode, setWithCode] = useState(false)
  const [ratio, setRatio] = useState(false)
  const [account, setAccount] = useState('')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  /* 손익 계정(수익 · 비용) 코드와 기수 시작월 — 손익의 이월잔액은 기수 첫날부터만 쌓는다. */
  const [plCodes, setPlCodes] = useState<Set<string>>(new Set())
  const [fiscalStart, setFiscalStart] = useState<number | null>(null)
  const [partner, setPartner] = useState('')
  const [manager, setManager] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
    api.get<{ code: string; division: string }[]>('/accounts')
      .then((r) => setPlCodes(new Set(r.data.filter((a) => a.division === 'REVENUE' || a.division === 'EXPENSE').map((a) => a.code))))
      .catch(() => setPlCodes(new Set()))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => setFiscalStart(null))
  }, [])

  /* 이월잔액을 내려고 처음부터 기간 끝까지 받는다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: '1900-01-01', to, all: true } })
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const pById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners])
  const keyOf = (axis: Axis, e: JournalEntry, l: JournalEntry['lines'][number]): [string, string] => {
    switch (axis) {
      case '계정': return [l.accountName, l.accountCode]
      case '거래처': return [e.partnerName ?? '(없음)', e.partnerId != null ? pById.get(e.partnerId)?.code ?? '' : '']
      case '거래유형': return [e.sourceTypeName, '']
      case '월별': return [e.entryDate.slice(0, 7).replace('-', '/'), e.entryDate.slice(0, 7)]
      default: return [e.entryDate.replace(/-/g, '/'), e.entryDate]
    }
  }

  const fyStart = fiscalStart ? fiscalYearStartOf(from, fiscalStart) : null
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; code: string; cell: Cell; subs: Map<string, Line> }>()
    for (const e of entries) {
      if (partner && String(e.partnerId) !== partner) continue
      if (manager && (e.partnerId == null || (pById.get(e.partnerId)?.manager ?? '') !== manager)) continue
      const before = e.entryDate < from
      for (const l of e.lines) {
        if (account && l.accountName !== account) continue
        /* 날짜 축으로 묶을 때 이월(기간 앞 전표)은 날짜가 없는 묶음이라 세지 않는다. */
        if (before && (axis1 === '월별' || axis1 === '일별')) continue
        /*
         * 지난 기수의 손익은 결산으로 이익잉여금에 넘어갔다 — 계정으로 묶을 때 수익 · 비용 계정의 이월잔액에 넣지 않고
         * [미처분이익잉여금] 줄의 이월로 옮긴다(우리 계정표에 그 계정이 없어 이름만 둔다). 그래야 이월 합계가 0 으로 맞는다.
         * 설정(기수 시작월)을 모르면 옮기지 않는다.
         */
        const closed = before && axis1 === '계정' && !!fyStart && e.entryDate < fyStart && plCodes.has(l.accountCode)
        if (closed && account) continue
        const [n1, c1] = closed ? ['미처분이익잉여금', ''] : keyOf(axis1, e, l)
        if (!m.has(n1)) m.set(n1, { name: n1, code: c1, cell: { carry: 0, d: 0, c: 0 }, subs: new Map() })
        const g = m.get(n1)!
        const add = (cell: Cell) => {
          if (before) cell.carry += Number(l.debit) - Number(l.credit)
          else { cell.d += Number(l.debit); cell.c += Number(l.credit) }
        }
        add(g.cell)
        if (axis2) {
          if (before && (axis2 === '월별' || axis2 === '일별')) continue
          const [n2, c2] = keyOf(axis2, e, l)
          if (!g.subs.has(n2)) g.subs.set(n2, { name: n2, code: c2, cell: { carry: 0, d: 0, c: 0 } })
          add(g.subs.get(n2)!.cell)
        }
      }
    }
    const nz = (c: Cell) => Math.round(c.carry) !== 0 || c.d !== 0 || c.c !== 0
    return [...m.values()].filter((g) => nz(g.cell))
      .map((g) => ({ ...g, subs: [...g.subs.values()].filter((s) => nz(s.cell)).sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, 'ko')) }))
      .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, 'ko'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, axis1, axis2, account, partner, manager, from, pById, fyStart, plCodes])

  const amt = (c: Cell) => c.carry + c.d - c.c
  const total = groups.reduce((s, g) => ({ carry: s.carry + g.cell.carry, d: s.d + g.cell.d, c: s.c + g.cell.c }), { carry: 0, d: 0, c: 0 })
  const pct = (c: Cell) => { const t = amt(total); return t === 0 ? '' : `${((amt(c) / t) * 100).toFixed(2)}%` }
  const accounts = useMemo(() => [...new Set(entries.flatMap((e) => e.lines.map((l) => l.accountName)))].sort(), [entries])
  const managers = useMemo(() => [...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort(), [partners])
  const codeCol1 = withCode && !!CODE_LABEL[axis1]
  const codeCol2 = withCode && !!axis2 && !!CODE_LABEL[axis2]
  const leadCols = 1 + (codeCol1 ? 1 : 0) + (axis2 ? 1 + (codeCol2 ? 1 : 0) : 0)
  const cols = leadCols + 4 + (ratio ? 1 : 0)

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '회계집계표', [groups.length, axis1, axis2, withCode, ratio])

  const nums = (c: Cell) => (
    <>
      <td className="text-right">{won(c.carry)}</td>
      <td className="text-right">{won(c.d)}</td>
      <td className="text-right">{won(c.c)}</td>
      <td className="text-right">{won(amt(c))}</td>
      {ratio && <td className="text-right">{pct(c)}</td>}
    </>
  )
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label className="mr-2.5 inline-flex items-center gap-[3px]">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title="회계집계표"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setAxis1('계정'); setAxis2(''); setWithCode(false); setRatio(false); setAccount(''); setPartner(''); setManager('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="집계조건">
          <span className="mr-1">집계조건1</span>
          <select className="ec-input mr-3 w-[120px]" value={axis1} onChange={(e) => setAxis1(e.target.value as Axis)}>
            {AXES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="mr-1">집계조건2</span>
          <select className="ec-input mr-3 w-[120px]" value={axis2} onChange={(e) => setAxis2(e.target.value as Axis | '')}>
            <option value="">선택안함</option>
            {AXES.filter((a) => a !== axis1).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {check('비율표시', ratio, setRatio)}
          {check('코드포함', withCode, setWithCode)}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-1">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-1.5">
            <EcPeriodPicks labels={AGG_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={200} emptyLabel="전체" value={account} onChange={setAccount} items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={180} emptyLabel="전체" value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </EcCond>
      </ul>

      {truncated && <p className="mb-1.5 text-[var(--ec-warn)]">전표가 많아 앞부분만 받았습니다.</p>}
      <EcReportHead title="회계집계표" period={reportPeriod(from, to)} />
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            {codeCol1 && <th>{CODE_LABEL[axis1]}</th>}
            <th>{axis1}</th>
            {axis2 && codeCol2 && <th>{CODE_LABEL[axis2]}</th>}
            {axis2 && <th>{axis2}</th>}
            <th className="text-right">이월잔액</th>
            <th className="text-right">차변</th>
            <th className="text-right">대변</th>
            <th className="text-right">금액</th>
            {ratio && <th className="text-right">비율</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols} className="p-5 text-center text-[var(--ec-text-hint)]">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={cols} className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {groups.map((g) => (
                <Fragment key={g.name}>
                  {!axis2 ? (
                    <tr>
                      {codeCol1 && <td>{g.code}</td>}
                      <td>{g.name}</td>
                      {nums(g.cell)}
                    </tr>
                  ) : (
                    <>
                      {g.subs.map((s, i) => (
                        <tr key={s.name}>
                          {codeCol1 && <td>{i === 0 ? g.code : ''}</td>}
                          <td>{i === 0 ? g.name : ''}</td>
                          {codeCol2 && <td>{s.code}</td>}
                          <td>{s.name}</td>
                          {nums(s.cell)}
                        </tr>
                      ))}
                      <tr className="ec-total">
                        <td colSpan={leadCols} className="text-center">{g.name} 계</td>
                        {nums(g.cell)}
                      </tr>
                    </>
                  )}
                </Fragment>
              ))}
              <tr className="ec-total">
                <td colSpan={leadCols} className="text-center">합계</td>
                {nums(total)}
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}
