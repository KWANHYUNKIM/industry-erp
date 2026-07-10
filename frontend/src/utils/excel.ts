import { buildFileName, tableToMatrix, type TableMatrix } from './tableExport'

const HEADER_FILL = 'FFEFF3F8'
const BORDER_COLOR = 'FFD8DEE6'

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 컬럼별 최대 표시폭(한글은 2칸으로 계산)으로 열너비를 잡는다. */
function columnWidth(header: string, rows: (string | number)[][], index: number): number {
  const display = (v: unknown) =>
    String(v ?? '')
      .split('')
      .reduce((w, ch) => w + (/[ㄱ-힝一-鿿]/.test(ch) ? 2 : 1), 0)

  const widest = rows.reduce((max, r) => Math.max(max, display(r[index])), display(header))
  return Math.min(Math.max(widest + 2, 8), 50)
}

export async function matrixToXlsx(matrix: TableMatrix, title: string): Promise<void> {
  const { headers, rows } = matrix

  // exceljs는 무겁다. Excel 버튼을 누른 순간에만 내려받는다.
  const { default: ExcelJS } = await import('exceljs')

  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  // 시트명은 31자 제한 + 일부 특수문자 금지
  const sheet = wb.addWorksheet(title.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || 'Sheet1')

  sheet.addRow(headers)
  rows.forEach((r) => sheet.addRow(r))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, size: 10 }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })
  headerRow.height = 20

  sheet.columns.forEach((col, i) => {
    col.width = columnWidth(headers[i] ?? '', rows, i)
  })

  const thin = { style: 'thin' as const, color: { argb: BORDER_COLOR } }
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin }
      if (typeof cell.value === 'number') {
        cell.numFmt = '#,##0.##'
        cell.alignment = { horizontal: 'right' }
      }
    })
  })

  // 헤더 고정 + 자동 필터
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  if (headers.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
  }

  const buffer = await wb.xlsx.writeBuffer()
  download(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    buildFileName(title, 'xlsx'),
  )
}

/** 화면의 테이블을 그대로 .xlsx로 내려받는다. 내보낼 행이 없으면 false. */
export async function exportTableToXlsx(table: HTMLTableElement, title: string): Promise<boolean> {
  const matrix = tableToMatrix(table)
  if (matrix.rows.length === 0) return false
  await matrixToXlsx(matrix, title)
  return true
}
