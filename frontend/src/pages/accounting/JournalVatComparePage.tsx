import { useMemo, useRef, useState } from 'react'
import { vatSlipAmounts, type VatSide } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import type { JournalEntry } from '../../types/api'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
type SideCond = '전체' | VatSide
type Base = '전표자료' | '매출매입자료'
type Has = '전체' | '있는것' | '없는것'
type Mismatch = '전체' | '거래처불일치만' | '합계불일치만'
type Order = '전표번호순' | '매출매입자료순'
interface Material { side: VatSide; supply: number; vat: number; total: number }
interface Pair { e: JournalEntry; m: Material | null; debit: number; credit: number }

const PICKS = ['금일', '전일', '금월(~오늘)', '전월', '직전분기', '직전반기', '종료일'] as const
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const radio = <T extends string>(name: string, values: readonly T[], value: T, set: (v: T) => void, labels?: Record<string, string>) =>
  values.map((v) => (
    <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
      <input type="radio" name={name} checked={value === v} onChange={() => set(v)} /> {labels?.[v] ?? v}
    </label>
  ))

/** 회계전표의 매출매입자료 — 부가세 줄(매출 255 · 매입 135)에서 읽는다. 두 쪽 다 있으면 매출을 쓴다. */
function materialOf(e: JournalEntry): Material | null {
  for (const side of ['매출', '매입'] as VatSide[]) {
    const a = vatSlipAmounts(e.lines, side)
    if (a) return { side, supply: a.supply, vat: a.vat, total: a.supply + a.vat }
  }
  return null
}

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>전표vs매출매입자료비교</b>(E030211) — 2026-10-04 loginaa 실측.
 *
 * <p>조건 [조회일자(기본 직전분기 — 10/04 에 2026/07/01 ~ 09/30) · 계정명 · 부서 · 거래처 · 세무신고거래처 · 매출/매입구분(◉전체) · 부가세유형 ·
 * 기준자료 ◉전표자료 ○매출매입자료 / 전표기준 ○전체 ◉매출매입자료 있는 것만 ○없는 것만 / 조회자료 ○전체 ○거래처불일치만 ◉합계불일치만 ·
 * 순서 ◉전표번호순 · 기타 ☑동일전표병합], 아래 [검색(F8) · 금일 · 전일 · 금월(~오늘) · 전월 · 직전분기 · 직전반기 · 종료일].
 * 판은 왼쪽 전표자료 [전표번호 · 계정 · 거래처 · 차변 · 대변], 오른쪽 매출매입자료 [매출매입번호 · 유형명 · 거래처 · 공급가액 · 부가세 · 합계] —
 * 전표 한 장의 줄마다 한 줄, 첫 줄에만 전표번호와 매출매입자료. 끝에 합계(원본 2026/07~09 전체 255,585,000 · 255,585,000 · 232,350,000 ·
 * 23,235,000 · 255,585,000).
 *
 * <p>우리 매출매입자료는 회계전표의 부가세 줄에서 나온다(회계 I 매입매출전표와 같은 셈) — 그래서 거래처는 늘 같고, 합계불일치는 전표에
 * 부가세 · 공급가액 말고 다른 줄이 차변(매입) · 대변(매출)으로 더 섰을 때 생긴다. 줄 거래처는 전표 머리 거래처다.
 *
 * <p>두지 않은 것: 계정명 · 부서 · 거래처 · 세무신고거래처 · 부가세유형 조건, 동일전표병합 끄기, [설정] · [다시 작성].
 */
export default function JournalVatComparePage() {
  const init = periodOf('직전분기')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [sideCond, setSideCond] = useState<SideCond>('전체')
  const [base, setBase] = useState<Base>('전표자료')
  const [has, setHas] = useState<Has>('있는것')
  const [mismatch, setMismatch] = useState<Mismatch>('합계불일치만')
  const [order, setOrder] = useState<Order>('전표번호순')
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [shown, setShown] = useState({ from, to })
  const [error, setError] = useState('')

  async function search() {
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      setEntries(r.data.rows); setShown({ from, to })
    } catch (e) {
      setEntries(null); setError(extractErrorMessage(e))
    }
  }

  const pairs = useMemo(() => {
    if (!entries) return []
    const out: Pair[] = []
    for (const e of entries) {
      const m = materialOf(e)
      if (sideCond !== '전체' && m?.side !== sideCond) continue
      /* 매출매입자료 기준이면 자료가 있는 전표만 — 우리 자료는 전표에서 나오므로 전표 없는 자료가 없다. */
      if (base === '매출매입자료' || has === '있는것') { if (!m) continue } else if (has === '없는것' && m) continue
      const debit = e.lines.reduce((s, l) => s + Number(l.debit), 0)
      const credit = e.lines.reduce((s, l) => s + Number(l.credit), 0)
      if (mismatch === '합계불일치만' && (!m || m.total === debit)) continue
      if (mismatch === '거래처불일치만') continue
      out.push({ e, m, debit, credit })
    }
    const byNo = (a: Pair, b: Pair) => (a.e.entryDate !== b.e.entryDate ? a.e.entryDate.localeCompare(b.e.entryDate) : a.e.docNo.localeCompare(b.e.docNo))
    return out.sort((a, b) => (order === '매출매입자료순' && a.m?.side !== b.m?.side ? (a.m?.side === '매입' ? -1 : 1) : byNo(a, b)))
  }, [entries, sideCond, base, has, mismatch, order])

  const total = pairs.reduce((s, p) => ({
    debit: s.debit + p.debit, credit: s.credit + p.credit,
    supply: s.supply + (p.m?.supply ?? 0), vat: s.vat + (p.m?.vat ?? 0), sum: s.sum + (p.m?.total ?? 0),
  }), { debit: 0, credit: 0, supply: 0, vat: 0, sum: 0 })

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '전표vs매출매입자료비교', [pairs.length])

  return (
    <EcListShell title="전표vs매출매입자료비교" onSearch={() => setEntries(null)} option={false}
                 actions={entries ? [{ label: '인쇄', primary: true }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {!entries && (
        <ul className="ec-cond mb-[8px]">
          <EcCond label="조회일자">
            <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            ~
            <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </EcCond>
          <EcCond label="매출/매입구분">{radio('jvc-side', ['전체', '매출', '매입'] as const, sideCond, setSideCond)}</EcCond>
          <EcCond label="기준자료">
            <div className="w-full">{radio('jvc-base', ['전표자료', '매출매입자료'] as const, base, setBase)}</div>
            <div className="w-full mt-[4px]">
              <span className="mr-[6px]">전표기준</span>
              {radio('jvc-has', ['전체', '있는것', '없는것'] as const, has, setHas,
                { 있는것: '매출매입자료 있는 것만', 없는것: '매출매입자료 없는 것만' })}
            </div>
            <div className="w-full mt-[4px]">
              <span className="mr-[6px]">조회자료</span>
              {radio('jvc-mismatch', ['전체', '거래처불일치만', '합계불일치만'] as const, mismatch, setMismatch)}
            </div>
          </EcCond>
          <EcCond label="순서">{radio('jvc-order', ['전표번호순', '매출매입자료순'] as const, order, setOrder)}</EcCond>
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
              <EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
            </div>
          </li>
        </ul>
      )}

      {entries && (
        <>
          <EcReportHead title="전표vs매출매입자료비교" period={reportPeriod(shown.from, shown.to)} />
          <table ref={tableRef} className="w-full ec-report">
            <thead>
              <tr>
                <th colSpan={5} className="text-center">전표자료</th>
                <th colSpan={6} className="text-center">매출매입자료</th>
              </tr>
              <tr>
                <th>전표번호</th><th>계정</th><th>거래처</th><th className="text-right">차변</th><th className="text-right">대변</th>
                <th>매출매입번호</th><th>유형명</th><th>거래처</th>
                <th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
              </tr>
            </thead>
            <tbody>
              {pairs.length === 0 ? (
                <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : pairs.flatMap(({ e, m }) => e.lines.map((l, i) => {
                const head = i === 0
                return (
                  <tr key={`${e.id}-${l.id}`}>
                    <td>{head ? dateNo(e.entryDate, e.docNo) : ''}</td>
                    <td>{l.accountName}</td>
                    <td>{e.partnerName ?? ''}</td>
                    <td className="text-right">{won(Number(l.debit))}</td>
                    <td className="text-right">{won(Number(l.credit))}</td>
                    <td>{head && m ? dateNo(e.entryDate, e.docNo) : ''}</td>
                    <td>{head && m ? (m.vat === 0 ? '계산서' : '세금계산서') : ''}</td>
                    <td>{head && m ? e.partnerName ?? '' : ''}</td>
                    <td className="text-right">{head && m ? won(m.supply) : ''}</td>
                    <td className="text-right">{head && m ? won(m.vat) : ''}</td>
                    <td className="text-right">{head && m ? won(m.total) : ''}</td>
                  </tr>
                )
              }))}
              <tr className="ec-total">
                <td colSpan={3} className="text-center font-bold">합계</td>
                <td className="text-right font-bold">{won(total.debit)}</td>
                <td className="text-right font-bold">{won(total.credit)}</td>
                <td colSpan={3} />
                <td className="text-right font-bold">{won(total.supply)}</td>
                <td className="text-right font-bold">{won(total.vat)}</td>
                <td className="text-right font-bold">{won(total.sum)}</td>
              </tr>
            </tbody>
          </table>
          <EcReportFoot />
        </>
      )}
    </EcListShell>
  )
}
