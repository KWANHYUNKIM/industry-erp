import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import EcPeriodPicks from '../../../components/EcPeriodPicks'
import Modal from '../../../components/Modal'
import { EcCond } from '../../../components/EcStatusPanel'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../../components/EcReportFrame'
import { periodOf } from '../../../utils/periods'
import { dateText } from '../../../utils/dateText'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { BillLineConds, applyFilter, useBillLineFilter } from '../../../features/billingcontract/BillLineConds'
import type { BillLineView } from '../../../features/billingcontract/types'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import { fmtAmountOf } from '../../../utils/format'

/* 원본 버튼줄 글자 그대로(2026-10-13 실측). '이번기수' · '직전기수' 는 회계연도 시작월을 몰라 1월 기준이다. */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '이번기수', '직전기수', '종료일'] as const

const qty = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 출력물 한 줄 — 거래처 하나의 청구자료 줄을 더한 것. */
interface PrintRow {
  key: string; partnerId: number; partnerName: string; contractName: string; itemName: string
  quantity: number; supplyAmount: number; vatAmount: number; lines: BillLineView[]
}

/**
 * 회계 II › 계약관리 › 청구예정자료 › <b>청구예정자료인쇄</b>(E060907) — 2026-10-13 loginaa 실측
 * (QA회계2-청구인쇄 계약 · 이카운트 사용료 2 × 40,000 → 청구예정자료 2026/10/13 -4 를 만들어 잼).
 *
 * <p>조건(펼쳐 둠): 청구생성일자(금월(~오늘)) · 계약 · 계약항목 · 거래처 · 담당자 · 청구단위 · 내.외자구분(◉전체 ○내자 ○외자) ·
 * 부서 · 프로젝트 · 기타 □거래처코드없는자료인쇄 · 양식 적용양식 '기본(수정불가)'. 버튼 검색(F8) · 금일 · … · 종료일 · 설정 · 다시 작성.
 * 출력물 '청구예정자료리스트'(회사명 · 기간): □(번호) · 거래처명 · 계약명 · 항목명 · 수량(2.00) · 공급가액 · 부가세 · 합계 · 상세,
 * 끝에 '합계'(앞 세 칸 묶음 — 거래처명~항목명). 빈 판 '등록된 데이터가 없습니다.' 버튼 인쇄 · Email.
 * 원본 줄: 'QA회계2-청구거래처 · QA회계2-청구인쇄 · 이카운트 사용료 · 2.00 · 80,000 · 8,000 · 88,000 · 상세'.
 * [상세] → '상세청구예정자료리스트' 창: 회사명 : … / 거래처명 · 기간, 거래처명 · 계약명 · 월/일(청구생성번호 '2026/10/13 -4') · 항목명 ·
 * 수량 · 공급가액 · 부가세 · 합계 · 적요, '합계'. 버튼 인쇄 · Email.
 *
 * <p><b>거래처 하나가 한 줄</b>이다 — 같은 계약 줄로 청구자료를 한 장 더(2026/10/13 -5, 1 × 40,000) 만들었더니
 * 'QA회계2-청구거래처 · QA회계2-청구인쇄 외 1건 · 이카운트 사용료 외 1건 · 3.00 · 120,000 · 12,000 · 132,000' 한 줄이 됐다
 * ('외 N건' 은 같은 계약 · 항목이어도 청구자료 줄 수로 센다). [상세] 는 그 거래처의 줄을 연다(창 머리가 '/ 거래처명').
 * Email 은 바깥으로 나가는 일이라 막아 둔다.
 * 거래처코드없는자료인쇄는 우리 거래처가 모두 코드를 가져 거를 것이 없다.
 */
export default function ContractBillPrintPage() {
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [shownPeriod, setShownPeriod] = useState({ from: init.from, to: init.to })
  const { filter, set, reset } = useBillLineFilter('')
  const [noCode, setNoCode] = useState(false)
  const [rows, setRows] = useState<BillLineView[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<PrintRow | null>(null)
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  async function load(f = from, t = to) {
    setError('')
    try {
      setRows((await api.get<BillLineView[]>('/contract-bills/lines', { params: { from: f, to: t } })).data)
      setShownPeriod({ from: f, to: t })
      setPicked(new Set())
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const printRows = useMemo(() => {
    const m = new Map<string, PrintRow>()
    applyFilter(rows, filter)
      .filter((r) => noCode || !!r.partnerCode)
      .forEach((r) => {
        const key = String(r.partnerId)
        const g = m.get(key) ?? { key, partnerId: r.partnerId, partnerName: r.partnerName, contractName: r.contractName ?? r.contractCode,
          itemName: r.itemName, quantity: 0, supplyAmount: 0, vatAmount: 0, lines: [] }
        g.quantity += Number(r.quantity); g.supplyAmount += Number(r.supplyAmount); g.vatAmount += Number(r.vatAmount); g.lines.push(r)
        m.set(key, g)
      })
    const more = (name: string, n: number) => (n > 1 ? `${name} 외 ${n - 1}건` : name)
    return [...m.values()]
      .map((g) => ({ ...g, contractName: more(g.contractName, g.lines.length), itemName: more(g.itemName, g.lines.length) }))
      .sort((a, b) => a.partnerName.localeCompare(b.partnerName))
  }, [rows, filter, noCode])
  useTableColumnCheck(tableRef, '청구예정자료리스트', [printRows.length])
  const sum = (list: { quantity: number; supplyAmount: number; vatAmount: number }[], k: 'quantity' | 'supplyAmount' | 'vatAmount') =>
    list.reduce((s, r) => s + Number(r[k]), 0)
  const allPicked = printRows.length > 0 && printRows.every((r) => picked.has(r.key))
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const detailLines = useMemo(() => (detail
    ? applyFilter(rows, filter).filter((r) => r.partnerId === detail.partnerId)
      .sort((a, b) => a.billDate.localeCompare(b.billDate) || a.billDocNo - b.billDocNo)
    : []), [detail, rows, filter])

  return (
    <EcListShell title="청구예정자료인쇄" searchable={false} actions={[
      { label: '검색(F8)', primary: true, onClick: () => void load() },
      { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); reset(); setNoCode(false) } },
      { label: '인쇄' },
      { label: 'Email', disabled: true },
    ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]" onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void load() } }}>
        <EcCond label="청구생성일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "청구생성일자 시작", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "청구생성일자 끝", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to); void load(r.from, r.to) }} /></span>
        </EcCond>
        <BillLineConds rows={rows} filter={filter} set={set} full vatAll
          order={['contract', 'item', 'partner', 'employee', 'unit', 'currency', 'department', 'project']} />
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px]"><input type="checkbox" checked={noCode} onChange={(e) => setNoCode(e.target.checked)} /> 거래처코드없는자료인쇄</label>
        </EcCond>
        <EcCond label="양식">
          <span className="mr-[6px]">적용양식</span>
          <select className="ec-input w-[200px]" aria-label="적용양식" disabled><option>기본(수정불가)</option></select>
        </EcCond>
      </ul>

      <EcReportHead title="청구예정자료리스트" period={reportPeriod(shownPeriod.from, shownPeriod.to)} />
      <table ref={tableRef} className="ec-report w-full">
        <thead>
          <tr>
            <th className="text-center w-[25px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                onChange={(e) => setPicked(e.target.checked ? new Set(printRows.map((r) => r.key)) : new Set())} />
            </th>
            <th>거래처명</th><th>계약명</th><th>항목명</th>
            <th className="text-right">수량</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
            <th className="text-center">상세</th>
          </tr>
        </thead>
        <tbody>
          {printRows.length === 0 ? <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            : printRows.map((r, i) => (
              <tr key={r.key}>
                <td className="text-center">
                  <label className="inline-flex items-center gap-[2px]">
                    <input type="checkbox" aria-label={`${i + 1}번 선택`} checked={picked.has(r.key)} onChange={() => toggle(r.key)} />
                  </label>
                </td>
                <td>{r.partnerName}</td>
                <td>{r.contractName}</td>
                <td>{r.itemName}</td>
                <td className="text-right">{qty(r.quantity)}</td>
                <td className="text-right">{fmtAmountOf(r.supplyAmount)}</td>
                <td className="text-right">{fmtAmountOf(r.vatAmount)}</td>
                <td className="text-right">{fmtAmountOf(r.supplyAmount + r.vatAmount)}</td>
                <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setDetail(r) }}>상세</a></td>
              </tr>
            ))}
          {printRows.length > 0 && (
            <tr className="ec-total">
              <td />
              <td colSpan={3} className="text-center">합계</td>
              <td className="text-right">{qty(sum(printRows, 'quantity'))}</td>
              <td className="text-right">{fmtAmountOf(sum(printRows, 'supplyAmount'))}</td>
              <td className="text-right">{fmtAmountOf(sum(printRows, 'vatAmount'))}</td>
              <td className="text-right">{fmtAmountOf(sum(printRows, 'supplyAmount') + sum(printRows, 'vatAmount'))}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <EcReportFoot />

      <Modal open={detail != null} title="상세청구예정자료리스트" width={880} error={error} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <EcReportHead title="" sub={detail.partnerName} period={reportPeriod(shownPeriod.from, shownPeriod.to)} />
            <table className="ec-report w-full">
              <thead>
                <tr>
                  <th>거래처명</th><th>계약명</th><th className="text-center">월/일</th><th>항목명</th>
                  <th className="text-right">수량</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th><th>적요</th>
                </tr>
              </thead>
              <tbody>
                {detailLines.map((l) => (
                  <tr key={l.lineId}>
                    <td>{l.partnerName}</td>
                    <td>{l.contractName ?? l.contractCode}</td>
                    <td className="text-center">{dateText(l.billDate)} -{l.billDocNo}</td>
                    <td>{l.itemName}</td>
                    <td className="text-right">{qty(l.quantity)}</td>
                    <td className="text-right">{fmtAmountOf(l.supplyAmount)}</td>
                    <td className="text-right">{fmtAmountOf(l.vatAmount)}</td>
                    <td className="text-right">{fmtAmountOf(Number(l.supplyAmount) + Number(l.vatAmount))}</td>
                    <td>{l.remark ?? ''}</td>
                  </tr>
                ))}
                <tr className="ec-total">
                  <td colSpan={4} className="text-center">합계</td>
                  <td className="text-right">{qty(sum(detailLines, 'quantity'))}</td>
                  <td className="text-right">{fmtAmountOf(sum(detailLines, 'supplyAmount'))}</td>
                  <td className="text-right">{fmtAmountOf(sum(detailLines, 'vatAmount'))}</td>
                  <td className="text-right">{fmtAmountOf(sum(detailLines, 'supplyAmount') + sum(detailLines, 'vatAmount'))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <EcReportFoot page={false} />
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
