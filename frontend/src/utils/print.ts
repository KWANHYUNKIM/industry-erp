import { tableToMatrix } from './tableExport'

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; margin: 24px; color: #1f2733; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #6b7480; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #c9d1da; padding: 4px 6px; text-align: left; }
  th { background: #eff3f8; font-weight: 700; text-align: center; }
  td.num { text-align: right; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  @page { size: A4 landscape; margin: 12mm; }
  @media print { body { margin: 0; } }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  /* 결재란: 도장을 찍을 자리라 칸을 넉넉히 비워둔다 */
  table.signline { width: auto; margin-bottom: 8px; }
  table.signline th { padding: 2px 10px; font-size: 10px; }
  table.signline td.sign { height: 42px; min-width: 56px; text-align: center; vertical-align: bottom; font-size: 10px; }
`

const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

/** 화면의 테이블을 인쇄용 창으로 띄운다. 인쇄할 행이 없으면 false. */
/** 인쇄용 결재란. 슬롯 이름이 비면 도장을 찍을 빈 칸으로 나간다. */
export interface PrintSignLine {
  name: string
  slots: { title: string; signerName: string | null }[]
}

/** 출력물 우측 상단 결재란. 없으면 아무것도 그리지 않는다. */
function signLineHtml(line?: PrintSignLine | null): string {
  if (!line || line.slots.length === 0) return ''
  const heads = line.slots.map((s) => `<th>${escapeHtml(s.title)}</th>`).join('')
  const cells = line.slots.map((s) => `<td class="sign">${escapeHtml(s.signerName ?? '')}</td>`).join('')
  return `<table class="signline"><thead><tr>${heads}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`
}

export function printTable(table: HTMLTableElement, title: string, signLine?: PrintSignLine | null): boolean {
  const { headers, rows } = tableToMatrix(table)
  if (rows.length === 0) return false

  const win = window.open('', '_blank', 'width=1024,height=768')
  if (!win) {
    alert('팝업이 차단되어 인쇄창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해 주세요.')
    return false
  }

  const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
  const tbody = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td class="${typeof c === 'number' ? 'num' : ''}">${escapeHtml(typeof c === 'number' ? c.toLocaleString() : c)}</td>`)
          .join('')}</tr>`,
    )
    .join('')

  const printedAt = new Date().toLocaleString('ko-KR')

  win.document.write(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head>
<body>
  <div class="head">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">출력일시 ${escapeHtml(printedAt)} · 총 ${rows.length}건</div>
    </div>
    ${signLineHtml(signLine)}
  </div>
  <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
</body></html>`)
  win.document.close()

  // 렌더 완료 후 인쇄 대화상자
  win.onload = () => {
    win.focus()
    win.print()
  }
  return true
}
