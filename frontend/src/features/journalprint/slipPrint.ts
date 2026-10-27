import { api } from '../../api/client'
import { escapeHtml } from '../../utils/escapeHtml'
import { signLineHtml, type PrintSignLine } from '../../utils/print'
import type { FastVoucher, JournalEntry } from '../../types/api'

/**
 * 회계 I › 회계거래관리 의 출력물 — <b>전표</b>(회계거래조회 [전표] 인쇄 · 전표인쇄 E010702) 와
 * <b>결의서</b>(회계거래조회 [결의서] 인쇄 · 지출결의서인쇄 E010710 · 입금보고서인쇄 · 가지급금정산서인쇄).
 * 2026-10-20 loginaa 실측.
 *
 * <p>전표: 제목 '전표' + 결재란, '회사명 : … · 작성자 : … · 전표번호 : 2026/10/20-1', 격자 [계정명 · 적요 · 금액(차변 · 대변)].
 * 분개 한 줄이 두 칸 — 적요 칸 위는 거래처(계좌), 아래는 적요. 끝 줄 '합계'.
 * <p>결의서: 제목 = 결의서 이름(지출결의서 · 입금보고서 · 가지급금정산서), '회사명 · 작성자 · 전표일자 : 2026-10-13',
 * 격자 [적요 · 금액 · 수수료 · 계정과목 · 거래처], 끝 줄 '총합계'.
 *
 * <p>미리보기는 창 안(iframe), [인쇄]는 같은 HTML 을 인쇄 창으로 — 그래서 HTML 한 벌을 만든다.
 */

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; margin: 16px; color: #222; font-size: 12px; }
  .slip { page-break-after: always; margin-bottom: 28px; }
  .slip:last-child { page-break-after: auto; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  h1 { font-size: 26px; letter-spacing: 6px; margin: 18px 0 0 24px; font-weight: 700; }
  h1.center { text-align: center; margin: 4px 0 12px; letter-spacing: 2px; }
  .meta { display: flex; justify-content: space-between; margin: 6px 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #555; padding: 4px 6px; height: 22px; }
  th { font-weight: 700; text-align: center; }
  td.num { text-align: right; }
  td.c { text-align: center; }
  table.signline th, table.signline td { border-color: #555; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print { body { margin: 0; } }
`

const won = (n: number) => (n ? Math.round(n).toLocaleString('ko-KR') : '')
/** GL-20261020-0001 → 2026/10/20-1 (원본 전표 [전표번호]). */
export function slipNoLong(docNo: string, entryDate: string) {
  const m = /-0*(\d+)$/.exec(docNo)
  return `${entryDate.replaceAll('-', '/')}-${m ? m[1] : docNo}`
}

const page = (title: string, body: string) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${CSS}</style></head>
<body>${body}</body></html>`

/** 전표 한 장 이상(전표인쇄는 고른 전표를 이어 찍는다). */
export function journalSlipHtml(entries: JournalEntry[], company: string, sign: PrintSignLine | null): string {
  const one = (e: JournalEntry) => {
    const rows = e.lines.map((l) => {
      const who = l.partnerName ?? e.partnerName ?? ''
      return `<tr><td rowspan="2">${escapeHtml(l.accountName)}</td><td>${escapeHtml(who)}</td>`
        + `<td class="num" rowspan="2">${won(l.debit)}</td><td class="num" rowspan="2">${won(l.credit)}</td></tr>`
        + `<tr><td>${escapeHtml(l.description ?? e.description ?? '')}</td></tr>`
    }).join('')
    return `<div class="slip">
  <div class="top"><h1>전표</h1>${signLineHtml(sign)}</div>
  <div class="meta"><span>회사명 : ${escapeHtml(company)}</span><span>작성자 : ${escapeHtml(e.createdBy ?? '')}</span>`
      + `<span>전표번호 : ${escapeHtml(slipNoLong(e.docNo, e.entryDate))}</span></div>
  <table>
    <thead><tr><th rowspan="2" style="width:22%">계정명</th><th rowspan="2">적요</th><th colspan="2">금액</th></tr>
      <tr><th style="width:17%">차변</th><th style="width:17%">대변</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td class="c" colspan="2">합계</td><td class="num">${won(e.totalDebit)}</td><td class="num">${won(e.totalCredit)}</td></tr></tfoot>
  </table>
</div>`
  }
  return page('전표', entries.map(one).join(''))
}

/** 결의서 한 장 이상 — 지출결의서 · 입금보고서 · 가지급금정산서. */
export function voucherSlipHtml(vouchers: FastVoucher[], company: string): string {
  const one = (v: FastVoucher) => {
    /* 수수료는 결의서 머리 하나(영수증으로 등) — 첫 줄에 찍는다. */
    const rows = v.lines.map((l, i) => `<tr><td>${escapeHtml(l.description ?? v.description ?? '')}</td>`
      + `<td class="num">${won(l.amount)}</td><td class="num">${i === 0 ? won(v.fee) : ''}</td>`
      + `<td>${escapeHtml(l.accountName)}</td><td>${escapeHtml(l.partnerName ?? l.employeeName ?? v.partnerName ?? '')}</td></tr>`).join('')
    const total = v.lines.reduce((a, l) => a + l.amount, 0)
    return `<div class="slip">
  <h1 class="center">${escapeHtml(v.typeName)}</h1>
  <div class="meta"><span>회사명 : ${escapeHtml(company)}</span><span>작성자 : ${escapeHtml(v.createdBy ?? '')}</span>`
      + `<span>전표일자 : ${escapeHtml(v.voucherDate)}</span></div>
  <table>
    <thead><tr><th>적 요</th><th style="width:15%">금 액</th><th style="width:12%">수수료</th><th style="width:20%">계정과목</th><th style="width:20%">거래처</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td class="c">총합계</td><td class="num">${won(total)}</td><td></td><td></td><td></td></tr></tfoot>
  </table>
</div>`
  }
  return page(vouchers[0]?.typeName ?? '결의서', vouchers.map(one).join(''))
}

/** 회사명 · 회계 결재란(인쇄용결재라인등록(회계) 결재라인 1). 못 가져오면 빈 값 — 출력을 막지 않는다. */
export async function loadSlipHeader(): Promise<{ company: string; sign: PrintSignLine | null }> {
  const [c, s] = await Promise.allSettled([
    api.get<{ name: string } | null>('/company'),
    api.get<PrintSignLine>('/print-sign-lines/default', { params: { module: 'ACCOUNTING' } }),
  ])
  return {
    company: c.status === 'fulfilled' ? c.value.data?.name ?? '' : '',
    sign: s.status === 'fulfilled' && s.value.status !== 204 ? s.value.data : null,
  }
}

/** 원본 [결의서] 인쇄를 결의서가 아닌 전표에서 누르면 뜨는 알림. */
export const VOUCHER_ONLY_MESSAGE = '지출/입금/가지급정산서만 결의서 인쇄가 가능합니다.'

/**
 * 결의서 인쇄 화면의 [건별] — 결의서 줄 하나를 전표 한 장으로(원본 2026-10-20: 지출결의서 2줄 68,000 의 [건별] →
 * 전표 '복리후생비(판) 스타벅스 8,000 / 보통예금 기업은행-1122 8,000'). 줄이 많은 쪽(지출 = 차변, 입금 = 대변)을
 * 한 줄씩 떼고, 맞은편은 같은 순번 줄(없으면 첫 줄) 계정에 같은 금액으로 붙인다.
 */
export function splitPerLine(e: JournalEntry): JournalEntry[] {
  const dr = e.lines.filter((l) => l.debit > 0)
  const cr = e.lines.filter((l) => l.credit > 0)
  if (dr.length <= 1 && cr.length <= 1) return [e]
  const debitSide = dr.length >= cr.length
  const main = debitSide ? dr : cr
  const other = debitSide ? cr : dr
  return main.map((l, i) => {
    const amt = debitSide ? l.debit : l.credit
    const o = other[i] ?? other[0]
    const counter = { ...o, debit: debitSide ? 0 : amt, credit: debitSide ? amt : 0 }
    const lines = debitSide ? [l, counter] : [counter, l]
    return { ...e, lines, totalDebit: amt, totalCredit: amt }
  })
}
