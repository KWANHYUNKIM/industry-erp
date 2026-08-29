import { tableToMatrix } from './tableExport'
import { escapeHtml } from './escapeHtml'

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

/**
 * 인쇄창을 <b>지금 당장</b> 연다.
 *
 * 브라우저는 사용자가 누른 그 순간(transient activation)에만 새 창을 허용한다. 결재란을 먼저
 * 가져오려고 {@code await} 를 하고 나서 열면 활성화가 만료돼 <b>팝업 차단에 걸리고, 버튼을 눌러도
 * 아무 일도 일어나지 않는다.</b> 그래서 창부터 열어 두고(빈 '준비 중' 문서) 내용은 나중에 채운다.
 */
export function openPrintWindow(): Window | null {
  const win = window.open('', '_blank', 'width=1024,height=768')
  if (!win) {
    alert('팝업이 차단되어 인쇄창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해 주세요.')
    return null
  }
  win.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
    + '<title>인쇄 준비 중…</title></head>'
    + '<body style="font-family:sans-serif;padding:24px;color:#5a626e">인쇄 내용을 준비하고 있습니다…</body></html>')
  return win
}

/**
 * 준비된 창에 문서를 써 넣고 인쇄 대화상자를 띄운다.
 *
 * @param autoPrint false 면 <b>보여 주기만</b> 한다 — 원본의 [미리보기]가 그것이다.
 *   찍기 전에 무엇이 나오는지 보고 싶은데, 대화상자가 먼저 뜨면 <b>취소부터</b> 눌러야 한다.
 */
export function fillAndPrint(win: Window, html: string, autoPrint = true) {
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  // document.write 로 만든 문서는 load 이벤트가 이미 지나가 onload 가 안 오는 경우가 있다.
  // 렌더가 끝난 뒤 인쇄를 부르려고 한 박자 늦춘다(바로 부르면 빈 페이지가 찍히는 브라우저가 있다).
  if (autoPrint) win.setTimeout(() => win.print(), 200)
}

/**
 * @param win 이미 열어 둔 인쇄창. 비동기 작업(결재란 조회) 뒤에 인쇄한다면 호출부가
 *            {@link openPrintWindow} 로 <b>클릭 시점에</b> 열어서 넘겨야 팝업 차단을 피한다.
 */
export function printTable(table: HTMLTableElement, title: string,
                           signLine?: PrintSignLine | null, win?: Window | null,
                           autoPrint = true): boolean {
  const { headers, rows } = tableToMatrix(table)
  if (rows.length === 0) {
    win?.close()
    return false
  }

  const target = win ?? openPrintWindow()
  if (!target) return false

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

  fillAndPrint(target, `<!doctype html>
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
</body></html>`, autoPrint)
  return true
}
