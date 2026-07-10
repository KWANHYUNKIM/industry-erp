/**
 * 화면에 렌더된 <table>을 읽어 내보내기/인쇄용 행렬로 변환한다.
 * 각 목록 화면이 자기 테이블을 직접 그리므로, 화면에 적용된 필터·정렬이 그대로 반영된다.
 */

export type CellValue = string | number
export interface TableMatrix {
  headers: string[]
  rows: CellValue[][]
}

/** 헤더 텍스트의 정렬 화살표 장식 제거 */
const SORT_MARKS = /[▼▲↑↓]/g

/** 천단위 구분 기호가 있거나 없는 순수 숫자 */
const NUMERIC = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/

/**
 * 셀 하나의 표시 텍스트를 뽑는다.
 * - 입력 컨트롤이 있으면 현재 값을 쓴다(편집형 그리드 대응)
 * - 버튼은 내보내기 대상이 아니므로 제외한다
 */
function extractCell(cell: HTMLTableCellElement): string {
  const controls = cell.querySelectorAll('input, select, textarea')
  if (controls.length > 0) {
    return Array.from(controls)
      .map((c) => {
        if (c instanceof HTMLSelectElement) return c.selectedOptions[0]?.text ?? ''
        if (c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio')) {
          return c.checked ? 'Y' : 'N'
        }
        return (c as HTMLInputElement | HTMLTextAreaElement).value
      })
      .filter(Boolean)
      .join(' ')
      .trim()
  }

  const clone = cell.cloneNode(true) as HTMLElement
  clone.querySelectorAll('button').forEach((b) => b.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 엑셀에서 숫자로 다뤄야 할 값만 숫자로 바꾼다.
 * 품목코드처럼 앞자리가 0인 값은 문자열로 유지한다.
 */
function coerce(text: string): CellValue {
  if (!NUMERIC.test(text)) return text
  if (/^-?0\d/.test(text)) return text
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) ? n : text
}

/** 컨테이너 안에서 데이터가 가장 많은 테이블을 고른다(요약표보다 본문 그리드 우선). */
export function findDataTable(root: HTMLElement | null): HTMLTableElement | null {
  if (!root) return null
  const tables = Array.from(root.querySelectorAll('table'))
  if (tables.length === 0) return null
  return tables.reduce((best, t) =>
    t.querySelectorAll('tbody tr').length > best.querySelectorAll('tbody tr').length ? t : best,
  )
}

export function tableToMatrix(table: HTMLTableElement): TableMatrix {
  // 그룹 헤더가 있는 경우 마지막 행이 실제 컬럼명이다
  const headRows = Array.from(table.querySelectorAll('thead tr'))
  const headerCells = headRows.length
    ? (Array.from(headRows[headRows.length - 1].querySelectorAll('th, td')) as HTMLTableCellElement[])
    : []

  // 헤더에 data-export-skip="true"가 붙은 열은 통째로 제외한다(행 선택 체크박스 열 등)
  const skipped = new Set<number>()
  headerCells.forEach((th, i) => {
    if (th.dataset.exportSkip === 'true') skipped.add(i)
  })

  const keep = <T,>(arr: T[]) => arr.filter((_, i) => !skipped.has(i))

  const headers = keep(headerCells).map((th) =>
    (th.textContent ?? '').replace(SORT_MARKS, '').replace(/\s+/g, ' ').trim(),
  )

  const bodyRows = Array.from(table.querySelectorAll('tbody tr'))
  const rows: CellValue[][] = []

  for (const tr of bodyRows) {
    if (tr.getAttribute('aria-hidden') === 'true') continue
    if ((tr as HTMLElement).dataset.exportSkip === 'true') continue

    const cells = Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[]
    if (cells.length === 0) continue

    // "불러오는 중…" / "표시할 자료가 없습니다" 같은 colSpan 안내행은 제외
    if (cells.length === 1 && cells[0].colSpan > 1) continue

    rows.push(keep(cells).map((td) => coerce(extractCell(td))))
  }

  return { headers, rows }
}

/** 파일명에 쓸 수 없는 문자를 제거하고 날짜를 붙인다. */
export function buildFileName(title: string, ext: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, '').trim() || 'export'
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${safe}_${stamp}.${ext}`
}
