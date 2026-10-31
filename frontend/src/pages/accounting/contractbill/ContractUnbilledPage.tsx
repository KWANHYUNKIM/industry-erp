import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import EcPeriodPicks from '../../../components/EcPeriodPicks'
import { EcCond } from '../../../components/EcStatusPanel'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../../components/EcReportFrame'
import { periodOf } from '../../../utils/periods'
import { dateText } from '../../../utils/dateText'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { BillLineConds, applyFilter, useBillLineFilter } from '../../../features/billingcontract/BillLineConds'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import { fmtAmountOf } from '../../../utils/format'

/* 원본 버튼줄 글자 그대로(2026-10-13 실측). '이번기수' · '직전기수' 는 회계연도 시작월을 몰라 1월 기준이다. */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '이번기수', '직전기수', '종료일'] as const

interface UnbilledLine {
  contractLineId: number; contractId: number; contractDate: string; docNo: number; contractCode: string; contractName: string | null
  partnerId: number; partnerName: string; employeeId: number | null; departmentId: number | null; projectId: number | null
  vatType: string; foreignCurrency: boolean; itemId: number; itemName: string; billMonth: string
  quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number
  billingUnitId: number | null; billingUnitName: string | null; remark: string | null
}

const qty = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * 회계 II › 계약관리 › 청구예정자료 › <b>청구예정자료미생성현황</b>(E060909) — 2026-10-13 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 청구예정월(일자 칸, 금월(~오늘) — 달로 본다) · 계약 · 계약항목 · 거래처 · 청구단위 · 담당자 · 부가세유형 · 부서 · 프로젝트 ·
 * 기타 □금액0포함. 버튼 검색(F8) · 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 이번기수 · 직전기수 · 종료일 · 설정 · 다시 작성.
 * 출력물 '청구예정자료미생성현황': 계약번호(링크) · 청구예정월 · 계약명 · 거래처명 · 항목명 · 수량(1.00) · 단가 · 공급가액 · 부가세 · 청구단위 · 적요,
 * 끝에 '합계'(앞 다섯 칸 묶음, 단가도 더함). 버튼 인쇄 · Excel.
 * 원본 금월: '2026/10/23 -1 · 2026/10 · 정수기 렌탈비_월말청구 · (주)형제전파사 · 1.00 · 120,000 · 120,000 · 12,000 · 월말청구'
 * — 청구기간이 그 달에 걸치고 청구예정월에 든 계약 줄 가운데 그 달 청구예정자료를 아직 만들지 않은 것.
 * 적용양식 · 결재방표시 · 정렬/소계기준 · 그래프로 보기는 아직 없다.
 */
export default function ContractUnbilledPage() {
  const nav = useNavigate()
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [shownPeriod, setShownPeriod] = useState({ from: init.from, to: init.to })
  const { filter, set, reset } = useBillLineFilter('')
  const [zero, setZero] = useState(false)
  const [rows, setRows] = useState<UnbilledLine[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  async function load(f = from, t = to, z = zero) {
    setError('')
    try {
      setRows((await api.get<UnbilledLine[]>('/contract-bills/unbilled', { params: { from: f, to: t, includeZero: z } })).data)
      setShownPeriod({ from: f, to: t })
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const shown = useMemo(() => applyFilter(rows, filter), [rows, filter])
  useTableColumnCheck(tableRef, '청구예정자료미생성현황', [shown.length])
  const sum = (k: 'quantity' | 'unitPrice' | 'supplyAmount' | 'vatAmount') => shown.reduce((s, r) => s + Number(r[k]), 0)

  return (
    <EcListShell title="청구예정자료미생성현황" searchable={false} actions={[
      { label: '검색(F8)', primary: true, onClick: () => void load() },
      { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); reset(); setZero(false) } },
      { label: '인쇄' },
      { label: 'Excel' },
    ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]" onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void load() } }}>
        <EcCond label="청구예정월">
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "청구예정월 시작", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "청구예정월 끝", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to); void load(r.from, r.to) }} /></span>
        </EcCond>
        <BillLineConds rows={rows} filter={filter} set={set} full currency={false} vatAll
          order={['contract', 'item', 'partner', 'unit', 'employee', 'vatType', 'department', 'project']} />
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px]"><input type="checkbox" checked={zero} onChange={(e) => { setZero(e.target.checked); void load(from, to, e.target.checked) }} /> 금액0포함</label>
        </EcCond>
      </ul>

      <EcReportHead title="청구예정자료미생성현황" period={reportPeriod(shownPeriod.from, shownPeriod.to)} />
      <table ref={tableRef} className="ec-report w-full">
        <thead>
          <tr>
            <th className="text-center">계약번호</th><th className="text-center">청구예정월</th><th>계약명</th><th>거래처명</th><th>항목명</th>
            <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th>
            <th>청구단위</th><th>적요</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            : shown.map((r) => (
              <tr key={`${r.contractLineId}-${r.billMonth}`}>
                <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); nav(`/accounting/billing-contracts/new?id=${r.contractId}`) }}>{dateText(r.contractDate)} -{r.docNo}</a></td>
                <td className="text-center">{r.billMonth.replace('-', '/')}</td>
                <td>{r.contractName ?? ''}</td>
                <td>{r.partnerName}</td>
                <td>{r.itemName}</td>
                <td className="text-right">{qty(r.quantity)}</td>
                <td className="text-right">{fmtAmountOf(r.unitPrice)}</td>
                <td className="text-right">{fmtAmountOf(r.supplyAmount)}</td>
                <td className="text-right">{fmtAmountOf(r.vatAmount)}</td>
                <td>{r.billingUnitName ?? ''}</td>
                <td>{r.remark ?? ''}</td>
              </tr>
            ))}
          {shown.length > 0 && (
            <tr className="ec-total">
              <td colSpan={5} className="text-center">합계</td>
              <td className="text-right">{qty(sum('quantity'))}</td>
              <td className="text-right">{fmtAmountOf(sum('unitPrice'))}</td>
              <td className="text-right">{fmtAmountOf(sum('supplyAmount'))}</td>
              <td className="text-right">{fmtAmountOf(sum('vatAmount'))}</td>
              <td />
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
