import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import Modal from '../../../components/Modal'
import { EcCond } from '../../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../../api/client'
import { openPrintWindow, printHtml } from '../../../utils/print'
import { loadVatSheet, ReturnSheet, type AccountOpt, type CompanyInfo, type Sheet, type VatReturnRow } from './VatReturnPage'
import { pad2 } from '../../../utils/periods'

const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid gray;padding:3px}'
  + '.text-right{text-align:right}.text-center{text-align:center}.ec-report-title{font-size:16px;font-weight:bold;text-align:center}'
  + '.sheet{page-break-after:always}'

const dot = (d: string) => d.replace(/-/g, '/')

/**
 * 세무 › 부가세 › 부가세신고서(일반) › <b>부가세신고서 PDF 다운로드</b>(E030216) — 2026-10-12 loginaa 실측.
 *
 * <p>부가세신고서(일반)(E200928)이 지난해 ~ 올해 신고서를 다루고, 이 화면은 그보다 앞선 해(올해 − 5 ~ 올해 − 2)의 신고서를 받는 곳이다.
 * 같은 신고서 목록(vat_returns)을 읽는다 — 새로 만들거나 지우는 버튼은 없다.
 * 머리 도구는 Search(F3) · 도움말, 조건은 [신고기간](연도 ~ 연도) · [세무신고사업장].
 * 목록 머리 '회사명 : … / 귀속연도 : 2021년도 ~ 2024년도', 열 [☐ · 신고기간 · 예정누락 포함여부 · 회사명 · PDF(조회)], 아래 [PDF].
 *
 * <ul>
 *   <li>[신고기간]을 누르면 그 신고서의 머리(신고구분 · 세무신고사업장 · 신고서 종류 · 신고기간 · 신고작성일자 · 납부기한)를 읽기만 하는 창 — [닫기].</li>
 *   <li>[조회] → 'PDF변환목록' 창: [신고기간 · 사업자등록번호 · 예정누락기간 · 신고(작성)일자 · 납부기한] 한 줄, 그 아래
 *       [첨부서류명 · PDF] '부가가치세 신고서 · 파일받기'.</li>
 *   <li>아무것도 고르지 않고 [PDF] → '다운로드할 신고서가 선택되지 않았습니다.'</li>
 * </ul>
 *
 * <p>[PDF] · [파일받기]는 고른 신고서의 부가가치세신고서 서식을 한 인쇄창에 차례로 찍는다 — 브라우저의 'PDF로 저장' 으로 받는다
 * (원본은 PDF 파일을 바로 내려준다). 원본 PDF변환목록의 [이력] · '이카운트 자동 백업' 은 두지 않았다(PDF 를 저장해 두지 않는다).
 * 사업장이 하나라 [세무신고사업장]은 두지 않았다.
 */
export default function VatReturnPdfPage() {
  const thisYear = new Date().getFullYear()
  const years = [thisYear - 2, thisYear - 3, thisYear - 4, thisYear - 5]
  const [from, setFrom] = useState(thisYear - 5)
  const [to, setTo] = useState(thisYear - 2)
  const [rows, setRows] = useState<VatReturnRow[]>([])
  const [shown, setShown] = useState({ from: thisYear - 5, to: thisYear - 2 })
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [head, setHead] = useState<VatReturnRow | null>(null)
  const [files, setFiles] = useState<VatReturnRow | null>(null)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState<{ win: Window; sheets: { ret: VatReturnRow; sheet: Sheet }[] } | null>(null)
  const sheetsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<CompanyInfo | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])

  async function search() {
    setError('')
    const lo = Math.min(from, to), hi = Math.max(from, to)
    try {
      const r = await api.get<VatReturnRow[]>('/vat-returns', { params: { fromYear: lo, toYear: hi } })
      setRows(r.data)
      setShown({ from: lo, to: hi })
      setPicked(new Set())
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void search() }, [])

  async function download(targets: VatReturnRow[]) {
    if (targets.length === 0) { setError('다운로드할 신고서가 선택되지 않았습니다.'); return }
    setError('')
    const win = openPrintWindow()   // 누른 그 순간에 연다 — await 뒤에 열면 팝업 차단에 걸린다
    if (!win) return
    try {
      const sheets = await Promise.all(targets.map(async (ret) => ({ ret, sheet: await loadVatSheet(ret, accounts) })))
      setPrinting({ win, sheets })
    } catch (e) {
      win.close(); setError(extractErrorMessage(e))
    }
  }

  // 서식을 그린 다음 그 HTML 을 인쇄창에 옮긴다
  useEffect(() => {
    if (!printing || !sheetsRef.current) return
    printHtml(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>부가가치세신고서</title>`
      + `<style>${PRINT_CSS}</style></head><body>${sheetsRef.current.innerHTML}</body></html>`, { win: printing.win })
    setPrinting(null)
  }, [printing])

  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id))
  const omitted = (r: VatReturnRow) => r.returnKind === 'FINAL'
    ? `${pad2((r.monthFrom <= 6 ? 0 : 6) + 1)}월 ~ ${pad2((r.monthFrom <= 6 ? 0 : 6) + 3)}월` : ''

  return (
    <EcListShell title="부가세신고서 PDF 다운로드" onSearch={search} option={false}
                 actions={[{ label: 'PDF', primary: true, onClick: () => void download(rows.filter((r) => picked.has(r.id))) }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="신고기간">
          <select className="ec-input w-[80px]" aria-label="시작 연도" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {[...years].reverse().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          ~
          <select className="ec-input w-[80px]" aria-label="끝 연도" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
            <button className="ec-btn" onClick={() => { setFrom(thisYear - 5); setTo(thisYear - 2) }}>다시작성</button>
          </div>
        </li>
      </ul>

      <p className="text-right mb-[6px]">회사명 : {company?.name ?? ''} / 귀속연도 : {shown.from}년도 ~ {shown.to}년도</p>
      <table className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[47px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th>신고기간</th>
            <th>예정누락<br />포함여부</th>
            <th>회사명</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.periodName} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td><button className="ec-link" onClick={() => setHead(r)}>{r.periodName}</button></td>
              <td>{r.includesOmitted ? 'YES' : 'NO'}</td>
              <td>{company?.name ?? ''}</td>
              <td><button className="ec-link" onClick={() => setFiles(r)}>조회</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {head && (
        <Modal open error={error} title="부가가치세신고서(일반)" width={680} onClose={() => setHead(null)}>
          <ul className="ec-form [&>li>.title]:basis-[120px]">
            <EcCond label="신고구분" span={2}>{head.filingType === 'LATE' ? '기한후신고' : '정기신고'}</EcCond>
            <EcCond label="세무신고사업장" span={2}>{[company?.name, company?.bizRegNo].filter(Boolean).join(' ')}</EcCond>
            <EcCond label="신고서 종류" span={2}>
              <div className="flex flex-col items-start gap-[4px]">
                <span>{head.returnKind === 'MONTHLY' ? '월별신고(조기환급)' : '예정/확정'}</span>
                <span>신고기간 {head.year}/ {pad2(head.monthFrom)} ~ {pad2(head.monthTo)}</span>
              </div>
            </EcCond>
            <EcCond label="신고작성일자" span={2}>{dot(head.reportDate)}</EcCond>
            <EcCond label="납부기한" span={2}>{dot(head.dueDate)}</EcCond>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={() => setHead(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {files && (
        <Modal open error={error} title="PDF변환목록" width={780} onClose={() => setFiles(null)}>
          <table className="w-full text-center mb-[12px]">
            <thead>
              <tr><th>신고기간</th><th>사업자등록번호</th><th>예정누락기간</th><th>신고(작성)일자</th><th>납부기한</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>{files.returnKind === 'MONTHLY' ? `${files.year}년 ${pad2(files.monthFrom)}월 - ${pad2(files.monthTo)}월` : files.periodName}</td>
                <td>{company?.bizRegNo ?? ''}</td>
                <td>{omitted(files)}</td>
                <td>{dot(files.reportDate)}</td>
                <td>{dot(files.dueDate)}</td>
              </tr>
            </tbody>
          </table>
          <table className="w-full">
            <thead><tr><th>첨부서류명</th><th className="w-[160px] text-center">PDF</th></tr></thead>
            <tbody>
              <tr>
                <td>부가가치세 신고서</td>
                <td className="text-center"><button className="ec-link" onClick={() => void download([files])}>파일받기</button></td>
              </tr>
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn" onClick={() => setFiles(null)}>닫기</button>
          </div>
        </Modal>
      )}

      {printing && (
        <div ref={sheetsRef} hidden>
          {printing.sheets.map(({ ret, sheet }) => (
            <div key={ret.id} className="sheet"><ReturnSheet s={sheet} c={company} /></div>
          ))}
        </div>
      )}
    </EcListShell>
  )
}
