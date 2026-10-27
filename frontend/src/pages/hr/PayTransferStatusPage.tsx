import { useEffect, useRef, useState } from 'react'
import { ecAlert } from '../../components/EcDialog'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { bankItems } from '../../utils/bankCodes'
import EcSortSubtotalModal, { emptySortSubtotal, withSubtotals, type SortSubtotal } from '../../components/EcSortSubtotalModal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, Payslip } from '../../types/api'

const won = (n: number) => Number(n).toLocaleString('ko-KR')
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
function pick(label: string) {
  const n = new Date()
  const y = n.getFullYear(), m = n.getMonth()
  switch (label) {
    case '금월': return { from: ym(n), to: ym(n) }
    case '전월': { const p = ym(new Date(y, m - 1, 1)); return { from: p, to: p } }
    case '금년': return { from: `${y}-01`, to: `${y}-12` }
    case '금년(~오늘)': return { from: `${y}-01`, to: ym(n) }
    case '전년': return { from: `${y - 1}-01`, to: `${y - 1}-12` }
    default: return { from: ym(new Date(y, m - 1, 1)), to: ym(n) }
  }
}

/**
 * [정렬/소계기준] [설정] — '정렬/소계/합계 설정' 창(2026-10-21 원본 E090117 실측). 기준 고르기: 없음 · 은행코드 · 은행명 ·
 * 계좌번호 · 예금주명 · 실지급액. 처음 값: 1~3 모두 없음 · 합계영역 ◉표시안함(그래서 합계줄이 없다).
 */
const SORT_KEYS = ['은행코드', '은행명', '계좌번호', '예금주명', '실지급액']

/**
 * 관리 &gt; 급여관리 &gt; 급여작업 &gt; <b>급여이체현황</b> (원본 E090117).
 *
 * <p>2026-10-03 loginaa 실측: 조건 판이 펼쳐진 현황 — 귀속연월(전월+금월) · 지급연월 · 급여대장 · 이체은행 · 정렬/소계기준.
 * 결과: 회사명 · 기간 머리 + 은행코드 · 은행명 · 계좌번호 · 예금주명 · 실지급액, 명세마다 한 줄(합계줄 없음). 버튼 인쇄 · Excel.
 * 은행 정보는 사원등록 [급여통장]에서 온다 — 비어 있으면 원본처럼 빈칸으로 찍는다.
 * [급여대장] · [이체은행]은 여러 개 고르는 코드도움 — 이체은행 창은 원본 은행코드 85줄(utils/bankCodes).
 * 지급연월([사용])은 그 귀속월 급여대장의 지급일 달로 거른다. [양식] 의 은행별 양식(우리은행 · 농협 …)은 Excel 꼴만 바꾸고 화면 격자는 모두 같다(2026-10-22 실측) — 고르기만 한다.
 */
export default function PayTransferStatusPage() {
  const [range, setRange] = useState(pick('전월+금월'))
  const [form, setForm] = useState('기본(수정불가)')
  const [banks, setBanks] = useState<string[]>([])
  const [ledgerMonths, setLedgerMonths] = useState<string[]>([])
  const [ledgers, setLedgers] = useState<{ payMonth: string; name: string; payDate: string | null }[]>([])
  /** 원본 [지급연월]([사용]) — 그 귀속월 급여대장의 지급일 달로 거른다. */
  const [usePaid, setUsePaid] = useState(false)
  const [paidRange, setPaidRange] = useState(range)
  const [slips, setSlips] = useState<Payslip[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [sortCfg, setSortCfg] = useState<SortSubtotal>(emptySortSubtotal())
  const [sortOpen, setSortOpen] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '급여이체현황', [slips.length, sortCfg])

  function search(r = range) {
    setError('')
    api.get<Payslip[]>('/payslips/range', { params: { from: r.from, to: r.to } })
      .then((r) => setSlips(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    search()
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<{ payMonth: string; name: string; payDate: string | null }[]>('/pay-ledgers').then((r) => setLedgers(r.data)).catch(() => setLedgers([]))
  }, [])

  const byId = new Map(employees.map((e) => [e.id, e]))
  const shown = slips
    .map((p) => ({ p, e: byId.get(p.employeeId) }))
    .filter(({ p }) => ledgerMonths.length === 0 || ledgerMonths.includes(p.payMonth))
    .filter(({ p }) => {
      if (!usePaid) return true
      const d = (ledgers.find((l) => l.payMonth === p.payMonth)?.payDate ?? '').slice(0, 7)
      return !!d && d >= paidRange.from && d <= paidRange.to
    })
    .filter(({ e }) => banks.length === 0 || banks.includes(e?.bankCode ?? ''))
    // 원본(2026-10-13 실측): 대장 차례(귀속연월-NO 오름차순) · 대장 안은 사원코드 순 — 서버는 귀속월 내림차순으로 준다
    .sort((a, b) => a.p.payMonth.localeCompare(b.p.payMonth) || a.p.employeeCode.localeCompare(b.p.employeeCode))
  type Line = (typeof shown)[number]
  const sortValue = ({ p, e }: Line, key: string): string | number => {
    switch (key) {
      case '은행코드': return e?.bankCode ?? ''
      case '은행명': return e?.bankName ?? ''
      case '계좌번호': return e?.accountNo ?? ''
      case '예금주명': return e?.accountHolder ?? ''
      case '실지급액': return Number(p.netPay)
      default: return ''
    }
  }
  const sortLabel = (l: Line, key: string) => { const v = sortValue(l, key); return typeof v === 'number' ? won(v) : v }
  const out = withSubtotals(shown, sortCfg, sortValue, sortLabel)
  const sumNet = (ls: Line[]) => ls.reduce((t, { p }) => t + Number(p.netPay), 0)

  return (
    <EcListShell title="급여이체현황" searchable={false} collapseConditions={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="지급연월">
          {usePaid && (
            <>
              <input type="month" className="ec-input w-[140px]" aria-label="지급연월 시작" value={paidRange.from} onChange={(e) => setPaidRange({ ...paidRange, from: e.target.value })} />
              ~
              <input type="month" className="ec-input w-[140px]" aria-label="지급연월 끝" value={paidRange.to} onChange={(e) => setPaidRange({ ...paidRange, to: e.target.value })} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={usePaid} onChange={(e) => { setUsePaid(e.target.checked); if (e.target.checked) setPaidRange(range) }} /> 사용
          </label>
        </EcCond>
        <EcCond label="급여대장">
          <CodePickerField label="급여대장" hideLabel fill multiple placeholder="급여대장" values={ledgerMonths}
                           onChangeMulti={(v) => setLedgerMonths(v)}
                           items={ledgers.map((l) => ({ value: l.payMonth, code: l.payMonth.replace('-', '/'), name: l.name }))} />
        </EcCond>
        <EcCond label="이체은행">
          <CodePickerField label="이체은행" hideLabel fill multiple placeholder="이체은행" values={banks}
                           onChangeMulti={(v) => setBanks(v)} items={bankItems()} />
        </EcCond>
        <EcCond label="정렬/소계기준">
          <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy text-[12px]"
                  onClick={() => setSortOpen(true)}>설정</button>
        </EcCond>
      </ul>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        {/* 원본(2026-10-22 실측): [양식 ⌄] 이 검색 앞에 있다. 은행별 양식은 Excel 내려받기 꼴만 바꾸고 화면 격자는 그대로다. */}
        <select className="ec-input w-auto" aria-label="양식" value={form} onChange={(e) => { if (e.target.value === '신규양식추가') { void ecAlert('신규양식추가는 지원하지 않습니다(양식 하나).'); return } setForm(e.target.value) }}>
          {['기본(수정불가)', '우리은행', '농협', '신한은행', '국민은행', '하나은행', '제일은행', '기업은행', '우체국', '신규양식추가'].map((f) => <option key={f}>{f}</option>)}
        </select>
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => search()}>검색(F8)</button>
        {/* 원본 빠른선택(2026-10-21 실측)은 귀속연월을 바꾸고 바로 찾는다. 뒤 [설정] 은 원본도 권한없음 창이라 두지 않는다. */}
        {['금월', '전월', '전월+금월', '금년', '금년(~오늘)', '전년'].map((l) => (
          <button key={l} type="button" className="ec-btn" onClick={() => { const r = pick(l); setRange(r); search(r) }}>{l}</button>
        ))}
      </div>
      <EcReportHead title="급여이체현황" period={reportPeriod(`${range.from}-01`, range.to.replace('-', '/'))} />
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>은행코드</th>
            <th>은행명</th>
            <th>계좌번호</th>
            <th>예금주명</th>
            <th className="text-right">실지급액</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {out.map((o) => (o.kind === 'row' ? (
                <tr key={o.row.p.id}>
                  <td>{o.row.e?.bankCode ?? ''}</td>
                  <td>{o.row.e?.bankName ?? ''}</td>
                  <td>{o.row.e?.accountNo ?? ''}</td>
                  <td>{o.row.e?.accountHolder ?? ''}</td>
                  <td className="text-right">{won(o.row.p.netPay)}</td>
                </tr>
              ) : (
                <tr key={`s-${o.key}`} className="ec-total">
                  <td colSpan={4} className="text-center">{o.label} 계</td>
                  <td className="text-right">{won(sumNet(o.list))}</td>
                </tr>
              )))}
              {sortCfg.total && (
                <tr className="ec-total">
                  <td colSpan={4} className="text-center">합계</td>
                  <td className="text-right">{won(sumNet(shown))}</td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      <EcReportFoot />
      {sortOpen && (
        <EcSortSubtotalModal keys={SORT_KEYS} value={sortCfg} onApply={(v) => { setSortCfg(v); setSortOpen(false) }} onClose={() => setSortOpen(false)} />
      )}
    </EcListShell>
  )
}
