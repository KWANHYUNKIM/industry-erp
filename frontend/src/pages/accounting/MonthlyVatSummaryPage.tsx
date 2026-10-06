import { useEffect, useMemo, useRef, useState } from 'react'
import { vatSlipAmounts } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 빠른선택 — 결산 묶음 뒤에 최근30일(기본). */
const PICKS = [...SETTLE_PICKS, '최근30일'] as const

type Side = '매출' | '매입'
const AMOUNTS = ['공급가액+VAT', '공급가액', 'VAT'] as const
type Amount = (typeof AMOUNTS)[number]
const KIND_NAME = '세금계산서'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; code: string; name: string; manager: string | null }

/**
 * 회계 I &gt; 경영자료 &gt; <b>월별매출집계표</b>(E010839) · <b>월별매입집계표</b>(E010838) — 2026-10-03 loginaa 실측(매출은 자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일</b>, 빠른선택 … 이번기수 · 직전기수 · 종료일 · 최근30일) · 거래처 · 부서 · 프로젝트 · 거래처관리담당자 ·
 * 판매액(매입은 구매액, 기본 <b>공급가액+VAT</b>) · 부가세유형 · 기타([월별동일금액제외] 꺼짐) · 적용양식 · 양식구분([결재방표시]).
 *
 * <p>표는 거래처코드 · 거래처명 · 달마다 'YYYY.M' 열 · 집계(머리 굵게), 끝 [합계](두 칸 묶음). 거래처마다 한 줄, 처음 나온 차례.
 * 금액은 매입/매출장과 같은 줄(부가세 255 · 135 가 든 회계전표)에서 공급가액 · VAT 를 떼어 고른 쪽을 더한다.
 * [월별동일금액제외]는 나온 달마다 금액이 같은 거래처를 뺀다. 부가세유형은 우리 전표가 세금계산서 하나뿐이다.
 * 부서 · 프로젝트는 회계전표에 없다. 이 화면은 인라인 style · 색 값을 쓰지 않는다(style-check 래칫).
 */
export default function MonthlyVatSummaryPage({ side }: { side: Side }) {
  const title = side === '매출' ? '월별매출집계표' : '월별매입집계표'
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [amount, setAmount] = useState<Amount>('공급가액+VAT')
  const [kind, setKind] = useState('')
  const [sameOut, setSameOut] = useState(false)
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [manager, setManager] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      setEntries(r.data.rows)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const pById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners])
  const { months, rows } = useMemo(() => {
    const ms = new Set<string>()
    const m = new Map<number, { code: string; name: string; by: Record<string, number> }>()
    if (kind && kind !== KIND_NAME) return { months: [] as string[], rows: [] as { key: number; code: string; name: string; by: Record<string, number> }[] }
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      if (e.partnerId == null) continue
      if (partner && String(e.partnerId) !== partner) continue
      const p = pById.get(e.partnerId)
      if (manager && (p?.manager ?? '') !== manager) continue
      /* 반품(역분개)은 공급가액도 음수다 — utils/vatSlip. */
      const amt = vatSlipAmounts(e.lines, side)
      if (!amt) continue
      const { supply, vat } = amt
      const v = amount === '공급가액' ? supply : amount === 'VAT' ? vat : supply + vat
      const ym = `${Number(e.entryDate.slice(0, 4))}.${Number(e.entryDate.slice(5, 7))}`
      ms.add(ym)
      if (!m.has(e.partnerId)) m.set(e.partnerId, { code: p?.code ?? '', name: p?.name ?? e.partnerName ?? '', by: {} })
      const g = m.get(e.partnerId)!
      g.by[ym] = (g.by[ym] ?? 0) + v
    }
    const rs = [...m.entries()].map(([key, g]) => ({ key, ...g }))
      .filter((g) => !sameOut || new Set(Object.values(g.by).map((x) => Math.round(x))).size > 1)
    const order = (s: string) => { const [y, mo] = s.split('.').map(Number); return y * 12 + mo }
    return { months: [...ms].sort((a, b) => order(a) - order(b)), rows: rs }
  }, [entries, pById, partner, manager, side, amount, kind, sameOut])
  const sumOf = (by: Record<string, number>) => Object.values(by).reduce((s, v) => s + v, 0)
  const colTotal = (ym: string) => rows.reduce((s, r) => s + (r.by[ym] ?? 0), 0)
  const managers = useMemo(() => [...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort(), [partners])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [rows.length, months.length])

  return (
    <EcListShell
      title={side === '매출' ? '월별매출집계표' : '월별매입집계표'}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setAmount('공급가액+VAT'); setKind(''); setSameOut(false); setPartner(''); setManager('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-1">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-1.5">
            <EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={180} emptyLabel="전체" value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        {side === '매출' ? (
          <EcCond label="판매액">
            <select className="ec-input w-[140px]" value={amount} onChange={(e) => setAmount(e.target.value as Amount)}>
              {AMOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </EcCond>
        ) : (
          <EcCond label="구매액">
            <select className="ec-input w-[140px]" value={amount} onChange={(e) => setAmount(e.target.value as Amount)}>
              {AMOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </EcCond>
        )}
        <EcCond label="부가세유형">
          <select className="ec-input w-[140px]" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">전체</option>
            <option value={KIND_NAME}>{KIND_NAME}</option>
          </select>
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={sameOut} onChange={(e) => setSameOut(e.target.checked)} /> 월별동일금액제외
          </label>
        </EcCond>
      </ul>

      <EcReportHead title={side === '매출' ? '월별매출집계표' : '월별매입집계표'} period={reportPeriod(from, to)} />
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>거래처코드</th>
            <th>거래처명</th>
            {months.map((m) => <th key={m} className="text-right">{m}</th>)}
            <th className="text-right">집계</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={months.length + 3} className="p-5 text-center text-[var(--ec-text-hint)]">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={months.length + 3} className="p-5 text-center text-[var(--ec-text-hint)]">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  {months.map((m) => <td key={m} className="text-right">{won(r.by[m] ?? 0)}</td>)}
                  <td className="text-right">{won(sumOf(r.by))}</td>
                </tr>
              ))}
              <tr className="ec-total">
                <td colSpan={2} className="text-center">합계</td>
                {months.map((m) => <td key={m} className="text-right">{won(colTotal(m))}</td>)}
                <td className="text-right">{won(rows.reduce((s, r) => s + sumOf(r.by), 0))}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}
