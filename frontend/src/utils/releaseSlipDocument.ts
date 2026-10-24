import { escapeHtml } from './escapeHtml'

/**
 * 주문서출고처리 처리 탭 [인쇄] — '출 고 증'(원본 E040230, 2026-10-13 loginaa 실측).
 *
 * 원본 창: 머리 '출 고 증' · 창고 · 출고일자(20261013 처럼 붙여 씀) · 납품처, 표 품목코드 · 품목명 · 수량(빈 줄로 채운 20줄),
 * 아래 '수량 5.00 · 인수 ____ 인'. 창은 미리보기로 뜨고 [인쇄] 를 눌러야 찍힌다.
 */
export interface ReleaseSlip {
  warehouseName: string | null
  releaseDate: string
  partnerName: string
  lines: { itemCode: string; itemName: string; quantity: number }[]
}

const ROWS = 20
const qty = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function releaseSlipHtml(slips: ReleaseSlip[]): string {
  const page = (s: ReleaseSlip) => {
    const body = s.lines.map((l) => `<tr><td>${escapeHtml(l.itemCode)}</td><td>${escapeHtml(l.itemName)}</td><td class="num">${qty(l.quantity)}</td></tr>`)
    while (body.length < ROWS) body.push('<tr><td>&nbsp;</td><td></td><td></td></tr>')
    const total = s.lines.reduce((a, l) => a + l.quantity, 0)
    return `<section class="slip">
      <h1>출 고 증</h1>
      <table class="head">
        <tr><th>창고</th><td>${escapeHtml(s.warehouseName ?? '')}</td><th>출고일자</th><td>${s.releaseDate.replace(/-/g, '')}</td></tr>
        <tr><th>납품처</th><td colspan="3">${escapeHtml(s.partnerName)}</td></tr>
      </table>
      <table class="lines">
        <thead><tr><th>품목코드</th><th>품목명</th><th>수량</th></tr></thead>
        <tbody>${body.join('')}</tbody>
      </table>
      <table class="foot"><tr><th>수량</th><td class="num">${qty(total)}</td><th>인수</th><td class="sign">인</td></tr></table>
    </section>`
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>출고증</title><style>
    body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; margin: 24px; color: #000; }
    .slip { page-break-after: always; max-width: 720px; margin: 0 auto 32px; }
    h1 { text-align: center; font-size: 22px; letter-spacing: 6px; margin: 0 0 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
    th, td { border: 1px solid #000; padding: 4px 6px; }
    th { font-weight: 400; width: 90px; text-align: center; }
    .lines th { width: auto; }
    td.num { text-align: right; }
    td.sign { text-align: right; width: 160px; }
    @page { size: A4 portrait; margin: 12mm; }
    @media print { body { margin: 0; } }
  </style></head><body>${slips.map(page).join('')}</body></html>`
}
