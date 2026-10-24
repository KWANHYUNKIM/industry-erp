import { escapeHtml } from './escapeHtml'

/**
 * 재고조정조회 [인쇄] — '재고조정전표'(원본 E040614, 2026-10-13 loginaa 실측).
 *
 * 원본: 밑줄 친 제목 '재고조정전표', 왼쪽 판 [전표번호 '2026/10/13 -3 [ 1 / 1 ]' · DATE '2026. 10. 13'],
 * 오른쪽 판 [담당자 · 창고 '냉장(00001)'], 표 순번 · 품목코드 · 품목명[규격] · 수량(-2,085.00) · 적요(12줄),
 * 아래 [수량 합계 · 인수 ___ 인]. 고른 전표 한 장이 한 쪽이다. 창은 미리보기로 뜬다.
 */
export interface AdjustSlip {
  /** '2026/10/13 -3' */
  docLabel: string
  date: string
  employeeName: string
  warehouseLabel: string
  lines: { itemCode: string; itemLabel: string; quantity: number; remark: string }[]
}

const ROWS = 12
const qty = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function adjustSlipHtml(slips: AdjustSlip[]): string {
  const page = (s: AdjustSlip) => {
    const body = s.lines.map((l, n) => `<tr><td class="c">${n + 1}</td><td>${escapeHtml(l.itemCode)}</td><td>${escapeHtml(l.itemLabel)}</td><td class="num">${qty(l.quantity)}</td><td>${escapeHtml(l.remark)}</td></tr>`)
    while (body.length < ROWS) body.push('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>')
    const total = s.lines.reduce((a, l) => a + l.quantity, 0)
    return `<section class="slip">
      <h1>재고조정전표</h1>
      <div class="boxes">
        <table class="box"><tr><th>전표번호</th><td>${escapeHtml(s.docLabel)} [ 1 / 1 ]</td></tr>
          <tr><th>DATE</th><td>${s.date.replace(/-/g, '. ')}</td></tr></table>
        <table class="box"><tr><th>담당자</th><td>${escapeHtml(s.employeeName)}</td></tr>
          <tr><th>창고</th><td>${escapeHtml(s.warehouseLabel)}</td></tr></table>
      </div>
      <table class="lines">
        <thead><tr><th>순번</th><th>품목코드</th><th>품목명[규격]</th><th>수량</th><th>적요</th></tr></thead>
        <tbody>${body.join('')}</tbody>
      </table>
      <table class="foot"><tr><th>수량</th><td class="num">${qty(total)}</td><th>인수</th><td class="sign">인</td></tr></table>
    </section>`
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>재고조정전표</title><style>
    body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; margin: 24px; color: #000; }
    .slip { page-break-after: always; max-width: 760px; margin: 0 auto 32px; }
    h1 { text-align: center; font-size: 20px; text-decoration: underline; margin: 0 0 12px; }
    .boxes { display: flex; gap: 12px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #000; padding: 3px 6px; }
    .box th { width: 90px; text-align: center; }
    .lines { margin-bottom: 8px; }
    .lines th { text-align: center; }
    td.c { text-align: center; }
    td.num { text-align: right; }
    .foot th { width: 120px; text-align: center; }
    td.sign { text-align: right; }
    @page { size: A4 portrait; margin: 12mm; }
    @media print { body { margin: 0; } }
  </style></head><body>${slips.map(page).join('')}</body></html>`
}
