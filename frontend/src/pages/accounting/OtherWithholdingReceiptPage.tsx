import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { WithholdingReceiptPayee } from '../../types/api'
import type { Company } from './SimplePaymentPage'

type Kind = 'BUSINESS' | 'INTEREST' | 'OTHER' | 'NON_RESIDENT'
const KINDS: { value: Kind; label: string }[] = [
  { value: 'BUSINESS', label: '사업소득' }, { value: 'INTEREST', label: '이자배당소득' }, { value: 'OTHER', label: '기타소득' },
  { value: 'NON_RESIDENT', label: '비거주자사업기타소득' },
]
/** 원본 기타소득 영수증 (9) 소득구분코드 — 해당 코드에 ⓥ. */
const OTHER_CODES = [
  ['68', '비과세 기타소득'], ['69', '분리과세 기타소득'], ['63', '소기업소상공인공제부금 해지 소득'],
  ['60', '필요경비 없는 기타소득([61], [63], [65], [78]제외)'], ['61', '주식매수선택권 행사이익'], ['64', '서화,골동품 양도소득'],
  ['65', '직무발명보상금'], ['71', '상금 및 부상'], ['72', '광업권 등'], ['73', '지역권 등'], ['74', '주택입주지체상금'],
  ['75', '원고료 등'], ['76', '강연료 등'], ['77', '종교인소득'], ['78', '사례금'], ['79', '자문료'], ['80', '통신판매 대여소득'],
  ['62', '그 밖에 필요경비 있는 기타소득([64]·[68]·[69]·[71]~[77]·[79]·[80]제외)'],
] as const
/** 비거주자사업기타소득 소득코드 — 원본 코드도움 그대로. */
const NR_CODES = [['40', '사업소득'], ['41', '선박등 임대소득'], ['42', '인적용역소득'], ['61', '사용료소득'], ['62', '기타소득']] as const
/** 원본 영수증은 지급 줄 칸이 늘 14줄이다(쓴 줄 + 빈 줄). */
const SHEET_ROWS = 14

const won = (n: number) => (Number(n) ? Math.trunc(Number(n)).toLocaleString('ko-KR') : '')
const thisMonth = () => new Date().toISOString().slice(0, 7)
const PRINT_CSS = 'body{font-family:sans-serif;font-size:11px;margin:16px}'
  + 'table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid gray;padding:3px}'
  + '.text-right{text-align:right}.text-center{text-align:center}.ec-report-title{font-size:16px;font-weight:bold;text-align:center}'

/**
 * 기타원천-원천징수영수증(보관용) (원본 세무 › 기타원천세 › 조회/인쇄 E030318, 2026-10-04 loginaa 실측).
 *
 * <p>조건 [세무신고사업장 · 서식구분(사업소득 · 이자배당소득 · 기타소득, 조회구분 소득자별) · 소득자 · 귀속연월(기본 올해 1월 ~ 이번 달) ·
 * 제출일자 · 출력용도(발행자보관용 · 소득자보관용)], 목록 [☐ · 주민(법인)등록번호 · 소득자명 · 지급총액 · 세액합계 · 세무신고사업장 ·
 * 원천징수영수증 조회]. 소득자명은 성명(유강사), 차례는 이름순. 원본 2026/01 ~ 10 사업소득: '-'(소득자 없는 줄) 27,017,060 ·
 * 유강사 1,231,234 · 피아노레슨 888,594. [조회]는 국세청 서식 — 사업소득 [별지 제23호서식(2)] 귀속연도 · 징수의무자 (1)~(5) ·
 * 소득자 (6)~(11) · (12) 업종구분 · 지급 줄 14칸 [(13) 지급 연 월 일 · (14) 소득귀속 연 월 · (15) 지급금액 · (16) 세율 · (17) 소득세 ·
 * (18) 지방소득세 · (19) 계] · '위의 원천징수세액(수입금액)을 정히 영수(지급)합니다.' · 제출일자 · 징수(보고)의무자,
 * 기타소득 서식은 (9) 소득구분코드에 ⓥ 와 [(12) 지급총액 · (13) 비과세소득 · (14) 필요경비 · (15) 소득금액 · (16) 세율 …].
 *
 * [조회구분 건별]은 지급 줄마다 [… · 귀속연월 · 지급일자 · …], 지급일자 차례.
 *
 * <p>두지 않은 것: [Email] · 비거주자사업기타소득 · 작성방법 안내문. 이자배당은 원본 서식 대신 지급 줄 표만 그린다.
 */
export default function OtherWithholdingReceiptPage() {
  const year = new Date().getFullYear()
  const [kind, setKind] = useState<Kind>('BUSINESS')
  const [payee, setPayee] = useState('')
  const [from, setFrom] = useState(`${year}-01`)
  const [to, setTo] = useState(thisMonth())
  const [submitDate, setSubmitDate] = useState(new Date().toISOString().slice(0, 10))
  const [forIssuer, setForIssuer] = useState(true)
  const [perLine, setPerLine] = useState(false)
  const [shownPerLine, setShownPerLine] = useState(false)
  const [rows, setRows] = useState<WithholdingReceiptPayee[]>([])
  const [shownKind, setShownKind] = useState<Kind>('BUSINESS')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [viewing, setViewing] = useState<WithholdingReceiptPayee | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [error, setError] = useState('')
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  async function search() {
    setError('')
    try {
      const { data } = await api.get<WithholdingReceiptPayee[]>('/other-withholdings/receipts', { params: { kind, from, to } })
      setRows(data.filter((r) => !payee.trim() || r.name.includes(payee.trim()) || (r.tradeName ?? '').includes(payee.trim())))
      setShownKind(kind)
      setShownPerLine(perLine)
      setPicked(new Set())
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }

  function print() {
    const win = openPrintWindow()
    if (!win || !sheetRef.current) return
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>원천징수영수증</title><style>${PRINT_CSS}</style></head>`
      + `<body>${sheetRef.current.innerHTML}</body></html>`)
  }

  // 건별 — 지급 줄마다 한 줄, 지급일자 차례(원본 2026/03/30 · 03/30 · 03/30 · 06/15 · 06/15 · 08/19 · 08/19). 조회는 그 한 건의 영수증.
  const list: WithholdingReceiptPayee[] = shownPerLine
    ? rows.flatMap((r) => r.lines.map((l) => ({ ...r, lines: [l], grossAmount: l.grossAmount, taxTotal: l.taxTotal })))
      .sort((a, b) => a.lines[0].payDate.localeCompare(b.lines[0].payDate))
    : rows
  const allPicked = list.length > 0 && picked.size === list.length
  const title = shownKind === 'OTHER' ? '기타소득 원천징수영수증' : shownKind === 'INTEREST' ? '이자배당소득 원천징수영수증' : '사업소득 원천징수영수증'

  return (
    <EcListShell title="기타원천-원천징수영수증(보관용)" onSearch={search} collapseConditions={false}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="세무신고사업장">
          <select className="ec-input w-full" disabled value="">
            <option value="">{company?.name ?? ''} {company?.bizRegNo ?? ''}</option>
          </select>
        </EcCond>
        <EcCond label="서식구분">
          {KINDS.map((k) => (
            <label key={k.value} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="receipt-kind" checked={kind === k.value} onChange={() => setKind(k.value)} /> {k.label}
            </label>
          ))}
          <span className="ml-[6px]">조회구분</span>
          <select className="ec-input w-[120px]" value={perLine ? 'line' : 'payee'} onChange={(e) => setPerLine(e.target.value === 'line')}>
            <option value="payee">소득자별</option>
            <option value="line">건별</option>
          </select>
        </EcCond>
        <EcCond label="소득자">
          <input className="ec-input w-[200px]" placeholder="소득자" value={payee} onChange={(e) => setPayee(e.target.value)} />
        </EcCond>
        <EcCond label="귀속연월">
          <input type="month" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          ~
          <input type="month" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="제출일자">
          <input type="date" className="ec-input w-[150px]" value={submitDate} onChange={(e) => setSubmitDate(e.target.value)} />
        </EcCond>
        <EcCond label="출력용도">
          {([[true, '발행자보관용'], [false, '소득자보관용']] as const).map(([v, l]) => (
            <label key={l} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="receipt-use" checked={forIssuer === v} onChange={() => setForIssuer(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
          </div>
        </li>
      </ul>

      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[47px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((_, i) => i)))} />
            </th>
            <th>주민(법인)등록번호</th>
            <th>소득자명</th>
            {shownPerLine && <><th className="text-center">귀속연월</th><th className="text-center">지급일자</th></>}
            <th className="text-right">지급총액</th>
            <th className="text-right">세액합계</th>
            <th className="text-center">세무신고사업장</th>
            <th className="text-center">원천징수영수증</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={shownPerLine ? 9 : 7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : list.map((r, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap text-center">
                <input type="checkbox" aria-label={`${r.name || '-'} 선택`} checked={picked.has(i)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
                {' '}{i + 1}
              </td>
              <td>{r.regNo ?? ''}</td>
              <td>{r.name}</td>
              {shownPerLine && <><td className="text-center">{r.lines[0].attributionMonth.replace('-', '/')}</td><td className="text-center">{r.lines[0].payDate.replace(/-/g, '/')}</td></>}
              <td className="text-right">{won(r.grossAmount)}</td>
              <td className="text-right">{won(r.taxTotal)}</td>
              <td className="text-center">{company?.name ?? ''}</td>
              <td className="text-center"><button className="ec-link" onClick={() => setViewing(r)}>조회</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {viewing && (
        <Modal open title={title} width={900} error={error} onClose={() => setViewing(null)}>
          <div ref={sheetRef}>
            <ReceiptSheet kind={shownKind} payee={viewing} company={company} year={from.slice(0, 4)} submitDate={submitDate} forIssuer={forIssuer} />
          </div>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={print}>인쇄</button>
            <button className="ec-btn" onClick={() => setViewing(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}

function ReceiptSheet({ kind, payee: p, company, year, submitDate, forIssuer }: {
  kind: Kind; payee: WithholdingReceiptPayee; company: Company | null; year: string; submitDate: string; forIssuer: boolean
}) {
  const nr = kind === 'NON_RESIDENT'
  const other = kind === 'OTHER' || nr
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '원천징수영수증', [kind, p])
  const blanks = Math.max(0, SHEET_ROWS - p.lines.length)
  const cols = other ? 14 : 10
  const [sy, sm, sd] = submitDate.split('-')
  const address = [company?.address, company?.addressDetail].filter(Boolean).join(' ')
  const use = (issuer: boolean) => `${forIssuer === issuer ? '☑' : '☐'}${issuer ? '발행자 보관용' : '소득자 보관용'}`
  return (
    <>
      <p>■ 소득세법 시행규칙 [별지 제23호서식({nr ? '5' : other ? '4' : '2'})]</p>
      <div className="ec-report-title">
        {nr ? '비거주자의 사업 · 기타소득' : `거주자의 ${other ? '기타소득' : kind === 'INTEREST' ? '이자 · 배당소득' : '사업소득'}`} 원천징수영수증
        <br />( {use(false)}  {use(true)} )
      </div>
      <table className="w-full ec-report ec-report-head400 mb-[8px]">
        <tbody>
          <tr><th>귀속연도</th><td>{year} 년</td><th>내 · 외국인</th><td>{p.foreigner ? '외국인 9' : '내국인 1'}</td></tr>
        </tbody>
      </table>
      <table className="w-full ec-report ec-report-head400 mb-[8px]">
        <tbody>
          <tr>
            <th rowSpan={2}>징수의무자</th>
            <th>(1) 사업자등록번호</th><td>{company?.bizRegNo ?? ''}</td>
            <th>(2) 법인명 또는 상호</th><td>{company?.name ?? ''}</td>
            <th>(3) 성 명</th><td>{company?.ceo ?? ''}</td>
          </tr>
          <tr>
            <th>(4) 주민(법인)등록번호</th><td>{forIssuer ? company?.corpRegNo ?? '' : ''}</td>
            <th>(5) 소재지 또는 주소</th><td colSpan={3}>{address}</td>
          </tr>
          {other ? <>
            <tr>
              <th rowSpan={2}>소득자</th>
              <th>(6) 성 명</th><td colSpan={2}>{p.name}</td>
              <th>(7) 주민(사업자)등록번호</th><td colSpan={2}>{p.regNo ?? ''}</td>
            </tr>
            <tr><th>(8) 주 소</th><td colSpan={5}>{p.address ?? ''}</td></tr>
            <tr>
              <th colSpan={2}>(9) 소득구분코드</th>
              <td colSpan={5}>{(nr ? NR_CODES : OTHER_CODES).map(([c, n]) => `[${c}]${n}${p.incomeCodes.includes(c) ? 'ⓥ' : ''}`).join(' ')}</td>
            </tr>
          </> : <>
            <tr>
              <th rowSpan={3}>소득자</th>
              <th>(6) 상 호</th><td colSpan={2}>{p.tradeName ?? ''}</td>
              <th>(7) 사업자등록번호</th><td colSpan={2}>{p.bizRegNo ?? ''}</td>
            </tr>
            <tr>
              <th>(8) 사업장소재지</th><td colSpan={5}>{p.bizAddress ?? ''}</td>
            </tr>
            <tr>
              <th>(9) 성 명</th><td colSpan={2}>{p.name}</td>
              <th>(10) 주민등록번호</th><td colSpan={2}>{p.regNo ?? ''}</td>
            </tr>
            <tr><th colSpan={2}>(11) 주 소</th><td colSpan={5}>{p.address ?? ''}</td></tr>
            {kind === 'BUSINESS' && <tr><th colSpan={2}>(12) 업종구분</th><td colSpan={5}>{p.industryCode ?? ''}</td></tr>}
          </>}
        </tbody>
      </table>
      <table ref={tableRef} className="w-full ec-report ec-report-head400 mb-[8px]">
        <thead>
          <tr>
            <th colSpan={3} className="text-center">{other ? '(10) 지급' : '(13) 지급'}</th>
            <th colSpan={2} className="text-center">{other ? '(11) 귀속' : '(14) 소득귀속'}</th>
            {other ? <>
              <th className="text-right">(12) 지급총액</th><th className="text-right">(13) 비과세소득</th>
              <th className="text-right">(14) 필요경비</th><th className="text-right">(15) 소득금액</th><th className="text-right">(16) 세율</th>
              <th className="text-right">(17) 소득세</th><th className="text-right">(18) 지방소득세</th><th className="text-right">(19) 농어촌특별세</th>
              <th className="text-right">(20) 계</th>
            </> : <>
              <th className="text-right">(15) 지급금액</th><th className="text-right">(16) 세율</th>
              <th className="text-right">(17) 소득세</th><th className="text-right">(18) 지방소득세</th><th className="text-right">(19) 계</th>
            </>}
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l, i) => (
            <tr key={i}>
              <td className="text-center">{l.payDate.slice(0, 4)}</td>
              <td className="text-center">{l.payDate.slice(5, 7)}</td>
              <td className="text-center">{l.payDate.slice(8, 10)}</td>
              <td className="text-center">{l.attributionMonth.slice(0, 4)}</td>
              <td className="text-center">{l.attributionMonth.slice(5, 7)}</td>
              <td className="text-right">{won(l.grossAmount)}</td>
              {other && <><td className="text-right"></td><td className="text-right">{won(l.expenseAmount)}</td><td className="text-right">{won(l.taxableAmount)}</td></>}
              <td className="text-right">{Number(l.taxRate)}</td>
              <td className="text-right">{won(l.incomeTax)}</td>
              <td className="text-right">{won(l.localIncomeTax)}</td>
              {other && <td className="text-right"></td>}
              <td className="text-right">{won(l.taxTotal)}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`b${i}`}>{Array.from({ length: cols }, (_, j) => <td key={j}>&nbsp;</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="text-center mb-[4px]">위의 원천징수세액(수입금액)을 정히 영수(지급)합니다.</p>
      <p className="text-right mb-[4px]">{sy} 년 {sm} 월 {sd} 일</p>
      <p className="text-right mb-[4px]">징수(보고)의무자 {company?.name ?? ''} (서명 또는 인)</p>
      <p>세 무 서 장 귀하</p>
    </>
  )
}
