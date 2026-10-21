import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { PARTNER_LEDGER_PICKS } from '../../utils/periods'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt {
  id: number; code: string; name: string; parentId: number | null
  bizRegNo?: string | null; ceoName?: string | null; creditLimit?: number | null; phone?: string | null; mobile?: string | null
  email?: string | null; fax?: string | null; address?: string | null; remark?: string | null
}
type Side = '채권' | '채무'
type SideCond = '전체' | Side
type Mode = '전표별' | '전표별+내역' | '일별' | '월별' | '회계전표별'
const MODES: Mode[] = ['전표별', '전표별+내역', '일별', '월별', '회계전표별']

/**
 * 채권 · 채무의 통제계정 — 계정등록 [관련업무] 가 '채권/채무' 인 계정(원본 E010107, 2026-10-21 실측:
 * 1089 외상매출금은 잡히고 1209 미수금(관련업무 없음)은 거래처가 붙어도 안 잡힌다). 자산이면 채권, 부채면 채무.
 * 채권은 차변이 올리고 대변이 내린다. 채무는 반대. 계정을 못 읽었으면 외상매출금 · 외상매입금.
 */
interface AccountOpt { code: string; division: string; relatedWork: string }
const FALLBACK_CONTROL: Record<Side, Set<string>> = { 채권: new Set(['108']), 채무: new Set(['251']) }
/** 재고 문서(판매 · 구매 · 수금/지급)가 만든 회계전표 — 대장 II 의 [재고채권] 칸. 나머지는 [회계채권]. */
const STOCK_SOURCES = new Set(['SALES', 'PURCHASE', 'SETTLEMENT'])

/** 거래처마다 표가 하나라 표마다 열 수 검사를 단다(머리 2줄 · 이월 · 계 줄의 colSpan). */
function BookTable({ title, mode, children }: { title: string; mode: string; children: React.ReactNode }) {
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [mode])
  return <table ref={tableRef} className="w-full text-left">{children}</table>
}

/** 원장 한 줄 — 회계전표 한 장의 통제계정 몫. */
interface Row { date: string; no: string; text: string; inc: number; dec: number; stock: boolean }
interface Block { side: Side; partnerId: number; carry: number; rows: Row[] }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>거래처관리대장 I</b>(E010833) · <b>거래처관리대장 II</b>(E010842) — 2026-10-20 loginaa 실측.
 *
 * <p><b>회계 전표로 그린다.</b> 재고 I 의 거래처관리대장(/sales/partner-ledger)은 판매 · 구매 · 수금 문서로 그려
 * 매출전표 I · 현금거래(매출처로부터) 같은 회계 전표가 안 잡힌다. 원본은 매출전표 I(외상 11,000) + 매출처로부터(5,000)를
 * 두 대장 모두 잔액 6,000 으로 그린다. 그래서 외상매출금(채권) · 외상매입금(채무) 줄을 거래처마다 늘어놓는다.
 *
 * <p>I: 채권채무구분(전체 · <b>채권</b> · 채무) · 기준일자(기본 <b>전월+금월</b>) · 집계구분(전표별 · <b>전표별+내역</b> · 일별 · 월별 · 회계전표별) ·
 * 거래처 · 대표거래처로 합산(<b>거래처관계기준</b> · 개별거래처기준) · 기타 거래처코드없는자료인쇄 · 결재방표시.
 * 거래처마다 머리(사업자등록번호 · 대표자 · 여신한도 · 전화(모바일) · Email · Fax · 주소 · 적요) + 표
 * '일자 · 적요 · 판매/수금내역(판매 · 수금 · 잔액)' 2줄 머리, 이월잔액 · 전표 줄(잔액 매 줄) · 'YYYY/MM 계' · '누계'.
 * 전표별+내역 · 회계전표별은 회계 전표에 품목 내역이 없어 전표별과 같은 줄이다.
 *
 * <p>II: 기본 <b>전월</b>, 머리 2줄 '일자 · 적요 · 재고채권(증가 · 감소) · 회계채권(증가 · 감소) · 잔액',
 * 줄 '2026/10/20-38'(띄어쓰기 없음) · 'YYYY/MM 월계' · '누계'. 검색하면 조건 판이 접힌다.
 */
export default function PartnerBookPage({ kind }: { kind: 'I' | 'II' }) {
  const title = `거래처관리대장 ${kind}`
  const two = kind === 'II'
  const init = periodOf(two ? '전월' : '전월+금월')!
  const [sideCond, setSideCond] = useState<SideCond>('채권')
  const [mode, setMode] = useState<Mode>('전표별+내역')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [byParent, setByParent] = useState(true)
  const [noCode, setNoCode] = useState(false)
  const [signLine, setSignLine] = useState(false)
  const [fxOnly, setFxOnly] = useState(false)
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)

  const [control, setControl] = useState<Record<Side, Set<string>>>(FALLBACK_CONTROL)

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
    api.get<AccountOpt[]>('/accounts').then((r) => {
      if (!r.data.some((a) => a.relatedWork)) return   // 계정에 [관련업무] 가 없는 옛 서버 — 기본값 그대로
      const of = (div: string) => new Set(r.data.filter((a) => a.relatedWork === 'RECEIVABLE_PAYABLE' && a.division === div).map((a) => a.code))
      setControl({ 채권: of('ASSET'), 채무: of('LIABILITY') })
    }).catch(() => setControl(FALLBACK_CONTROL))
  }, [])

  async function load() {
    const my = ++seq.current
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: '1900-01-01', to, all: true } })
      if (my !== seq.current) return   // 늦게 온 옛 응답은 버린다
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      if (my === seq.current) setError(extractErrorMessage(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }

  const byId = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners])

  const blocks = useMemo(() => {
    if (!entries) return [] as Block[]
    const pick = partner ? Number(partner) : null
    const sides: Side[] = sideCond === '전체' ? ['채권', '채무'] : [sideCond]
    /* 거래처관계기준이면 대표거래처 밑의 거래처를 대표로 모은다. */
    const keyOf = (id: number) => (byParent ? byId.get(id)?.parentId ?? id : id)
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    const out: Block[] = []
    for (const side of sides) {
      const m = new Map<number, Block>()
      for (const e of sorted) {
        /* 줄마다 거래처가 다를 수 있다(일반전표 줄 거래처) — 전표 한 장을 거래처별로 나눠 센다. */
        const per = new Map<number, { inc: number; dec: number }>()
        for (const l of e.lines) {
          if (!control[side].has(l.accountCode)) continue
          const d = Number(l.debit), c = Number(l.credit)
          const pid = l.partnerId ?? e.partnerId ?? null
          if (pid == null && !noCode) continue
          const key = pid == null ? 0 : keyOf(pid)
          const v = per.get(key) ?? { inc: 0, dec: 0 }
          v.inc += side === '채권' ? d : c
          v.dec += side === '채권' ? c : d
          per.set(key, v)
        }
        for (const [key, { inc, dec }] of per) {
          if (inc === 0 && dec === 0) continue
          if (pick != null && key !== pick) continue
          if (!m.has(key)) m.set(key, { side, partnerId: key, carry: 0, rows: [] })
          const b = m.get(key)!
          if (e.entryDate < from) b.carry += inc - dec
          else b.rows.push({ date: e.entryDate, no: e.docNo, text: e.description ?? '', inc, dec, stock: STOCK_SOURCES.has(e.sourceType) })
        }
      }
      out.push(...[...m.values()].filter((b) => b.rows.length > 0 || b.carry !== 0)
        .sort((a, b) => (byId.get(a.partnerId)?.code ?? '').localeCompare(byId.get(b.partnerId)?.code ?? '')))
    }
    return out
  }, [entries, partner, sideCond, byParent, byId, noCode, from, control])

  const reset = () => {
    setSideCond('채권'); setMode('전표별+내역'); setFrom(init.from); setTo(init.to); setPartner(''); setByParent(true)
    setNoCode(false); setSignLine(false); setFxOnly(false); setEntries(null)
  }
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )
  const radios = <T extends string>(name: string, opts: readonly T[], v: T, set: (x: T) => void) => opts.map((o) => (
    <label key={o} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="radio" name={name} checked={v === o} onChange={() => set(o)} /> {o}
    </label>
  ))

  /** 원본 대장 I 머리 — 빈 값도 이름은 남긴다(원본 꼴). */
  const headline = (p: PartnerOpt | undefined) => [
    `사업자등록번호 : ${p?.bizRegNo ?? ''}`,
    `대표자 : ${p?.ceoName ?? ''}`,
    `여신한도 : ${won(Number(p?.creditLimit ?? 0)) || '0'}`,
    `전화(모바일) : ${p?.phone ?? ''}${p?.mobile ? ` (${p.mobile})` : ''}`,
    `Email : ${p?.email ?? ''}`,
    `Fax : ${p?.fax ?? ''}`,
    `주소 : ${p?.address ?? ''}`,
    `적요 : ${p?.remark ?? ''}`,
  ]

  /** 전표별 · 일별 · 월별 묶음 — 일별 · 월별은 하루 · 한 달을 한 줄로. */
  function groupsOf(rows: Row[]) {
    const unit = mode === '월별' ? 7 : 10
    const gs: { key: string; rows: Row[] }[] = []
    for (const r of rows) {
      const last = gs[gs.length - 1]
      if ((mode === '일별' || mode === '월별') && last && last.key === r.date.slice(0, unit)) last.rows.push(r)
      else gs.push({ key: mode === '일별' || mode === '월별' ? r.date.slice(0, unit) : `${r.no}|${gs.length}`, rows: [r] })
    }
    return gs
  }
  const sum = (rows: Row[]) => rows.reduce((s, r) => ({
    inc: s.inc + r.inc, dec: s.dec + r.dec,
    si: s.si + (r.stock ? r.inc : 0), sd: s.sd + (r.stock ? r.dec : 0),
    ai: s.ai + (r.stock ? 0 : r.inc), ad: s.ad + (r.stock ? 0 : r.dec),
  }), { inc: 0, dec: 0, si: 0, sd: 0, ai: 0, ad: 0 })

  function blockTable(b: Block) {
    const p = byId.get(b.partnerId)
    const name = b.partnerId === 0 ? '(거래처코드 없음)' : (p?.name ?? '')
    const months = [...new Set(b.rows.map((r) => r.date.slice(0, 7)))]
    const gs = groupsOf(b.rows)
    const all = sum(b.rows)
    const label = (r: Row, key: string) => mode === '일별' || mode === '월별' ? slash(key) : (two ? dateNo(r.date, r.no).replace(' -', '-') : dateNo(r.date, r.no))
    const cols = two ? 7 : 5
    const [up, down] = b.side === '채권' ? ['판매', '수금'] : ['구매', '지급']
    let bal = b.carry
    return (
      <div key={`${b.side}-${b.partnerId}`} className="mb-[18px]">
        <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
          <span className="font-bold">{p?.code ? `${p.code} ` : ''}{name}{sideCond === '전체' ? ` (${b.side})` : ''}</span>
        </div>
        {!two && (
          <div className="text-[12px] mb-[4px] flex flex-wrap gap-x-[14px]">
            {headline(p).map((t) => <span key={t}>{t}</span>)}
          </div>
        )}
        <BookTable title={title} mode={mode}>
          <thead>
            {two ? (
              <>
                <tr>
                  <th rowSpan={2}>일자</th>
                  <th rowSpan={2}>적요</th>
                  <th colSpan={2} className="text-center">재고{b.side}</th>
                  <th colSpan={2} className="text-center">회계{b.side}</th>
                  <th rowSpan={2} className="text-right">잔액</th>
                </tr>
                <tr>
                  <th className="text-right">증가</th>
                  <th className="text-right">감소</th>
                  <th className="text-right">증가</th>
                  <th className="text-right">감소</th>
                </tr>
              </>
            ) : (
              <>
                <tr>
                  <th rowSpan={2}>일자</th>
                  <th rowSpan={2}>적요</th>
                  <th colSpan={3} className="text-center">{up}/{down}내역</th>
                </tr>
                <tr>
                  <th className="text-right">{up}</th>
                  <th className="text-right">{down}</th>
                  <th className="text-right">잔액</th>
                </tr>
              </>
            )}
          </thead>
          <tbody>
            <tr>
              <td colSpan={cols - 1} className="text-center">이월잔액</td>
              <td className="text-right">{won(b.carry)}</td>
            </tr>
            {months.map((mo) => {
              const mg = gs.filter((g) => g.rows[0].date.slice(0, 7) === mo)
              const ms = sum(mg.flatMap((g) => g.rows))
              return (
                <Fragment key={mo}>
                  {mg.map((g) => {
                    const x = sum(g.rows)
                    bal += x.inc - x.dec
                    const r = g.rows[0]
                    return (
                      <tr key={g.key}>
                        <td className="text-ec-blue">{label(r, g.key)}</td>
                        <td>{mode === '일별' || mode === '월별' ? '' : r.text}</td>
                        {two ? (
                          <>
                            <td className="text-right">{won(x.si)}</td>
                            <td className="text-right">{won(x.sd)}</td>
                            <td className="text-right">{won(x.ai)}</td>
                            <td className="text-right">{won(x.ad)}</td>
                          </>
                        ) : (
                          <>
                            <td className="text-right">{won(x.inc)}</td>
                            <td className="text-right">{won(x.dec)}</td>
                          </>
                        )}
                        <td className="text-right">{won(bal)}</td>
                      </tr>
                    )
                  })}
                  <tr className="font-bold bg-ec-head">
                    <td colSpan={2} className="text-center">{slash(mo)} {two ? '월계' : '계'}</td>
                    {two ? (
                      <>
                        <td className="text-right">{won(ms.si)}</td>
                        <td className="text-right">{won(ms.sd)}</td>
                        <td className="text-right">{won(ms.ai)}</td>
                        <td className="text-right">{won(ms.ad)}</td>
                      </>
                    ) : (
                      <>
                        <td className="text-right">{won(ms.inc)}</td>
                        <td className="text-right">{won(ms.dec)}</td>
                      </>
                    )}
                    <td></td>
                  </tr>
                </Fragment>
              )
            })}
            <tr className="font-bold bg-ec-head">
              <td colSpan={2} className="text-center">누계</td>
              {two ? (
                <>
                  <td className="text-right">{won(all.si)}</td>
                  <td className="text-right">{won(all.sd)}</td>
                  <td className="text-right">{won(all.ai)}</td>
                  <td className="text-right">{won(all.ad)}</td>
                </>
              ) : (
                <>
                  <td className="text-right">{won(all.inc)}</td>
                  <td className="text-right">{won(all.dec)}</td>
                </>
              )}
              <td className="text-right">{won(b.carry + all.inc - all.dec)}</td>
            </tr>
          </tbody>
        </BookTable>
      </div>
    )
  }

  const actions = two
    ? [{ label: '검색(F8)', primary: true, onClick: load }, { label: '다시 작성', onClick: reset }, { label: '인쇄' }, { label: 'Excel' }]
    : [{ label: '검색(F8)', primary: true, onClick: load }, { label: '다시 작성', onClick: reset }, { label: '인쇄' }, { label: 'Email' }, { label: 'Excel' }]

  return (
    <EcListShell title={title} searchable={false} signLine={signLine} onReset={reset} actions={actions}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="채권채무구분">{radios(`pb${kind}-side`, ['전체', '채권', '채무'] as const, sideCond, setSideCond)}</EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={PARTNER_LEDGER_PICKS} currentFrom={from} onPick={(r) => { if (r.from) setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        {!two && <EcCond label="집계구분">{radios(`pb${kind}-mode`, MODES, mode, setMode)}</EcCond>}
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="대표거래처로 합산">
          {radios(`pb${kind}-parent`, ['거래처관계기준', '개별거래처기준'] as const, byParent ? '거래처관계기준' : '개별거래처기준', (v) => setByParent(v === '거래처관계기준'))}
        </EcCond>
        <EcCond label="기타">
          {two && check('결재방표시', signLine, setSignLine)}
          {check('거래처코드없는자료인쇄', noCode, setNoCode)}
          {two && check('외화금액만표시', fxOnly, setFxOnly)}
        </EcCond>
        {!two && <EcCond label="적용양식">{check('결재방표시', signLine, setSignLine)}</EcCond>}
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      {loading ? (
        <p className="ec-empty">불러오는 중…</p>
      ) : !entries ? null : (
        <>
          <EcReportHead title={title} period={reportPeriod(from, to)} />
          {fxOnly || blocks.length === 0 ? (
            <p className="ec-empty">등록된 데이터가 없습니다.</p>
          ) : blocks.map(blockTable)}
        </>
      )}
    </EcListShell>
  )
}
