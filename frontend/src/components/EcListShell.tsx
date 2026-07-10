import { useRef, useState, type ReactNode } from 'react'
import { exportTableToXlsx } from '../utils/excel'
import { printTable } from '../utils/print'
import { findDataTable } from '../utils/tableExport'

export interface BottomAction { label: string; onClick?: () => void; primary?: boolean }

/** onClick이 없을 때 셸이 기본 동작을 붙여주는 액션 라벨 */
const EXCEL_LABELS = ['Excel', '엑셀']
const PRINT_LABELS = ['인쇄', '출력']

/** 이카운트 목록 화면 쉘: ☆제목 + 우측 검색툴바 + 본문 + 하단 액션툴바 */
export default function EcListShell({
  title, search, onSearchChange, onSearch, newLabel = '신규(F2)', onNew, actions = [], help, children,
}: {
  title: string
  search?: string
  onSearchChange?: (v: string) => void
  onSearch?: () => void
  newLabel?: string
  onNew?: () => void
  actions?: BottomAction[]
  /** 도움말 모달 본문. 없으면 화면 제목 기준 기본 안내가 나온다. */
  help?: ReactNode
  children: ReactNode
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [localSearch, setLocalSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [notice, setNotice] = useState('')

  // 페이지가 검색을 직접 처리하지 않으면 셸이 렌더된 행을 필터링한다
  const searchHandledByPage = typeof onSearch === 'function'
  const searchValue = searchHandledByPage ? (search ?? '') : localSearch

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const withTable = (run: (t: HTMLTableElement) => boolean | Promise<boolean>) => async () => {
    const table = findDataTable(bodyRef.current)
    if (!table) {
      flash('이 화면에는 내보낼 표가 없습니다.')
      return
    }
    const ok = await run(table)
    if (!ok) flash('내보낼 자료가 없습니다.')
  }

  const doExcel = withTable((t) => exportTableToXlsx(t, title))
  const doPrint = withTable((t) => printTable(t, title))

  const filterRows = (q: string) => {
    const table = findDataTable(bodyRef.current)
    if (!table) return
    const needle = q.trim().toLowerCase()
    let hit = 0
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row = tr as HTMLTableRowElement
      // colSpan 안내행은 항상 노출
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return
      const match = !needle || (row.textContent ?? '').toLowerCase().includes(needle)
      row.style.display = match ? '' : 'none'
      if (match) hit += 1
    })
    if (needle) flash(`'${q.trim()}' 검색결과 ${hit}건`)
  }

  const runSearch = () => {
    if (searchHandledByPage) onSearch!()
    else filterRows(localSearch)
  }

  const changeSearch = (v: string) => {
    if (searchHandledByPage) onSearchChange?.(v)
    else setLocalSearch(v)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* 상단: ☆제목 + 검색 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>{title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <input
            className="ec-input"
            placeholder="입력 후 [Enter]"
            value={searchValue}
            onChange={(e) => changeSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
            style={{ width: 160 }}
          />
          <button className="ec-btn ec-btn-primary" onClick={runSearch}>Search(F3)</button>
          <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>
          <button className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>

          {optionOpen && (
            <>
              <div
                onClick={() => setOptionOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <div
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 41,
                  background: '#fff', border: '1px solid #c9d1da', borderRadius: 3,
                  boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: 4,
                }}
              >
                {[
                  { label: 'Excel 내려받기', run: doExcel },
                  { label: '인쇄', run: doPrint },
                  { label: '검색조건 초기화', run: async () => { setLocalSearch(''); filterRows('') } },
                ].map((m) => (
                  <button
                    key={m.label}
                    onClick={() => { setOptionOpen(false); void m.run() }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                      fontSize: 12, background: 'none', border: 0, cursor: 'pointer',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div style={{
          marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3,
          background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91',
        }}>
          {notice}
        </div>
      )}

      {/* 그리드 본문 */}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0 }}>{children}</div>

      {/* 하단 액션 툴바 */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        {onNew && <button className="ec-btn ec-btn-primary" onClick={onNew}>{newLabel}</button>}
        {actions.map((a, i) => {
          // 페이지가 onClick을 주지 않은 Excel/인쇄 버튼은 셸의 기본 동작으로 연결한다
          let handler = a.onClick
          if (!handler && EXCEL_LABELS.some((l) => a.label.includes(l))) handler = doExcel
          if (!handler && PRINT_LABELS.some((l) => a.label.includes(l))) handler = doPrint
          return (
            <button key={i} className={`ec-btn${a.primary ? ' ec-btn-primary' : ''}`} onClick={handler}>
              {a.label}
            </button>
          )
        })}
      </div>

      {helpOpen && (
        <div
          onClick={() => setHelpOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 4, width: 420, maxWidth: '90vw',
              boxShadow: '0 10px 30px rgba(0,0,0,.2)',
            }}
          >
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid #e6eaef',
              fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center',
            }}>
              <span>{title} · 도움말</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              {help ?? (
                <ul style={{ paddingLeft: 16, margin: 0 }}>
                  <li><b>Search(F3)</b> — 목록에서 입력한 낱말이 포함된 행만 추립니다.</li>
                  <li><b>Excel</b> — 지금 화면에 보이는 표를 .xlsx 파일로 내려받습니다.</li>
                  <li><b>인쇄</b> — 화면의 표를 인쇄용 서식으로 출력합니다.</li>
                  <li><b>Option</b> — 내려받기·인쇄·검색조건 초기화를 모아둔 메뉴입니다.</li>
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
