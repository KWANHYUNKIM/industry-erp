import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { EcReportHead, EcReportFoot, reportDate, reportPeriod } from '../../components/EcReportFrame'
import { useCondPickers } from '../../utils/useCondPickers'
import type { ExportOrder, ExportSummary } from '../../types/api'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { useItemFlags } from '../../utils/useInactiveItems'
import { AsAggControls, AsAggregateTable, type AsAggKey, type AsAggLine, type AsAggValue } from '../../features/as/AsAggregate'

/** 원본 빠른선택(2026-10-04 실측) — 전월이 없고 이번기수(~전월)가 있다. */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '종료일', '이번기수(~전월)'] as const
/** 원본 [집계조건] 창의 후보(2026-10-04 실측) — 기준일자 여섯 · 거래처(거래처 · 그룹1) · 품목(품목명[규격] · 그룹1). */
const EXPORT_AGG_KEYS: AsAggKey[] = ['일별', '주차별', '월별', '분기별', '반기별', '연별', '거래처', '거래처그룹1', '품목명[규격]', '품목그룹1']
/** 원본 집계 [공급가액]은 소수 없이 찍는다(242,400). */
const int0 = (n: number) => Math.round(n).toLocaleString('ko-KR')
const num = (n: number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })

/**
 * 재고 II &gt; 수출관리 &gt; <b>Invoice/Packing List Status</b>(E040907) — 2026-10-04 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 구분(◉내역 ○집계, 라인별) · 기준일자(기본 금월(~오늘)) · Invoice 번호 · Invoice 일자(기본 사용안함) · L/C 번호 ·
 * L/C 일자(기본 사용안함) · 거래처 · 품목코드. 열: 일자-No. · 품목명[규격] · Description of Goods · 수량 · 단가 · 금액 · 거래처명.
 * 한 줄 = 인보이스 <b>품목 줄</b> 하나, 기준일자는 전표 [일자](Voucher Date). 달마다 '<b>2026/07 계</b>' — 수량 · 단가 · 금액을
 * 더한다(단가도 더한다: 7월 12 + 12 + 80 = 104), 맨 끝 [합계]. 머리글 'Invoice/Packing List Status', 꼬리 [P.1].
 * [구분] ○집계는 A/S 판(AsAggregateTable) — 원본 품목 집계: [품목명[규격] | 수량 | 공급가액] Cookie SET 수입과자 [20개입] 4,200.00 · 50,400,
 * Chocolate Chunk 수입쿠키 [10개입] 2,400.00 · 192,000, 합계 6,600.00 · 242,400(공급가액은 소수 없음).
 */
export default function ExportStatusPage() {
  const pickers = useCondPickers(['partners', 'items'])
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [useInv, setUseInv] = useState(false)
  const [invFrom, setInvFrom] = useState(init.from)
  const [invTo, setInvTo] = useState(init.to)
  const [lcNo, setLcNo] = useState('')
  const [useLc, setUseLc] = useState(false)
  const [lcFrom, setLcFrom] = useState(init.from)
  const [lcTo, setLcTo] = useState(init.to)
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [gubun, setGubun] = useState<'내역' | '집계'>('내역')
  const [agg, setAgg] = useState<AsAggValue>({ agg1: '', agg2: '', codeIncl: false })
  const pgroup = usePartnerGroups()
  const flags = useItemFlags()
  const [rows, setRows] = useState<ExportOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /*
   * 서버는 Invoice 일자로 기간을 자른다. 기준일자는 전표 [일자]라 다를 수 있어 앞뒤로 한 해씩 넓혀 받고,
   * 화면에서 전표 일자로 다시 거른다.
   */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const wide = (d: string, years: number) => `${Number(d.slice(0, 4)) + years}${d.slice(4)}`
      setRows((await api.get<ExportSummary>('/exports', { params: { from: wide(from, -1), to: wide(to, 1) } })).data.exports)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  /** 일자-No. 의 번호 — 같은 전표 일자 안에서 먼저 만든 차례. */
  const seqOf = useMemo(() => {
    const m = new Map<number, number>()
    const byDate = new Map<string, ExportOrder[]>()
    for (const r of rows) byDate.set(r.voucherDate, [...(byDate.get(r.voucherDate) ?? []), r])
    for (const rs of byDate.values()) rs.sort((a, b) => a.id - b.id).forEach((r, i) => m.set(r.id, i + 1))
    return m
  }, [rows])

  const lines = useMemo(() => rows
    .filter((r) => r.voucherDate >= from && r.voucherDate <= to)
    .filter((r) => !invoiceNo || r.invoiceNo.includes(invoiceNo))
    .filter((r) => !useInv || (r.invoiceDate >= invFrom && r.invoiceDate <= invTo))
    .filter((r) => !lcNo || (r.lcNo ?? '').includes(lcNo))
    .filter((r) => !useLc || (r.lcDate != null && r.lcDate >= lcFrom && r.lcDate <= lcTo))
    .filter((r) => !partner || String(r.partnerId) === partner)
    .sort((a, b) => a.voucherDate.localeCompare(b.voucherDate) || (seqOf.get(a.id) ?? 0) - (seqOf.get(b.id) ?? 0))
    .flatMap((r) => r.lines.filter((l) => !item || String(l.itemId) === item).map((l) => ({ r, l }))),
  [rows, from, to, invoiceNo, useInv, invFrom, invTo, lcNo, useLc, lcFrom, lcTo, partner, item, seqOf])

  const months = useMemo(() => {
    const by = new Map<string, typeof lines>()
    for (const x of lines) by.set(x.r.voucherDate.slice(0, 7), [...(by.get(x.r.voucherDate.slice(0, 7)) ?? []), x])
    return [...by.entries()].map(([m, xs]) => ({
      m, xs,
      qty: xs.reduce((n, x) => n + Number(x.l.quantity), 0),
      price: xs.reduce((n, x) => n + Number(x.l.unitPrice), 0),
      amount: xs.reduce((n, x) => n + Number(x.l.amount), 0),
    }))
  }, [lines])
  const total = months.reduce((a, g) => ({ qty: a.qty + g.qty, price: a.price + g.price, amount: a.amount + g.amount }), { qty: 0, price: 0, amount: 0 })
  /* ○집계가 읽는 줄 — 인보이스 품목 줄 하나가 한 줄, 값은 [수량 · 공급가액]. */
  const aggLines = useMemo<AsAggLine[]>(() => lines.map(({ r, l }) => ({
    date: r.voucherDate, charge: '', warehouse: ['', ''], mgmt: '',
    partner: [r.buyerName, pickers.partners.find((p) => p.value === String(r.partnerId))?.code ?? ''],
    partnerGroup: pgroup.groupOfId(r.partnerId),
    itemName: l.itemName, itemSpec: pickers.items.find((x) => x.value === String(l.itemId))?.sub ?? null, itemCode: l.itemCode,
    itemGroup: flags.groupOf(l.itemId), project: ['', ''],
    qty: Number(l.quantity), vals: [Number(l.quantity), Number(l.amount)],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [lines, pickers, flags])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'Invoice/Packing List Status', [months.length, gubun, agg.agg1])

  const range = (use: boolean, setUse: (v: boolean) => void, a: string, setA: (v: string) => void, b: string, setB: (v: string) => void, label: string) => (
    <span className="inline-flex flex-wrap items-center gap-[4px]">
      <label className="inline-flex items-center gap-[3px] mr-[6px]">
        <input type="checkbox" aria-label={`${label} 사용안함`} checked={!use} onChange={(e) => setUse(!e.target.checked)} /> 사용안함
      </label>
      <input type="date" className="ec-input w-[145px]" value={a} disabled={!use} onChange={(e) => setA(e.target.value)} />
      <span>~</span>
      <input type="date" className="ec-input w-[145px]" value={b} disabled={!use} onChange={(e) => setB(e.target.value)} />
    </span>
  )

  return (
    <EcListShell
      title="Invoice/Packing List Status"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setInvoiceNo(''); setUseInv(false); setLcNo(''); setUseLc(false); setPartner(''); setItem(''); setGubun('내역'); setAgg({ agg1: '', agg2: '', codeIncl: false }) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          <span className="inline-flex flex-wrap items-center gap-[8px]">
            {(['내역', '집계'] as const).map((g) => (
              <label key={g} className="inline-flex items-center gap-[3px]">
                <input type="radio" name="exs-gubun" checked={gubun === g} onChange={() => setGubun(g)} /> {g}
              </label>
            ))}
            {gubun === '내역' ? <span className="text-ec-label">라인별</span>
              : <AsAggControls value={agg} onChange={(p) => setAgg((v) => ({ ...v, ...p }))} keys={EXPORT_AGG_KEYS} />}
          </span>
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="Invoice 번호">
          <input className="ec-input w-[200px]" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </EcCond>
        <EcCond label="Invoice 일자">{range(useInv, setUseInv, invFrom, setInvFrom, invTo, setInvTo, 'Invoice 일자')}</EcCond>
        <EcCond label="L/C 번호">
          <input className="ec-input w-[200px]" value={lcNo} onChange={(e) => setLcNo(e.target.value)} />
        </EcCond>
        <EcCond label="L/C 일자">{range(useLc, setUseLc, lcFrom, setLcFrom, lcTo, setLcTo, 'L/C 일자')}</EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
      </ul>

      {gubun === '집계' ? (
        <AsAggregateTable title="Invoice/Packing List Status" period={reportPeriod(from, to)} lines={aggLines} value={agg}
                          measures={['수량', '공급가액']} formats={{ 공급가액: int0 }} />
      ) : (<>
      <EcReportHead title="Invoice/Packing List Status" period={reportPeriod(from, to)} />
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th>품목명[규격]</th>
            <th>Description of Goods</th>
            <th className="text-right">수량</th>
            <th className="text-right">단가</th>
            <th className="text-right">금액</th>
            <th>거래처명</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : months.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : months.flatMap((g) => [
            ...g.xs.map(({ r, l }) => (
              <tr key={`${r.id}-${l.id}`}>
                <td className="text-center">{reportDate(r.voucherDate)} -{seqOf.get(r.id)}</td>
                <td>{l.itemName}</td>
                <td>{l.description || l.itemName}</td>
                <td className="text-right">{num(l.quantity)}</td>
                <td className="text-right">{num(l.unitPrice)}</td>
                <td className="text-right">{num(l.amount)}</td>
                <td>{r.buyerName}</td>
              </tr>
            )),
            <tr key={`sub-${g.m}`} className="ec-list-total">
              <td colSpan={3} className="text-center font-bold">{g.m.replace('-', '/')} 계</td>
              <td className="text-right font-bold">{num(g.qty)}</td>
              <td className="text-right font-bold">{num(g.price)}</td>
              <td className="text-right font-bold">{num(g.amount)}</td>
              <td></td>
            </tr>,
          ])}
        </tbody>
        {months.length > 0 && (
          <tfoot><tr className="ec-total">
            <td colSpan={3} className="text-center">합계</td>
            <td className="text-right">{num(total.qty)}</td>
            <td className="text-right">{num(total.price)}</td>
            <td className="text-right">{num(total.amount)}</td>
            <td></td>
          </tr></tfoot>
        )}
      </table>
      <EcReportFoot />
      </>)}
    </EcListShell>
  )
}
