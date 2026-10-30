import { Fragment, useMemo, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import Modal from './Modal'
import { FooterButton } from './EcListShell'
import { ecAlert } from './EcDialog'
import { exportTableToXlsx } from '../utils/excel'
import { EMAIL_NOT_HERE } from '../features/sliphistory/SlipMenuHistoryModal'

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
export interface SlipPrintLine {
  date: string
  name: string
  qty: string
  unitPrice: string
  supply: string
  vat: string
}
export interface SlipPrintDoc {
  key: string | number
  /** 종이 제목(띄어 쓰지 않은 것, 예: '구매전표') — 종이에는 '구 매 전 표' 로 찍는다. */
  title: string
  /** 머리 왼쪽 상자의 첫 줄 값(전표번호) — 뒤에 '[ 쪽 / 쪽수 ]' 가 붙는다. */
  docNo: string
  date: string
  /** 머리 오른쪽 상자 두 줄(구매창고 · 구매처 …). */
  right: { label: string; value: string }[]
  lines: SlipPrintLine[]
  totalQty: string
  supply: string
  vat: string
  total: string
}

/** 한 쪽에 드는 품목 줄 수 — 원본 전자결재용은 품목 1 + 총합계 1 + 빈 줄 10 = 12 줄이다. */
const ROWS_PER_PAGE = 11
const FORMS = ['전자결재용', '내자기본'] as const
type Form = (typeof FORMS)[number]

interface Page { doc: SlipPrintDoc; lines: SlipPrintLine[]; no: number; of: number }

function pagesOf(docs: SlipPrintDoc[]): Page[] {
  return docs.flatMap((doc) => {
    const n = Math.max(1, Math.ceil(doc.lines.length / ROWS_PER_PAGE))
    return Array.from({ length: n }, (_, i) => ({ doc, lines: doc.lines.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE), no: i + 1, of: n }))
  })
}

function Sheet({ page, tableRef }: { page: Page; tableRef?: Ref<HTMLTableElement> }) {
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
      {form === '내자기본' && (<><div className="ec-slip-cut" /><Sheet page={page} /></>)}
    </div>
  )
}

export default function EcSlipPrintModal({ title, docs, onClose }: { title: string; docs: SlipPrintDoc[]; onClose: () => void }) {
  const pages = useMemo(() => pagesOf(docs), [docs])
  const [at, setAt] = useState(0)
  const [form, setForm] = useState<Form>('전자결재용')
  const [formOpen, setFormOpen] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)
  const page = pages[Math.min(at, pages.length - 1)]
  if (!page) return null
  const many = pages.length > 1
  const go = (i: number) => setAt(Math.max(0, Math.min(pages.length - 1, i)))
  const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)

  return (
    <Modal open title={title} width={696} onClose={onClose}>
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
                {FORMS.map((f) => (
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
          <button type="button" className="ec-btn" onClick={() => { if (tableRef.current) void exportTableToXlsx(tableRef.current, title) }}>Excel</button>
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
