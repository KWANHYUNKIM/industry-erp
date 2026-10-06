import { useEffect, useRef, useState } from 'react'
import { vatSlipAmounts } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import type { JournalEntry } from '../../types/api'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface CompanyInfo {
  name?: string; ceo?: string; bizRegNo?: string; corpRegNo?: string; tel?: string; address?: string; addressDetail?: string
}
interface Row { from: string; to: string; sales: number; tax: number }

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const iso = (d: Date) => `${ym(d)}-${String(d.getDate()).padStart(2, '0')}`
const slash = (s: string) => s.replace(/-/g, '/')
const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid gray;padding:3px}'
  + '.text-right{text-align:right}.text-center{text-align:center}.ec-report-title{font-size:16px;font-weight:bold;text-align:center}'

/**
 * 세무 › 부가세 › <b>세무증명서류</b>(E030209) — 2026-10-04 loginaa 실측.
 *
 * <p>조건 [출력구분 ◉부가세과세표준 ○재무제표등확인 · 과세기간 연/월 ~ 연/월(기본 올해 1월 ~ 이번 달) · 발행일자(기본 오늘)], [검색(F8)] 하면
 * 서식 한 장 — '( ) 부가가치세 과세표준 확인 / ( ) 면세사업자 수입금액 확인', 납세자 ① 주소 · ② 사업장 소재지 · ③ 전화 · ④ 상호 · ⑤ 사업자등록번호 ·
 * ⑥ 성명 · ⑦ 주민(법인)등록번호, 표 [과세기간 부터 · 까지 · 매출 과세표준(수입금액) · 세목 · 납부세액], 합계, 발행일자.
 * 원본 2026/01~10: 2026/07/01 ~ 2026/09/30 · 396,450,000 · 부가가치세 · 8,121,600 한 줄(신고서를 만든 기간만).
 *
 * <p>우리는 신고서를 저장하지 않아, 과세기간 안의 신고기간(석 달 — 예정 · 확정)마다 발행일자까지 끝났고 매출이 있는 것을 줄로 낸다.
 * 매출 과세표준은 매출 공급가액(과세 + 영세율), 납부세액은 매출세액 − 매입세액(부가가치세신고서 ㉰와 같은 셈).
 *
 * <p>두지 않은 것: 재무제표등확인 · [다시작성].
 */
export default function TaxCertificatePage() {
  const today = new Date()
  const [fromYm, setFromYm] = useState(`${today.getFullYear()}-01`)
  const [toYm, setToYm] = useState(ym(today))
  const [issueDate, setIssueDate] = useState(iso(today))
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const sheetRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '세무증명서류', [rows?.length ?? 0])

  useEffect(() => {
    api.get<CompanyInfo | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  async function search() {
    setError('')
    const from = `${fromYm}-01`
    const end = new Date(Number(toYm.slice(0, 4)), Number(toYm.slice(5, 7)), 0)
    const to = iso(end)
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      const out: Row[] = []
      /* 석 달 단위 신고기간 — 1~3 · 4~6 · 7~9 · 10~12. */
      for (let y = Number(fromYm.slice(0, 4)); y <= end.getFullYear(); y++) {
        for (let q = 0; q < 4; q++) {
          const pFrom = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`
          const pEnd = iso(new Date(y, q * 3 + 3, 0))
          if (pFrom < from || pEnd > to || pEnd > issueDate) continue
          let sales = 0, salesVat = 0, purchaseVat = 0
          for (const e of r.data.rows) {
            if (e.entryDate < pFrom || e.entryDate > pEnd) continue
            const s = vatSlipAmounts(e.lines, '매출')
            if (s) { sales += s.supply; salesVat += s.vat }
            const b = vatSlipAmounts(e.lines, '매입')
            if (b) purchaseVat += b.vat
          }
          if (sales !== 0 || salesVat !== 0 || purchaseVat !== 0) out.push({ from: pFrom, to: pEnd, sales, tax: salesVat - purchaseVat })
        }
      }
      setRows(out)
    } catch (e) {
      setRows(null); setError(extractErrorMessage(e))
    }
  }

  function print() {
    const win = openPrintWindow()
    if (!win || !sheetRef.current) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>세무증명서류</title><style>${PRINT_CSS}</style></head>`
      + `<body>${sheetRef.current.innerHTML}</body></html>`)
  }

  const address = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const total = (rows ?? []).reduce((a, r) => ({ sales: a.sales + r.sales, tax: a.tax + r.tax }), { sales: 0, tax: 0 })
  const [iy, im, id] = issueDate.split('-')

  return (
    <EcListShell title="세무증명서류" onSearch={search} option={false}
                 actions={rows ? [{ label: '인쇄', primary: true, onClick: print }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="출력구분">
          <label className="inline-flex items-center gap-[3px]"><input type="radio" name="tax-cert-kind" checked readOnly /> 부가세과세표준</label>
        </EcCond>
        <EcCond label="과세기간">
          <input type="month" className="ec-input w-[150px]" value={fromYm} onChange={(e) => setFromYm(e.target.value)} />
          ~
          <input type="month" className="ec-input w-[150px]" value={toYm} onChange={(e) => setToYm(e.target.value)} />
        </EcCond>
        <EcCond label="발행일자">
          <input type="date" className="ec-input w-[150px]" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
          </div>
        </li>
      </ul>

      {rows && (
        <div ref={sheetRef} className="max-w-[900px]">
          <p className="ec-report-title">(0) 부가가치세 과세표준 확인 / ( ) 면세사업자 수입금액 확인</p>
          <table className="w-full ec-report mb-[8px]">
            <tbody>
              <tr><th>① 주소 또는 거소(법인은 본점소재지)</th><td colSpan={3}>{address}</td></tr>
              <tr><th>② 사업장 소재지</th><td>{address}</td><th>③ 전화번호</th><td>{company?.tel ?? ''}</td></tr>
              <tr><th>④ 상호(법인명)</th><td>{company?.name ?? ''}</td><th>⑤ 사업자등록번호</th><td>{company?.bizRegNo ?? ''}</td></tr>
              <tr><th>⑥ 성명(대표자)</th><td>{company?.ceo ?? ''}</td><th>⑦ 주민(법인)등록번호</th><td>{company?.corpRegNo ?? ''}</td></tr>
            </tbody>
          </table>
          <table ref={tableRef} className="w-full ec-report mb-[8px]">
            <thead>
              <tr>
                <th className="text-center">과세기간 부터</th><th className="text-center">까지</th>
                <th className="text-right">매출 과세표준(수입금액)</th><th className="text-center">세목</th><th className="text-right">납부세액</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.from}>
                  <td className="text-center">{slash(r.from)}</td><td className="text-center">{slash(r.to)}</td>
                  <td className="text-right">{won(r.sales)}</td><td className="text-center">부가가치세</td><td className="text-right">{won(r.tax)}</td>
                </tr>
              ))}
              <tr className="ec-total">
                <td colSpan={2} className="text-center font-bold">합 계</td>
                <td className="text-right font-bold">{won(total.sales)}</td><td /><td className="text-right font-bold">{won(total.tax)}</td>
              </tr>
            </tbody>
          </table>
          <p>위 사실을 확인하여 주시기 바랍니다.</p>
          <p className="mb-[8px]">신 청 인 {company?.name ?? ''} (서명 또는 인)</p>
          <p className="text-center">{iy}년 {im}월 {id}일</p>
        </div>
      )}
    </EcListShell>
  )
}
