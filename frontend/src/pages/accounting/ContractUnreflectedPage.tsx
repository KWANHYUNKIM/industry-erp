import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import { periodOf } from '../../utils/periods'
import { dateText } from '../../utils/dateText'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { BillLineConds, applyFilter, useBillLineFilter } from '../../features/billingcontract/BillLineConds'
import { won, type BillLineView } from '../../features/billingcontract/types'
import { EcDateRange } from '../../components/ui/EcDateInput'

/* 원본 버튼줄 글자 그대로(2026-10-13 실측). '이번기수' · '직전기수' 는 회계연도 시작월을 몰라 1월 기준이다. */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '이번기수', '직전기수', '종료일'] as const

/**
 * 회계 II › 계약관리 › 회계반영 › <b>회계미반영현황(계약)</b>(E060908) — 2026-10-13 loginaa 실측.
 *
 * <p>조건: 청구자료생성일자(금월 1일 ~ 오늘) · 계약 · 계약항목 · 거래처 · 청구단위 · 부가세유형(전체) · 부서 · 프로젝트 · 기타 □금액0포함 □결재방표시.
 * 출력물 제목 '미청구현황(계약)', 열 일자-No.(청구자료) · 청구단위명 · 항목명 · 계약명 · 거래처명 · 수량 · 단가 · 공급가액 · 부가세 · 적요, 버튼 인쇄 · Excel.
 * 청구예정자료생성으로 만든 줄 가운데 회계/판매일괄반영으로 아직 매출전표를 안 만든 것. 반영하면 빠지고, 그 전표를 지우면 다시 나온다.
 * 원본에서 줄이 든 판은 아직 못 봤다(QA 자료를 반영한 뒤에 열었다) — 합계 줄은 우리 출력물 차례를 따른다.
 */
export default function ContractUnreflectedPage() {
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const { filter, set, reset } = useBillLineFilter('')
  const [zero, setZero] = useState(false)
  const [signLine, setSignLine] = useState(false)
  const [rows, setRows] = useState<BillLineView[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  async function load() {
    setError('')
    try { setRows((await api.get<BillLineView[]>('/contract-bills/lines', { params: { from, to, reflected: false } })).data) }
    catch (e) { setError(extractErrorMessage(e)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const shown = useMemo(() => applyFilter(rows, filter)
    .filter((r) => zero || Number(r.supplyAmount) + Number(r.vatAmount) !== 0), [rows, filter, zero])
  useTableColumnCheck(tableRef, '미청구현황(계약)', [shown.length])
  const sum = (k: 'quantity' | 'supplyAmount' | 'vatAmount') => shown.reduce((s, r) => s + Number(r[k]), 0)

  return (
    <EcListShell title="회계미반영현황(계약)" searchable={false} signLine={signLine} actions={[
      { label: '검색(F8)', primary: true, onClick: () => void load() },
      { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); reset(); setZero(false); setSignLine(false) } },
      { label: '인쇄' },
      { label: 'Excel' },
    ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="청구자료생성일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "청구자료생성일자 시작", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "청구자료생성일자 끝", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
        </EcCond>
        <BillLineConds rows={rows} filter={filter} set={set} full={false} vatAll />
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] mr-[10px]"><input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} /> 금액0포함</label>
          <label className="inline-flex items-center gap-[3px]"><input type="checkbox" checked={signLine} onChange={(e) => setSignLine(e.target.checked)} /> 결재방표시</label>
        </EcCond>
      </ul>

      <EcReportHead title="미청구현황(계약)" period={reportPeriod(from, to)} />
      <table ref={tableRef} className="ec-report w-full">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th><th>청구단위명</th><th>항목명</th><th>계약명</th><th>거래처명</th>
            <th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th>적요</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            : shown.map((r) => (
              <tr key={r.lineId}>
                <td className="text-center">{dateText(r.billDate)} -{r.billDocNo}</td>
                <td>{r.billingUnitName ?? ''}</td>
                <td>{r.itemName}</td>
                <td>{r.contractName ?? ''}</td>
                <td>{r.partnerName}</td>
                <td className="text-right">{won(r.quantity)}</td>
                <td className="text-right">{won(r.unitPrice)}</td>
                <td className="text-right">{won(r.supplyAmount)}</td>
                <td className="text-right">{won(r.vatAmount)}</td>
                <td>{r.remark ?? ''}</td>
              </tr>
            ))}
          {shown.length > 0 && (
            <tr className="ec-total">
              <td colSpan={5} className="text-center">합계</td>
              <td className="text-right">{won(sum('quantity'))}</td>
              <td />
              <td className="text-right">{won(sum('supplyAmount'))}</td>
              <td className="text-right">{won(sum('vatAmount'))}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
