import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { WithholdingReturn, WithholdingStatement } from '../../types/api'
import { StatementModal, StatementSheet } from './WithholdingPage'
import { fillAndPrint, openPrintWindow } from '../../utils/print'

/** 인쇄창 문서 — 화면의 서식 표를 그대로 옮기고 테두리만 단다. */
const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:24px}'
  + 'th,td{border:1px solid gray;padding:3px}.text-right{text-align:right}.text-center{text-align:center}'
  + '.font-bold{font-weight:bold}.sheet{page-break-after:always}'

/**
 * 원천세신고서 PDF 다운로드 (원본 세무 › 원천징수 › 세무신고 E030115, 2026-10-04 loginaa 실측).
 *
 * <p>원천징수이행상황신고서(E030101)가 <b>최근 두 해</b>(2025 ~ 2026) 신고서를 다루고, 이 화면은 그보다 앞선 해의
 * 신고서를 PDF 로 받는 곳이다. 조건 [신고기간](연도 ~ 연도, 올해 − 5 ~ 올해 − 2 만 고른다, 기본 전부) · [세무신고사업장].
 * 목록 [☐ · 귀속연월 · 신고구분(연말정산) · 지급연월 · 신고일자 · 회사명 · 사업자등록번호 · 조회], 아래 [PDF] 하나.
 * 머리 도구는 Search(F3) · 도움말뿐이다(Option 없음).
 *
 * <p>[PDF]는 고른 신고서의 서식 1쪽을 한 인쇄창에 차례로 찍는다 — 브라우저의 'PDF로 저장' 으로 받는다(원본은 PDF 파일을 바로 내려준다).
 * 사업장이 하나라 [세무신고사업장]은 두지 않았다.
 */
export default function WithholdingPdfPage() {
  const thisYear = new Date().getFullYear()
  const years = [thisYear - 2, thisYear - 3, thisYear - 4, thisYear - 5]
  const [from, setFrom] = useState(thisYear - 5)
  const [to, setTo] = useState(thisYear - 2)
  const [all, setAll] = useState<WithholdingReturn[]>([])
  const [rows, setRows] = useState<WithholdingReturn[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [viewing, setViewing] = useState<WithholdingReturn | null>(null)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState<{ win: Window; sheets: { ret: WithholdingReturn; stmt: WithholdingStatement }[] } | null>(null)
  const sheetsRef = useRef<HTMLDivElement>(null)

  async function search() {
    setError('')
    try {
      const data = all.length ? all : (await api.get<WithholdingReturn[]>('/withholding/returns')).data
      setAll(data)
      setRows(data.filter((r) => {
        const y = Number(r.attributionMonth.slice(0, 4))
        return y >= Math.min(from, to) && y <= Math.max(from, to)
      }))
      setPicked(new Set())
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void search() }, [])

  async function pdf() {
    const targets = (rows ?? []).filter((r) => picked.has(r.id))
    const win = openPrintWindow()   // 누른 그 순간에 연다 — await 뒤에 열면 팝업 차단에 걸린다
    if (!win) return
    try {
      const sheets = await Promise.all(targets.map(async (ret) => ({
        ret, stmt: (await api.get<WithholdingStatement>('/withholding/statement', { params: { month: ret.attributionMonth } })).data,
      })))
      setPrinting({ win, sheets })
    } catch (e) {
      win.close(); setError(extractErrorMessage(e))
    }
  }

  // 서식을 그린 다음 그 HTML 을 인쇄창에 옮긴다
  useEffect(() => {
    if (!printing || !sheetsRef.current) return
    fillAndPrint(printing.win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>원천세신고서</title>`
      + `<style>${PRINT_CSS}</style></head><body>${sheetsRef.current.innerHTML}</body></html>`)
    setPrinting(null)
  }, [printing])

  const list = rows ?? []
  const allPicked = list.length > 0 && picked.size === list.length
  const company = list[0]

  return (
    <EcListShell title="원천세신고서 PDF 다운로드" onSearch={search} option={false}
                 actions={[{ label: 'PDF', primary: true, onClick: pdf, disabled: picked.size === 0 }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="신고기간">
          <select className="ec-input w-[80px]" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {[...years].reverse().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          ~
          <select className="ec-input w-[80px]" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
            <button className="ec-btn" onClick={() => { setFrom(thisYear - 5); setTo(thisYear - 2) }}>다시작성</button>
          </div>
        </li>
      </ul>

      <p className="text-right mb-[6px]">
        회사명 : {company?.companyName ?? ''} / 귀속연도 : {Math.min(from, to)}년도 ~ {Math.max(from, to)}년도
      </p>
      <table className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[47px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((r) => r.id)))} />
            </th>
            <th>귀속연월</th>
            <th>신고구분<br />(연말정산)</th>
            <th>지급연월</th>
            <th>신고일자</th>
            <th>회사명</th>
            <th>사업자등록번호</th>
            <th>조회</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : list.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.attributionMonth} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td>{r.attributionMonth.replace('-', '/')}</td>
              <td>{r.filingMethodName}{r.includeYearEnd ? '(연말정산)' : ''}</td>
              <td>{r.payMonth.replace('-', '/')}</td>
              <td>{r.reportDate.replace(/-/g, '.')}</td>
              <td>{r.companyName ?? ''}</td>
              <td>{r.bizRegNo ?? ''}</td>
              <td><button className="ec-link" onClick={() => setViewing(r)}>조회</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {viewing && <StatementModal ret={viewing} onClose={() => setViewing(null)} />}
      {printing && (
        <div ref={sheetsRef} hidden>
          {printing.sheets.map(({ ret, stmt }) => (
            <div key={ret.id} className="sheet"><h3>원천징수이행상황신고서</h3><StatementSheet ret={ret} stmt={stmt} /></div>
          ))}
        </div>
      )}
    </EcListShell>
  )
}
