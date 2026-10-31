import { Fragment, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import Modal from './Modal'
import { FooterButton } from './EcListShell'
import { ecAlert } from './EcDialog'
import { exportTableToXlsx } from '../utils/excel'
import { EMAIL_NOT_HERE } from '../features/sliphistory/SlipMenuHistoryModal'
import type { SlipLetter, SlipPrintDoc, SlipPrintLine, SlipShipment, SlipStatement } from '../utils/slipTypes'

export type { SlipLetter, SlipPrintDoc, SlipPrintLine, SlipShipment, SlipStatement } from '../utils/slipTypes'

/**
 * 전표 인쇄 미리보기 창 — 원본 구매조회(E040304) 줄 [인쇄] · 하단 [인쇄] 가 띄우는 '구매전표' 창(2026-10-31 loginad 실측).
 *
 * <p>원본: 목록 위 창(폭 696) · 제목 '구매전표', 안에 굵은 '구매전표' + [Option], 흰 종이(651) 위에
 * '구 매 전 표'(18px 700 밑줄) · 머리 두 상자(전표번호 [ 쪽 / 쪽수 ] · DATE | 구매창고 이름(코드) · 구매처 이름(사업자번호)) ·
 * 품목 격자(일자 · 품목명[규격명] · 수량(단위포함) · 단가 · 공급가액 · 부가세, 총합계 줄, 빈 줄로 채움) ·
 * 아래 상자(수량 · 공급가액 · VAT · 합계 · 인 수 … 인). 아래 줄 [양식 ⌄](전자결재용 · 내자기본 · 신규양식추가) ·
 * [인쇄│▴](PDF · 인쇄설정 …) · [Email│▴](한 장일 때만) · [Excel] · [닫기]. 여러 전표를 고르면 [Page 1/2] 쪽 넘김이 붙는다.
 *
 * <p>[인쇄] 는 웹페이지가 아니라 <b>이 전표 종이만</b> 찍는다 — 종이를 body 바로 아래에 한 벌 더 두고(@media print 에서만 보임)
 * 나머지를 감춘다(index.css .ec-slip-print-out). 고른 전표가 여럿이면 쪽마다 한 장씩 찍힌다.
 */

const STATEMENT_ROWS = 12

/** 한 쪽에 드는 품목 줄 수 — 원본 전자결재용은 품목 1 + 총합계 1 + 빈 줄 10 = 12 줄이다. */
const ROWS_PER_PAGE = 11
type Form = string

interface Page { doc: SlipPrintDoc; lines: SlipPrintLine[]; no: number; of: number }

function pagesOf(docs: SlipPrintDoc[]): Page[] {
  return docs.flatMap((doc) => {
    const per = doc.letter?.rowsPerPage ?? (doc.statement ? STATEMENT_ROWS : doc.shipment ? SHIPMENT_ROWS : ROWS_PER_PAGE)
    const n = Math.max(1, Math.ceil((doc.shipment?.lines.length ?? doc.lines.length) / per))
    return Array.from({ length: n }, (_, i) => ({ doc, lines: doc.lines.slice(i * per, (i + 1) * per), no: i + 1, of: n }))
  })
}

/** 견적서 · 주문서 머리 표 — 원본처럼 한 표에 칸 합치기(rowSpan)로 짠다. */
function LetterHead({ h }: { h: SlipLetter }) {
  const leftN = h.left.length + (h.notice ? 3 : 0)
  const starts: number[] = []
  const logo = h.logoRows ?? 3
  let at = logo
  for (const r of h.right) { starts.push(at); at += r.rows ?? 1 }
  const n = Math.max(leftN, at)
  return (
    <table className="no-ec ec-slip-letter">
      <colgroup>
        <col className="w-[75px]" /><col className="w-[220px]" /><col className="w-[10px]" /><col className="w-[75px]" /><col />
      </colgroup>
      <tbody>
        {Array.from({ length: n }, (_, r) => {
          const ri = starts.indexOf(r)
          const covered = ri < 0 && h.right.some((x, k) => r > starts[k] && r < starts[k] + (x.rows ?? 1))
          return (
            <tr key={r}>
              {r < h.left.length ? (h.left[r].span ? <td colSpan={2} className="text-center">{h.left[r].value}</td> : <><th>{h.left[r].label}</th><td>{h.left[r].value}</td></>)
                : h.notice && r === h.left.length ? <td colSpan={2} rowSpan={3} className="notice">{h.notice.map((t) => <div key={t}>{t}</div>)}</td>
                  : h.notice && r < h.left.length + 3 ? null : <td colSpan={2} className="none" />}
              <td className="gap" />
              {r === 0 ? <td colSpan={2} rowSpan={logo} className="logo">{h.company}</td>
                : r < logo || covered ? null
                  : ri >= 0 ? <><th rowSpan={h.right[ri].rows ?? 1}>{h.right[ri].label}</th><td rowSpan={h.right[ri].rows ?? 1}>{h.right[ri].value}</td></>
                    : <td colSpan={2} className="none" />}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function LetterSheet({ page, tableRef }: { page: Page; tableRef?: Ref<HTMLTableElement> }) {
  const { doc, lines, no, of } = page
  const h = doc.letter as SlipLetter
  const last = no === of
  const blanks = Math.max(0, h.rowsPerPage - lines.length - (last && !h.noSum ? 0 : -1) - (h.noSum ? 1 : 0))
  return (
    <div className="ec-slip-sheet">
      <div className="ec-slip-title"><u>{[...doc.title].join(' ')}</u></div>
      <LetterHead h={h} />
      <div className="ec-slip-amount">
        <span>금 액 : {h.amountKorean}원 정</span>
        <span>(￦ {doc.total}원) / VAT포함</span>
      </div>
      <table className="no-ec ec-slip-lines" ref={tableRef}>
        <colgroup>
          <col className="w-[59px]" /><col /><col className="w-[39px]" /><col className="w-[58px]" /><col className="w-[58px]" /><col className="w-[60px]" />
        </colgroup>
        <thead>
          <tr><th>품목코드</th><th>{h.nameHead}</th><th>수량(단위포함)</th><th>단가</th><th>공급가액</th><th>부가세</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.date}</td><td>{l.name}</td><td className="text-right">{l.qty}</td>
              <td className="text-right">{l.unitPrice}</td><td className="text-right">{l.supply}</td><td className="text-right">{l.vat}</td>
            </tr>
          ))}
          {last && !h.noSum && (h.sumQty
            ? <tr className="sum"><td colSpan={2} className="text-center">총합계</td><td className="text-right">{doc.totalQty}</td><td /><td /><td /></tr>
            : <tr className="sum"><td colSpan={3} className="text-center">총합계</td><td /><td /><td /></tr>)}
          {Array.from({ length: blanks }, (_, i) => <tr key={`b${i}`} className="blank"><td /><td /><td /><td /><td /><td /></tr>)}
        </tbody>
      </table>
      <table className="no-ec ec-slip-foot is-letter">
        <tbody>
          <tr>
            <th>수량</th><td>{doc.totalQty}</td><th>공급가액</th><td>{doc.supply}</td><th>VAT</th><td>{doc.vat}</td>
            <th>합계</th><td>{doc.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** 거래명세서 · 출하전표 머리 — 왼쪽 제목 + 받는 쪽 상자, 오른쪽 세로 '공 급 자' 상자. */
function SupplierHead({ title, to, s, titleClass = 'title' }: { title: string; to: ReactNode; s: SlipStatement['supplier']; titleClass?: string }) {
  return (
      <table className="no-ec ec-slip-stmt">
        <colgroup>
          <col className="w-[299px]" /><col className="w-[20px]" /><col className="w-[20px]" /><col className="w-[70px]" /><col className="w-[99px]" /><col className="w-[50px]" /><col />
        </colgroup>
        <tbody>
          <tr>
            <td rowSpan={2} className={titleClass}>{title}</td><td className="gap" />
            <th rowSpan={4} className="who">공<br />급<br />자</th>
            <th>일련번호</th><td>{s.docNo}</td><th>TEL</th><td>{s.tel}</td>
          </tr>
          <tr className="tall"><td className="gap" /><th>사업자등록번호</th><td>{s.bizRegNo}</td><th>성명</th><td>{s.ceo}</td></tr>
          <tr>
            <td rowSpan={2} className="to">{to}</td>
            <td className="gap" /><th>상호</th><td colSpan={3}>{s.name}</td>
          </tr>
          <tr className="addr"><td className="gap" /><th>주소</th><td colSpan={3}>{s.address}</td></tr>
        </tbody>
      </table>
  )
}

const SHIPMENT_ROWS = 11

function ShipmentSheet({ page, tableRef }: { page: Page; tableRef?: Ref<HTMLTableElement> }) {
  const { doc, no, of } = page
  const h = doc.shipment as SlipShipment
  const lines = h.lines.slice((no - 1) * SHIPMENT_ROWS, no * SHIPMENT_ROWS)
  const last = no === of
  return (
    <div className="ec-slip-sheet">
      <SupplierHead title={doc.title} titleClass="title is-u" s={h.supplier} to={h.toName} />
      <table className="no-ec ec-slip-ship">
        <colgroup><col className="w-[75px]" /><col className="w-[220px]" /><col className="w-[75px]" /><col /></colgroup>
        <tbody>
          <tr><th>출하창고</th><td>{h.warehouse}</td><th>출하일</th><td>{h.date}</td></tr>
          <tr><th>납품지주소</th><td colSpan={3}>{h.address}</td></tr>
        </tbody>
      </table>
      <table className="no-ec ec-slip-lines" ref={tableRef}>
        <colgroup><col className="w-[300px]" /><col className="w-[150px]" /><col /></colgroup>
        <thead><tr><th>품목명(규격)</th><th>수량(단위포함)</th><th>적요</th></tr></thead>
        <tbody>
          {lines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="text-right">{l.qty}</td><td>{l.remark}</td></tr>)}
          {last && <tr className="sum"><td colSpan={3} className="text-center">총합계</td></tr>}
          {Array.from({ length: Math.max(0, SHIPMENT_ROWS - lines.length + (last ? 0 : 1)) }, (_, i) => <tr key={`b${i}`} className="blank"><td /><td /><td /></tr>)}
        </tbody>
      </table>
      <table className="no-ec ec-slip-foot is-ship">
        <tbody><tr><th>수량</th><td>{doc.totalQty}</td><th>인수</th><td>인</td></tr></tbody>
      </table>
    </div>
  )
}

function StatementSheet({ page, tableRef }: { page: Page; tableRef?: Ref<HTMLTableElement> }) {
  const { doc, lines, no, of } = page
  const h = doc.statement as SlipStatement
  const sum = lines.reduce((a, l) => ({ qty: a.qty + (l.num?.qty ?? 0), supply: a.supply + (l.num?.supply ?? 0), vat: a.vat + (l.num?.vat ?? 0) }), { qty: 0, supply: 0, vat: 0 })
  const won = (n: number) => n.toLocaleString('ko-KR')
  return (
    <div className="ec-slip-sheet">
      <SupplierHead title={doc.title} s={h.supplier}
        to={<><div>{h.to.name} 貴 中</div><div>{h.to.address}</div><div>{h.to.tel ? `☎ ${h.to.tel}` : ''}</div></>} />
      <div className="ec-slip-amount is-stmt">
        <span>금&nbsp;&nbsp;액 : {h.amountKorean}원 정</span>
        <span>(￦{doc.total})</span>
      </div>
      <table className="no-ec ec-slip-lines" ref={tableRef}>
        <colgroup>
          <col className="w-[70px]" /><col /><col className="w-[52px]" /><col className="w-[65px]" /><col className="w-[65px]" /><col className="w-[67px]" />
        </colgroup>
        <thead>
          <tr><th>일자</th><th>품목명[규격]</th><th>수량(단위포함)</th><th>단가</th><th>공급가액</th><th>부가세</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="text-center">{l.date}</td><td>{l.name}</td><td className="text-right">{l.qty}</td>
              <td className="text-right">{l.unitPrice}</td><td className="text-right">{l.supply}</td><td className="text-right">{l.vat}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, STATEMENT_ROWS - lines.length) }, (_, i) => <tr key={`b${i}`} className="blank"><td /><td /><td /><td /><td /><td /></tr>)}
        </tbody>
      </table>
      <table className="no-ec ec-slip-foot is-stmt">
        <tbody>
          <tr>
            <th>수량</th><td>{sum.qty.toLocaleString()}</td><th>공급가액</th><td>{won(sum.supply)}</td><th>VAT</th><td>{won(sum.vat)}</td>
            <th>합계</th><td>{won(sum.supply + sum.vat)}</td><th>인수</th><td>인</td>
          </tr>
        </tbody>
      </table>
      <div className="ec-slip-pageno">[ {no} / {of} ]</div>
    </div>
  )
}

function Sheet({ page, tableRef }: { page: Page; tableRef?: Ref<HTMLTableElement> }) {
  if (page.doc.letter) return <LetterSheet page={page} tableRef={tableRef} />
  if (page.doc.statement) return <StatementSheet page={page} tableRef={tableRef} />
  if (page.doc.shipment) return <ShipmentSheet page={page} tableRef={tableRef} />
  const { doc, lines, no, of } = page
  const last = no === of
  const blanks = Math.max(0, ROWS_PER_PAGE - lines.length - (last ? 0 : -1))
  return (
    <div className="ec-slip-sheet">
      <div className="ec-slip-title"><u>{[...doc.title].join(' ')}</u></div>
      <div className="ec-slip-head">
        <table className="no-ec">
          <tbody>
            <tr><th>전표번호</th><td>{doc.docNo} [ {no} / {of} ]</td></tr>
            <tr><th>DATE</th><td>{doc.date}</td></tr>
          </tbody>
        </table>
        <table className="no-ec">
          <tbody>
            {doc.right.map((r) => <tr key={r.label}><th>{r.label}</th><td>{r.value}</td></tr>)}
          </tbody>
        </table>
      </div>
      <table className="no-ec ec-slip-lines" ref={tableRef}>
        <colgroup>
          <col className="w-[70px]" /><col /><col className="w-[52px]" /><col className="w-[65px]" /><col className="w-[65px]" /><col className="w-[67px]" />
        </colgroup>
        <thead>
          <tr><th>일자</th><th>품목명[규격명]</th><th>수량(단위포함)</th><th>단가</th><th>공급가액</th><th>부가세</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="text-center">{l.date}</td><td>{l.name}</td><td className="text-right">{l.qty}</td>
              <td className="text-right">{l.unitPrice}</td><td className="text-right">{l.supply}</td><td className="text-right">{l.vat}</td>
            </tr>
          ))}
          {last && (
            <tr className="sum"><td colSpan={2} className="text-center">총합계</td><td className="text-right">{doc.totalQty}</td><td /><td /><td /></tr>
          )}
          {Array.from({ length: blanks }, (_, i) => <tr key={`b${i}`} className="blank"><td /><td /><td /><td /><td /><td /></tr>)}
        </tbody>
      </table>
      <table className="no-ec ec-slip-foot">
        <tbody>
          <tr>
            <th>수량</th><td>{doc.totalQty}</td><th>공급가액</th><td>{doc.supply}</td><th>VAT</th><td>{doc.vat}</td>
            <th>합계</th><td>{doc.total}</td><th>인 수</th><td>인</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** 양식대로 한 쪽 — 내자기본은 같은 전표를 점선 아래에 한 번 더 찍는다(원본 실측). */
function FormPage({ page, form, tableRef }: { page: Page; form: Form; tableRef?: Ref<HTMLTableElement> }) {
  return (
    <div className="ec-slip-page">
      <Sheet page={page} tableRef={tableRef} />
      {(form === '내자기본' || form === '기본(수정불가)') && !page.doc.letter && (<><div className="ec-slip-cut" /><Sheet page={page} /></>)}
    </div>
  )
}

/** 구매전표 창의 양식(원본 ✓전자결재용 · 내자기본 — 외자기본은 못 쟀다). */
const SLIP_FORMS = ['전자결재용', '내자기본']

export default function EcSlipPrintModal({ title, docs, onClose, forms = SLIP_FORMS, width = 696, pdf = false, excelLabel = 'Excel' }: {
  title: string; docs: SlipPrintDoc[]; onClose: () => void
  /** 양식 ⌄ 의 목록 — 첫 것이 처음 양식. 견적서 · 주문서는 ✓내자기본(창 폭 726). */
  forms?: string[]
  width?: number
  /** 아래 줄에 따로 선 [PDF] 단추(원본 견적서 창). */
  pdf?: boolean
  /** 원본 견적서 창은 [Excel(표시형식)]. */
  excelLabel?: string
}) {
  const pages = useMemo(() => pagesOf(docs), [docs])
  const [at, setAt] = useState(0)
  const [form, setForm] = useState<Form>(forms[0])
  const [formOpen, setFormOpen] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)
  const page = pages[Math.min(at, pages.length - 1)]
  if (!page) return null
  const many = pages.length > 1
  const go = (i: number) => setAt(Math.max(0, Math.min(pages.length - 1, i)))
  const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)

  return (
    <Modal open title={title} width={width} onClose={onClose}>
      <div className="ec-slip-preview">
        <div className="flex items-center justify-between mb-[6px]">
          <b>{title}</b>
          <button type="button" className="ec-btn" onClick={notHere('인쇄 Option')}>Option</button>
        </div>
        <div className="ec-slip-paper"><FormPage page={page} form={form} tableRef={tableRef} /></div>
        <div className="flex flex-wrap items-center gap-[4px] mt-[6px]">
          <span className="relative">
            <button type="button" className="ec-btn" aria-label="양식" onClick={() => setFormOpen((v) => !v)}>{form} ⌄</button>
            {formOpen && (
              <div className="ec-menu absolute bottom-full left-0 mb-[2px] min-w-[120px]">
                {forms.map((f) => (
                  <button key={f} type="button" className={f === form ? 'font-bold' : 'text-ec-danger'}
                          onClick={() => { setForm(f); setFormOpen(false) }}>{f === form ? `✓ ${f}` : f}</button>
                ))}
                <button type="button" className="font-bold" onClick={() => { setFormOpen(false); notHere('신규양식추가')() }}>신규양식추가</button>
              </div>
            )}
          </span>
          <FooterButton a={{ label: '인쇄', primary: true, onClick: () => window.print(), menu: [
            { label: 'PDF', onClick: () => window.print() },
            { label: '인쇄설정', onClick: notHere('인쇄설정') },
          ] }} />
          {!many && <FooterButton a={{ label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE), menu: [
            { label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE) },
          ] }} />}
          {pdf && <button type="button" className="ec-btn" onClick={() => window.print()}>PDF</button>}
          <button type="button" className="ec-btn" onClick={() => { if (tableRef.current) void exportTableToXlsx(tableRef.current, title) }}>{excelLabel}</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          {many && (
            <span className="ml-auto flex items-center gap-[4px]">
              <span className="ec-btn-group">
                <button type="button" className="ec-btn" aria-label="처음" onClick={() => go(0)}>«</button>
                <button type="button" className="ec-btn" aria-label="이전" onClick={() => go(at - 1)}>‹</button>
                <button type="button" className="ec-btn" aria-label="다음" onClick={() => go(at + 1)}>›</button>
                <button type="button" className="ec-btn" aria-label="끝" onClick={() => go(pages.length - 1)}>»</button>
              </span>
              <span>[Page {at + 1}/{pages.length}]</span>
            </span>
          )}
        </div>
      </div>
      {createPortal(
        <div className="ec-slip-print-out">
          {pages.map((p, i) => <Fragment key={i}><FormPage page={p} form={form} /></Fragment>)}
        </div>,
        document.body,
      )}
    </Modal>
  )
}
