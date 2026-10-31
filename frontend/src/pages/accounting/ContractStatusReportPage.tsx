import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import { periodOf, INQUIRY_PICKS } from '../../utils/periods'
import { dateText } from '../../utils/dateText'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { BillLineConds, applyFilter, useBillLineFilter } from '../../features/billingcontract/BillLineConds'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmountOf } from '../../utils/format'

interface StatusLine {
  lineId: number; contractId: number; contractDate: string; docNo: number; contractCode: string; contractName: string | null
  partnerId: number; partnerName: string; employeeId: number | null; billStart: string; billEnd: string; vatType: string
  foreignCurrency: boolean; projectId: number | null; projectName: string | null; departmentId: number | null
  itemId: number; itemName: string; billingUnitId: number | null; billingUnitName: string | null
  quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number; remark: string | null
  billMonths: string; createdBy: string | null
}

/** 원본 수량 칸 모양 — 1.00. */
const qty = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 원본 청구예정월 칸 모양 — '01 . 02 . … . 12'. */
const monthsText = (s: string) => s.split(',').map((m) => m.trim()).filter(Boolean).join(' . ')

/**
 * 회계 II › 계약관리 › 계약 › <b>계약현황</b>(E060912) — 2026-10-13 loginaa 실측(왼쪽 메뉴의 ↗ 는 새 창으로 여는 것, 화면은 같다).
 *
 * <p>조건(펼쳐 둠): 계약일자(금월(~오늘)) · 청구시작일 · 청구종료일(비움) · 청구예정월 □사용(켜면 'YYYY/MM ~ YYYY/MM') · 거래처 · 계약 ·
 * 계약항목 · 청구단위 · 담당자 · 프로젝트 · 부서 · 부가세유형 · 진행상태(○전체 ◉진행중 ○완료) · 내.외자구분(◉전체 ○내자 ○외자) · 적요 · 최초작성자.
 * 버튼 검색(F8) · 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 · 설정 · 다시 작성 — 기간 버튼은 누르면 바로 조회한다.
 * 출력물 '계약현황': 일자-No.(링크) · 계약명 · 거래처명 · 항목명 · 수량(1.00) · 단가 · 공급가액 · 부가세 · 합계 · 청구예정월('01 . 02 . … . 12'),
 * 계약일자 달마다 '2026/09 계'(앞 네 칸을 묶는다) 와 끝에 '합계' — 단가도 더한다. 빈 목록 '등록된 데이터가 없습니다.' 버튼 인쇄 · Excel.
 * 원본 전월(2026/09): '2026/09/24 -1 · 정수기 렌탈비_월말청구 · (주)형제전파사 · 1.00 · 120,000 · 120,000 · 12,000 · 132,000 · 01 . … . 12'.
 *
 * <p>진행상태: 원본 계약조회의 알약(확인 · 진행중 · 완료)과 같은 진행단계다. 원본 회사에서 '완료' 로 넘긴 계약을 찾지 못했고
 * (청구종료일이 지난 2026/08/24 계약도 진행중) 우리에게 완료 처리가 아직 없어 모두 진행중으로 본다.
 * 청구예정월 조건은 고른 달들 중 하나라도 그 줄의 청구예정월에 들면 남긴다. 적용양식 · 결재방표시 · 정렬/소계기준 · 그래프로 보기는 아직 없다.
 */
export default function ContractStatusReportPage() {
  const nav = useNavigate()
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [shownPeriod, setShownPeriod] = useState({ from: init.from, to: init.to })
  const [startFrom, setStartFrom] = useState('')
  const [startTo, setStartTo] = useState('')
  const [endFrom, setEndFrom] = useState('')
  const [endTo, setEndTo] = useState('')
  const [useMonths, setUseMonths] = useState(false)
  const [monthFrom, setMonthFrom] = useState(init.to.slice(0, 7))
  const [monthTo, setMonthTo] = useState(init.to.slice(0, 7))
  const { filter, set, reset } = useBillLineFilter('')
  const [progress, setProgress] = useState<'all' | 'open' | 'done'>('open')
  const [remark, setRemark] = useState('')
  const [writer, setWriter] = useState('')
  const [rows, setRows] = useState<StatusLine[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  async function load(f = from, t = to) {
    setError('')
    try {
      setRows((await api.get<StatusLine[]>('/billing-contracts/price-change', { params: { from: f, to: t } })).data)
      setShownPeriod({ from: f, to: t })
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const pickMonths = useMemo(() => {
    const out: number[] = []
    if (!useMonths || !monthFrom || !monthTo) return out
    let [y, m] = monthFrom.split('-').map(Number)
    const [ey, em] = monthTo.split('-').map(Number)
    for (let i = 0; i < 120 && (y < ey || (y === ey && m <= em)); i++) {
      out.push(m); m += 1; if (m > 12) { m = 1; y += 1 }
    }
    return out
  }, [useMonths, monthFrom, monthTo])

  const shown = useMemo(() => applyFilter(rows, filter)
    .filter((r) => (!startFrom || r.billStart >= startFrom) && (!startTo || r.billStart <= startTo))
    .filter((r) => (!endFrom || r.billEnd >= endFrom) && (!endTo || r.billEnd <= endTo))
    .filter((r) => !useMonths || r.billMonths.split(',').some((m) => pickMonths.includes(Number(m))))
    .filter(() => progress !== 'done')
    .filter((r) => !remark || (r.remark ?? '').includes(remark))
    .filter((r) => !writer || r.createdBy === writer), [rows, filter, startFrom, startTo, endFrom, endTo, useMonths, pickMonths, progress, remark, writer])
  useTableColumnCheck(tableRef, '계약현황', [shown.length])
  const months = [...new Set(shown.map((r) => r.contractDate.slice(0, 7)))]
  const sum = (rs: StatusLine[], k: 'quantity' | 'unitPrice' | 'supplyAmount' | 'vatAmount') => rs.reduce((s, r) => s + Number(r[k]), 0)
  const writers = useMemo(() => [...new Set(rows.map((r) => r.createdBy).filter((w): w is string => !!w))].sort().map((w) => ({ value: w, name: w })), [rows])

  const range = (label: string, a: string, b: string, setA: (v: string) => void, setB: (v: string) => void) => (
    <EcCond label={label}>
      <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': `${label} 시작`, value: a, onChange: (e) => setA(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': `${label} 끝`, value: b, onChange: (e) => setB(e.target.value) }} />
    </EcCond>
  )
  const radio = <T extends string>(name: string, cur: T, on: (v: T) => void, opts: readonly (readonly [T, string])[]) => opts.map(([v, n]) => (
    <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
      <input type="radio" name={name} checked={cur === v} onChange={() => on(v)} /> {n}
    </label>
  ))

  return (
    <EcListShell title="계약현황" searchable={false} actions={[
      { label: '검색(F8)', primary: true, onClick: () => void load() },
      { label: '다시 작성', onClick: () => {
        setFrom(init.from); setTo(init.to); setStartFrom(''); setStartTo(''); setEndFrom(''); setEndTo(''); setUseMonths(false)
        reset(); setProgress('open'); setRemark(''); setWriter('')
      } },
      { label: '인쇄' },
      { label: 'Excel' },
    ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]" onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void load() } }}>
        <EcCond label="계약일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "계약일자 시작", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "계약일자 끝", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]"><EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to); void load(r.from, r.to) }} /></span>
        </EcCond>
        {range('청구시작일', startFrom, startTo, setStartFrom, setStartTo)}
        {range('청구종료일', endFrom, endTo, setEndFrom, setEndTo)}
        <EcCond label="청구예정월">
          {useMonths && (
            <>
              <input type="month" className="ec-input w-[130px]" aria-label="청구예정월 시작" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} />
              <span className="mx-[4px]">~</span>
              <input type="month" className="ec-input w-[130px] mr-[6px]" aria-label="청구예정월 끝" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} />
            </>
          )}
          <label className="inline-flex items-center gap-[3px]"><input type="checkbox" checked={useMonths} onChange={(e) => setUseMonths(e.target.checked)} /> 사용</label>
        </EcCond>
        <BillLineConds rows={rows} filter={filter} set={set} full currency={false} vatAll
          order={['partner', 'contract', 'item', 'unit', 'employee', 'project', 'department', 'vatType']} />
        <EcCond label="진행상태">{radio('status-progress', progress, setProgress, [['all', '전체'], ['open', '진행중'], ['done', '완료']] as const)}</EcCond>
        <EcCond label="내.외자구분">{radio('status-currency', filter.currency, (v) => set({ currency: v }), [['', '전체'], ['D', '내자'], ['F', '외자']] as const)}</EcCond>
        <EcCond label="적요"><input className="ec-input w-full" aria-label="적요" placeholder="적요" value={remark} onChange={(e) => setRemark(e.target.value)} /></EcCond>
        <EcCond label="최초작성자" pick><CodePickerField label="최초작성자" hideLabel width={220} emptyLabel="최초작성자" value={writer} onChange={setWriter} items={writers} /></EcCond>
      </ul>

      <EcReportHead title="계약현황" period={reportPeriod(shownPeriod.from, shownPeriod.to)} />
      <table ref={tableRef} className="ec-report w-full">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th><th>계약명</th><th>거래처명</th><th>항목명</th>
            <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th>
            <th className="text-right">부가세</th><th className="text-right">합계</th><th className="text-center">청구예정월</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            : months.map((m) => {
              const rs = shown.filter((r) => r.contractDate.startsWith(m))
              return (
                <Fragment key={m}>
                  {rs.map((r) => (
                    <tr key={r.lineId}>
                      <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); nav(`/accounting/billing-contracts/new?id=${r.contractId}`) }}>{dateText(r.contractDate)} -{r.docNo}</a></td>
                      <td>{r.contractName ?? ''}</td>
                      <td>{r.partnerName}</td>
                      <td>{r.itemName}</td>
                      <td className="text-right">{qty(r.quantity)}</td>
                      <td className="text-right">{fmtAmountOf(r.unitPrice)}</td>
                      <td className="text-right">{fmtAmountOf(r.supplyAmount)}</td>
                      <td className="text-right">{fmtAmountOf(r.vatAmount)}</td>
                      <td className="text-right">{fmtAmountOf(Number(r.supplyAmount) + Number(r.vatAmount))}</td>
                      <td className="text-center">{monthsText(r.billMonths)}</td>
                    </tr>
                  ))}
                  <tr className="ec-total">
                    <td colSpan={4} className="text-center">{m.replace('-', '/')} 계</td>
                    <td className="text-right">{qty(sum(rs, 'quantity'))}</td>
                    <td className="text-right">{fmtAmountOf(sum(rs, 'unitPrice'))}</td>
                    <td className="text-right">{fmtAmountOf(sum(rs, 'supplyAmount'))}</td>
                    <td className="text-right">{fmtAmountOf(sum(rs, 'vatAmount'))}</td>
                    <td className="text-right">{fmtAmountOf(sum(rs, 'supplyAmount') + sum(rs, 'vatAmount'))}</td>
                    <td />
                  </tr>
                </Fragment>
              )
            })}
          {shown.length > 0 && (
            <tr className="ec-total">
              <td colSpan={4} className="text-center">합계</td>
              <td className="text-right">{qty(sum(shown, 'quantity'))}</td>
                    <td className="text-right">{fmtAmountOf(sum(shown, 'unitPrice'))}</td>
                    <td className="text-right">{fmtAmountOf(sum(shown, 'supplyAmount'))}</td>
                    <td className="text-right">{fmtAmountOf(sum(shown, 'vatAmount'))}</td>
                    <td className="text-right">{fmtAmountOf(sum(shown, 'supplyAmount') + sum(shown, 'vatAmount'))}</td>
                    <td />
            </tr>
          )}
        </tbody>
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
