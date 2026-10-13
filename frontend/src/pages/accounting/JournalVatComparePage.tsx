import { useEffect, useMemo, useRef, useState } from 'react'
import { vatSlipAmounts, type VatSide } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import type { JournalEntry } from '../../types/api'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
type SideCond = '전체' | VatSide
type Base = '전표자료' | '매출매입자료'
export type Has = '전체' | '있는것' | '없는것'
export type Mismatch = '전체' | '거래처불일치만' | '합계불일치만'
type Order = '전표번호순' | '매출매입자료순'
interface Material { side: VatSide; code: string; name: string; supply: number; vat: number; total: number }
interface Pair { e: JournalEntry; m: Material | null; lines: JournalEntry['lines']; debit: number; credit: number }
interface Opt { id: number; code: string; name: string }

/** 원본 [부가세유형] 코드도움(부가세유형코드) — 2026-10-13 loginaa 실측 34개. */
const VAT_TYPES: { side: VatSide; code: string; name: string }[] = ([
  ['매출', '11', '세금계산서'], ['매출', '12', '영세율'], ['매출', '13', '계산서'], ['매출', '14', '소매매출'], ['매출', '16', '수출'],
  ['매출', '17', '카드매출'], ['매출', '18', '계산서(고정자산)'], ['매출', '19', '세.계(고정자산)'], ['매출', '1A', '소매(면세)'],
  ['매출', '1B', '카드매출(면세)'], ['매출', '1C', '현금영수증(면세)'], ['매출', '1D', '현금영수증'], ['매출', '1F', '매입자발행세금계산서'],
  ['매출', '1G', '영세율(기타)'], ['매출', '1Z', '기타매출'],
  ['매입', '21', '세금계산서'], ['매입', '22', '영세율'], ['매입', '23', '계산서'], ['매입', '24', '세금계산서(불공)'], ['매입', '25', '세금계산서(수입)'],
  ['매입', '26', '현금영수증'], ['매입', '27', '카드매입'], ['매입', '28', '세.계(고정-수입)'], ['매입', '29', '세.계(고정자산)'],
  ['매입', '2A', '영세율(수입)'], ['매입', '2B', '계산서(수입)'], ['매입', '2C', '세.계(고정-불공)'], ['매입', '2D', '계산서(고정자산)'],
  ['매입', '2E', '신용카드(고정자산)'], ['매입', '2F', '매입자발행세금계산서'], ['매입', '2G', '현금영수증(고정자산)'], ['매입', '2X', '기타수입'],
  ['매입', '2Y', '재활용'], ['매입', '2Z', '기타매입'],
] as const).map(([side, code, name]) => ({ side, code, name }))

/** 원본 한 쪽에 전표 15장(2026-10-13 1469 상품 세금계산서 — 16장이 1 · 2 쪽, 합계줄은 그 쪽 것). */
const PER_PAGE = 15

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
    /* 우리 매출매입자료는 부가세 줄에서 나오므로 유형은 세금계산서 · 계산서(부가세 0) 둘뿐이다. */
    const code = side === '매출' ? (a?.vat === 0 ? '13' : '11') : (a?.vat === 0 ? '23' : '21')
    if (a) return { side, code, name: a.vat === 0 ? '계산서' : '세금계산서', supply: a.supply, vat: a.vat, total: a.supply + a.vat }
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
 * <p>2026-10-13 다시 잼: [계정명](여러 개 · 코드도움) · [거래처] · [부가세유형](부가세유형코드 34개, 여러 개) 조건 — 계정명을 고르면 그 계정 줄만 보이고
 * 차변 · 대변도 그 줄만 더한다(지출증빙현황 8109 복리후생비(판) 증빙없음 링크: 2026/05/28 -45 의 세 줄 100,000 · 24,000 · 1,200,000).
 * 매출매입자료가 없는 전표는 첫 줄의 공급가액 · 부가세 · 합계에 0 을 찍는다. [전표기준]이 '없는 것만'이면 [조회자료] 줄은 숨는다.
 * 한 쪽에 전표 15장, 합계줄은 그 쪽 합계(1469 상품 세금계산서 16장 → 1 쪽 270,782,000, 지출증빙현황 합계 321,782,000).
 * 지출증빙현황 금액 링크가 이 화면을 조건 채운 채 창으로 띄운다({@link JournalVatCompareView} 의 init).
 *
 * <p>두지 않은 것: 부서 · 세무신고거래처 조건, 동일전표병합 끄기, [설정] · [다시 작성].
 */
export interface JvcInit {
  from?: string; to?: string
  accountIds?: string[]; vatTypes?: string[]
  has?: Has; mismatch?: Mismatch
}

export default function JournalVatComparePage() {
  return <JournalVatCompareView />
}

export function JournalVatCompareView({ init }: { init?: JvcInit }) {
  const p0 = periodOf('직전분기')!
  const [from, setFrom] = useState(init?.from ?? p0.from)
  const [to, setTo] = useState(init?.to ?? p0.to)
  const [accountIds, setAccountIds] = useState<string[]>(init?.accountIds ?? [])
  const [partnerId, setPartnerId] = useState('')
  const [vatTypes, setVatTypes] = useState<string[]>(init?.vatTypes ?? [])
  const [sideCond, setSideCond] = useState<SideCond>('전체')
  const [base, setBase] = useState<Base>('전표자료')
  const [has, setHas] = useState<Has>(init?.has ?? '있는것')
  const [mismatch, setMismatch] = useState<Mismatch>(init?.mismatch ?? '합계불일치만')
  const [order, setOrder] = useState<Order>('전표번호순')
  const [accounts, setAccounts] = useState<Opt[]>([])
  const [partners, setPartners] = useState<Opt[]>([])
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [shown, setShown] = useState({ from, to })
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Opt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<Opt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
    if (init) void search()   // 링크로 열면 조건을 채운 채 바로 조회한다(원본 지출증빙현황 → 이 창)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function search() {
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      setEntries(r.data.rows); setShown({ from, to }); setPage(1)
    } catch (e) {
      setEntries(null); setError(extractErrorMessage(e))
    }
  }

  const pairs = useMemo(() => {
    if (!entries) return []
    const accSet = new Set(accountIds.map(Number))
    const out: Pair[] = []
    for (const e of entries) {
      const m = materialOf(e)
      if (sideCond !== '전체' && m?.side !== sideCond) continue
      if (partnerId && String(e.partnerId ?? '') !== partnerId) continue
      if (vatTypes.length > 0 && (!m || !vatTypes.includes(m.code))) continue
      /* 매출매입자료 기준이면 자료가 있는 전표만 — 우리 자료는 전표에서 나오므로 전표 없는 자료가 없다. */
      if (base === '매출매입자료' || has === '있는것') { if (!m) continue } else if (has === '없는것' && m) continue
      const fullDebit = e.lines.reduce((s, l) => s + Number(l.debit), 0)
      if (has !== '없는것' && mismatch === '합계불일치만' && (!m || m.total === fullDebit)) continue
      if (has !== '없는것' && mismatch === '거래처불일치만') continue
      const lines = accSet.size > 0 ? e.lines.filter((l) => accSet.has(l.accountId)) : e.lines
      if (lines.length === 0) continue
      const debit = lines.reduce((s, l) => s + Number(l.debit), 0)
      const credit = lines.reduce((s, l) => s + Number(l.credit), 0)
      out.push({ e, m, lines, debit, credit })
    }
    const byNo = (a: Pair, b: Pair) => (a.e.entryDate !== b.e.entryDate ? a.e.entryDate.localeCompare(b.e.entryDate) : a.e.docNo.localeCompare(b.e.docNo))
    return out.sort((a, b) => (order === '매출매입자료순' && a.m?.side !== b.m?.side ? (a.m?.side === '매입' ? -1 : 1) : byNo(a, b)))
  }, [entries, accountIds, partnerId, vatTypes, sideCond, base, has, mismatch, order])

  const pages = Math.max(1, Math.ceil(pairs.length / PER_PAGE))
  const cur = Math.min(page, pages)
  const pagePairs = pairs.slice((cur - 1) * PER_PAGE, cur * PER_PAGE)
  const total = pagePairs.reduce((s, p) => ({
    debit: s.debit + p.debit, credit: s.credit + p.credit,
    supply: s.supply + (p.m?.supply ?? 0), vat: s.vat + (p.m?.vat ?? 0), sum: s.sum + (p.m?.total ?? 0),
  }), { debit: 0, credit: 0, supply: 0, vat: 0, sum: 0 })

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '전표vs매출매입자료비교', [pagePairs.length])

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
          <EcCond label="계정명">
            <CodePickerField label="계정명" hideLabel multiple width={360} emptyLabel="" values={accountIds}
                             onChangeMulti={(v) => setAccountIds(v)}
                             items={accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
          </EcCond>
          <EcCond label="거래처">
            <CodePickerField label="거래처" hideLabel width={360} emptyLabel="" value={partnerId}
                             onChange={(v) => setPartnerId(v)}
                             items={partners.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
          </EcCond>
          <EcCond label="매출/매입구분">{radio('jvc-side', ['전체', '매출', '매입'] as const, sideCond, setSideCond)}</EcCond>
          <EcCond label="부가세유형">
            <CodePickerField label="부가세유형" hideLabel multiple width={360} emptyLabel="" values={vatTypes}
                             onChangeMulti={(v) => setVatTypes(v)}
                             items={VAT_TYPES.map((t) => ({ value: t.code, code: t.code, name: t.name, sub: t.side }))} />
          </EcCond>
          <EcCond label="기준자료">
            <div className="w-full">{radio('jvc-base', ['전표자료', '매출매입자료'] as const, base, setBase)}</div>
            <div className="w-full mt-[4px]">
              <span className="mr-[6px]">전표기준</span>
              {radio('jvc-has', ['전체', '있는것', '없는것'] as const, has, setHas,
                { 있는것: '매출매입자료 있는 것만', 없는것: '매출매입자료 없는 것만' })}
            </div>
            {has !== '없는것' && (
              <div className="w-full mt-[4px]">
                <span className="mr-[6px]">조회자료</span>
                {radio('jvc-mismatch', ['전체', '거래처불일치만', '합계불일치만'] as const, mismatch, setMismatch)}
              </div>
            )}
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
          {pages > 1 && (
            <div className="ec-paging mb-[4px]">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" className={n === cur ? 'active' : ''} onClick={() => setPage(n)}>{n}</button>
              ))}
            </div>
          )}
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
              {pagePairs.length === 0 ? (
                <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : pagePairs.flatMap(({ e, m, lines }) => lines.map((l, i) => {
                const head = i === 0
                return (
                  <tr key={`${e.id}-${l.id}`}>
                    <td>{head ? dateNo(e.entryDate, e.docNo) : ''}</td>
                    <td>{l.accountName}</td>
                    <td>{e.partnerName ?? ''}</td>
                    <td className="text-right">{won(Number(l.debit))}</td>
                    <td className="text-right">{won(Number(l.credit))}</td>
                    <td>{head && m ? dateNo(e.entryDate, e.docNo) : ''}</td>
                    <td>{head && m ? m.name : ''}</td>
                    <td>{head && m ? e.partnerName ?? '' : ''}</td>
                    {/* 자료가 없는 전표도 첫 줄엔 0 을 찍는다(원본) */}
                    <td className="text-right">{head ? won(m?.supply ?? 0) : ''}</td>
                    <td className="text-right">{head ? won(m?.vat ?? 0) : ''}</td>
                    <td className="text-right">{head ? won(m?.total ?? 0) : ''}</td>
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
