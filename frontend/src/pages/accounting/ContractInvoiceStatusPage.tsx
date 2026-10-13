import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import { periodOf, SALES_TAX_STOCK_PICKS } from '../../utils/periods'
import { dateText } from '../../utils/dateText'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useCondPickers } from '../../utils/useCondPickers'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { VAT_TYPES, won, type ContractInvoiceRow } from '../../features/billingcontract/types'

/* 원본 [상태] — 결재중 · 미확인 · 확인(기본). 우리 회계전표 확인상태 값. */
const STATUS: [string, string][] = [['', '전체'], ['IN_APPROVAL', '결재중'], ['UNCONFIRMED', '미확인'], ['CONFIRMED', '확인']]

/**
 * 회계 II › 계약관리 › 회계반영 › <b>매출(세금)계산서현황(계약)</b>(E060910) — 2026-10-13 loginaa 실측.
 *
 * <p>조건: 기준일자(최근30일) · 회계전표No. · 부서 · 프로젝트 · 거래처 · 거래처관리담당자 · 기타 □세무신고거래처 · 부가세유형 ·
 * 상태(전체 · 결재중 · 미확인 · ◉확인).
 * 출력물 제목 '매출청구서현황', 열 일자-No.(회계전표 링크) · 거래처명 · 공급가액 · 매출부가세 · 매출합계 · 내역보기(내역보기 · 청구예정자료),
 * 달마다 '2026/10 계' 와 끝에 '합계'. 버튼 인쇄 · Excel.
 * 회계/판매일괄반영으로 만든 매출전표 I 만 나온다(QA회계2 '2026/10/13 -6 · (사)경남주류협회 · 20,000 · 2,000 · 22,000').
 * 거래처관리담당자 · 세무신고거래처 · 적용양식 · 정렬/소계기준 · 그래프로 보기는 아직 두지 않는다.
 */
export default function ContractInvoiceStatusPage() {
  const nav = useNavigate()
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [department, setDepartment] = useState('')
  const [project, setProject] = useState('')
  const [partner, setPartner] = useState('')
  const [vatType, setVatType] = useState('')
  const [status, setStatus] = useState('CONFIRMED')
  const [rows, setRows] = useState<ContractInvoiceRow[]>([])
  const [error, setError] = useState('')
  const pickers = useCondPickers(['partners'])
  const dp = useDeptProjectItems()
  const tableRef = useRef<HTMLTableElement>(null)

  async function load() {
    setError('')
    try { setRows((await api.get<ContractInvoiceRow[]>('/contract-bills/invoices', { params: { from, to } })).data) }
    catch (e) { setError(extractErrorMessage(e)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const no = (r: ContractInvoiceRow) => `${dateText(r.entryDate)} -${r.entryNo ?? ''}`
  const shown = useMemo(() => rows
    .filter((r) => !docNo || r.docNo.includes(docNo) || no(r).includes(docNo))
    .filter((r) => !department || String(r.departmentId) === department)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !vatType || r.vatType === vatType)
    .filter((r) => !status || r.confirmStatus === status), [rows, docNo, department, project, partner, vatType, status])
  useTableColumnCheck(tableRef, '매출청구서현황', [shown.length])
  const months = [...new Set(shown.map((r) => r.entryDate.slice(0, 7)))]
  const sum = (rs: ContractInvoiceRow[], k: 'supplyAmount' | 'vatAmount' | 'totalAmount') => rs.reduce((s, r) => s + Number(r[k]), 0)
  const partnerItems = pickers.partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))

  return (
    <EcListShell title="매출(세금)계산서현황(계약)" searchable={false} actions={[
      { label: '검색(F8)', primary: true, onClick: () => void load() },
      { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setDocNo(''); setDepartment(''); setProject(''); setPartner(''); setVatType(''); setStatus('CONFIRMED') } },
      { label: '인쇄' },
      { label: 'Excel' },
    ]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" aria-label="기준일자 시작" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" aria-label="기준일자 끝" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]"><EcPeriodPicks labels={SALES_TAX_STOCK_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
        </EcCond>
        <EcCond label="회계전표No."><input className="ec-input w-[220px]" aria-label="회계전표No." placeholder="회계전표No." value={docNo} onChange={(e) => setDocNo(e.target.value)} /></EcCond>
        <EcCond label="부서" pick><CodePickerField label="부서" hideLabel width={220} emptyLabel="부서" value={department} onChange={setDepartment} items={dp.departments} /></EcCond>
        <EcCond label="프로젝트" pick><CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="프로젝트" value={project} onChange={setProject} items={dp.projects} /></EcCond>
        <EcCond label="거래처" pick><CodePickerField label="거래처" hideLabel width={220} emptyLabel="거래처" value={partner} onChange={setPartner} items={partnerItems} /></EcCond>
        <EcCond label="부가세유형">
          <select className="ec-input w-[200px]" aria-label="부가세유형" value={vatType} onChange={(e) => setVatType(e.target.value)}>
            <option value="">부가세유형</option>{VAT_TYPES.map((v) => <option key={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="상태">
          {STATUS.map(([v, n]) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="inv-status" checked={status === v} onChange={() => setStatus(v)} /> {n}
            </label>
          ))}
        </EcCond>
      </ul>

      <EcReportHead title="매출청구서현황" period={reportPeriod(from, to)} />
      <table ref={tableRef} className="ec-report w-full">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th><th>거래처명</th><th className="text-right">공급가액</th>
            <th className="text-right">매출부가세</th><th className="text-right">매출합계</th><th className="text-center">내역보기</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            : months.map((m) => {
              const rs = shown.filter((r) => r.entryDate.startsWith(m))
              return (
                <Fragment key={m}>
                  {rs.map((r) => (
                    <tr key={r.journalEntryId}>
                      <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); nav(`/accounting/journals?entryId=${r.journalEntryId}`) }}>{no(r)}</a></td>
                      <td>{r.partnerName ?? ''}</td>
                      <td className="text-right">{won(r.supplyAmount)}</td>
                      <td className="text-right">{won(r.vatAmount)}</td>
                      <td className="text-right">{won(r.totalAmount)}</td>
                      <td className="text-center">
                        <a href="#" className="mr-[4px]" onClick={(e) => { e.preventDefault(); nav(`/accounting/journals?entryId=${r.journalEntryId}`) }}>내역보기</a>
                        <a href="#" onClick={(e) => { e.preventDefault(); nav('/accounting/contract-bills') }}>청구예정자료</a>
                      </td>
                    </tr>
                  ))}
                  <tr className="ec-total">
                    <td colSpan={2} className="text-center">{m.replace('-', '/')} 계</td>
                    <td className="text-right">{won(sum(rs, 'supplyAmount'))}</td>
                    <td className="text-right">{won(sum(rs, 'vatAmount'))}</td>
                    <td className="text-right">{won(sum(rs, 'totalAmount'))}</td>
                    <td />
                  </tr>
                </Fragment>
              )
            })}
          {shown.length > 0 && (
            <tr className="ec-total">
              <td colSpan={2} className="text-center">합계</td>
              <td className="text-right">{won(sum(shown, 'supplyAmount'))}</td>
              <td className="text-right">{won(sum(shown, 'vatAmount'))}</td>
              <td className="text-right">{won(sum(shown, 'totalAmount'))}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
