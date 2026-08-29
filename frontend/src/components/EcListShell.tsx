import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { exportTableToXlsx } from '../utils/excel'
import { openPrintWindow, printTable, type PrintSignLine } from '../utils/print'
import { findDataTable } from '../utils/tableExport'
import Modal from './Modal'
import TableContextMenu from './TableContextMenu'

/**
 * 인쇄 시점에 기본 결재란을 가져온다. 셸이 뜰 때마다 미리 부르면 인쇄하지 않는 화면에서도
 * 매번 요청이 나간다. 결재란이 없거나 조회가 실패하면 결재란 없이 인쇄한다 — 도장칸이 없다고
 * 출력을 막을 이유는 없다.
 */
async function defaultSignLine(): Promise<PrintSignLine | null> {
  try {
    const r = await api.get<PrintSignLine>('/print-sign-lines/default')
    return r.status === 204 ? null : r.data
  } catch {
    return null
  }
}

export interface BottomAction { label: string; onClick?: () => void; primary?: boolean }

/** onClick이 없을 때 셸이 기본 동작을 붙여주는 액션 라벨 */
const EXCEL_LABELS = ['Excel', '엑셀']
const PRINT_LABELS = ['인쇄', '출력']
/**
 * 원본 [미리보기] — 인쇄와 <b>같은 종이</b>를 띄우되 인쇄 대화상자는 안 띄운다.
 * 무엇이 나오는지 보려고 [인쇄]를 누르면 대화상자부터 떠서 <b>취소를 먼저</b> 눌러야 했다.
 */
const PREVIEW_LABELS = ['미리보기']

/** 이카운트 목록 화면 쉘: ☆제목 + 우측 검색툴바 + 본문 + 하단 액션툴바 */
export default function EcListShell({
  title, search, onSearchChange, onSearch, newLabel = '신규(F2)', onNew,
  renderForm, formTitle, formWidth, actions = [], help, searchable = true, option = true, children,
}: {
  title: string
  search?: string
  onSearchChange?: (v: string) => void
  onSearch?: () => void
  newLabel?: string
  onNew?: () => void
  /** 신규 폼을 팝업으로 띄운다. close 를 호출하면 팝업이 닫힌다. onNew 보다 우선한다. */
  renderForm?: (close: () => void) => ReactNode
  /** 팝업 제목 (기본: "제목 등록") */
  formTitle?: string
  formWidth?: number
  actions?: BottomAction[]
  /** 도움말 모달 본문. 없으면 화면 제목 기준 기본 안내가 나온다. */
  help?: ReactNode
  /** 원본에 검색창이 없는 화면(예: 주요전달사항)은 false. Option·도움말만 남는다. */
  searchable?: boolean
  /** 원본에 [Option] 도 없는 화면(예: 익명게시판)은 false. 도움말만 남는다. */
  option?: boolean
  children: ReactNode
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [localSearch, setLocalSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
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
  // 결재란을 가져오기 전에 창부터 연다 — await 뒤에 window.open 을 부르면 사용자 제스처가 만료돼
  // 팝업 차단에 걸리고, 인쇄 버튼을 눌러도 아무 일도 일어나지 않는다.
  const doPrint = withTable(async (t) => {
    const win = openPrintWindow()
    if (!win) return true   // 차단 안내는 openPrintWindow 가 이미 띄웠다
    return printTable(t, title, await defaultSignLine(), win)
  })

  const doPreview = withTable(async (t) => {
    const win = openPrintWindow()
    if (!win) return true
    return printTable(t, title, await defaultSignLine(), win, false)
  })

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

  // 우클릭 메뉴의 '이 값으로 검색'. 페이지가 검색을 처리하는 경우 onSearchChange 로 값을 넣은 뒤
  // 그 값이 실제로 반영된 렌더에서 onSearch 를 부른다 — 같은 틱에 부르면 페이지가 옛 값으로 조회한다.
  const [pendingSearch, setPendingSearch] = useState<string | null>(null)
  const applySearchValue = (v: string) => {
    if (searchHandledByPage && onSearchChange) {
      onSearchChange(v)
      setPendingSearch(v)
    } else {
      setLocalSearch(v)
      filterRows(v)
    }
  }
  useEffect(() => {
    if (pendingSearch === null) return
    if (search !== pendingSearch) return
    setPendingSearch(null)
    onSearch?.()
  }, [pendingSearch, search, onSearch])

  // 하단 툴바와 우클릭 메뉴가 같은 동작을 쓰도록, Excel/인쇄 기본 핸들러를 여기서 한 번만 붙인다
  const resolved = actions.map((a) => {
    let handler = a.onClick
    if (!handler && EXCEL_LABELS.some((l) => a.label.includes(l))) handler = doExcel
    /* [미리보기]를 [인쇄]보다 <b>먼저</b> 본다 — '인쇄 미리보기' 는 둘 다 품는다. */
    if (!handler && PREVIEW_LABELS.some((l) => a.label.includes(l))) handler = doPreview
    if (!handler && PRINT_LABELS.some((l) => a.label.includes(l))) handler = doPrint
    return { ...a, onClick: handler }
  })

  /**
   * 검색(F8) — 원본 현황 화면의 단축키다. 우리 하단 버튼은 라벨만 `검색(F8)` 이었고
   * 실제로는 아무 데도 F8 을 걸어 두지 않아, 없는 단축키를 광고하고 있었다.
   *
   * 조건 판의 입력칸 안에서 눌러도 먹어야 하므로(그게 이 단축키를 쓰는 이유다)
   * window 에 건다. 대상은 라벨에 F8 이 적힌 버튼이고, 없으면 primary 버튼을 쓴다.
   * 전표입력의 저장(F8)은 EcSlipShell 이 따로 잡으므로 서로 겹치지 않는다.
   */
  // 호출부가 actions 를 인라인 배열로 넘기므로 resolved 는 매 렌더 새 배열이다.
  // 그걸 의존성으로 쓰면 렌더마다 리스너를 뗐다 붙인다 — 최신 핸들러만 ref 로 들고 한 번만 건다.
  // 등록 모달이 열려 있으면 아무것도 안 먹는다 — 보이지도 않는 뒤쪽 화면이 바뀌면 안 된다.
  const keyRef = useRef<Record<string, (() => void) | undefined>>({})
  keyRef.current = formOpen ? {} : {
    // 검색 — 라벨에 F8 이 적힌 버튼, 없으면 primary 버튼
    F8: (resolved.find((a) => a.label.includes('F8') && a.onClick)
      ?? resolved.find((a) => a.primary && a.onClick))?.onClick,
    // 신규 — 하단 좌측 버튼(모달 폼이 있으면 그걸 연다)
    F2: (onNew || renderForm) ? () => (renderForm ? setFormOpen(true) : onNew?.()) : undefined,
    // Search — 목록 낱말 추리기. 검색상자를 숨긴 화면(searchable={false})에는 없다.
    F3: searchable ? runSearch : undefined,
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const run = keyRef.current[e.key]
      if (!run || e.repeat) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hasBottom = Boolean(onNew || renderForm) || resolved.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* 상단: ☆제목 + 검색 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>{title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          {searchable && <>
            <input
              className="ec-input"
              placeholder="입력 후 [Enter]"
              value={searchValue}
              onChange={(e) => changeSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
              style={{ width: 160 }}
            />
            <button className="ec-btn ec-btn-primary" onClick={runSearch}>Search(F3)</button>
          </>}
          {option && <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>}
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

      {/* 표 우클릭 메뉴 — 등록·수정·삭제 + 행/열 기능 + 이 화면의 기능 */}
      <TableContextMenu
        containerRef={bodyRef}
        toolbarRef={toolbarRef}
        pageActions={resolved}
        onNew={onNew || renderForm ? () => (renderForm ? setFormOpen(true) : onNew?.()) : undefined}
        newLabel={newLabel}
        onSearchValue={applySearchValue}
        onFlash={flash}
      />

      {/* 하단 액션 툴바. 버튼이 하나도 없으면 구분선만 남아 빈 띠로 보이므로 아예 그리지 않는다. */}
      <div
        ref={toolbarRef}
        style={{
          display: hasBottom ? 'flex' : 'none',
          gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #eef1f5',
        }}
      >
        {(onNew || renderForm) && (
          <button
            className="ec-btn ec-btn-primary"
            onClick={() => (renderForm ? setFormOpen(true) : onNew?.())}
          >
            {newLabel}
          </button>
        )}
        {resolved.map((a, i) => (
          <button key={i} className={`ec-btn${a.primary ? ' ec-btn-primary' : ''}`} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </div>

      {renderForm && (
        <Modal
          open={formOpen}
          title={formTitle ?? `${title} 등록`}
          width={formWidth ?? 640}
          onClose={() => setFormOpen(false)}
        >
          {renderForm(() => setFormOpen(false))}
        </Modal>
      )}

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
                  <li><b>표 우클릭</b> — 맨 위에 <b>등록·수정·삭제</b>가 있습니다. 이어서 행 상세·복사,
                    이 값으로 검색, 열 숨기기(다시 조회하면 원래대로), 화면 기능이 나옵니다.
                    수정·삭제가 흐리게 보이면 그 화면에 해당 기능이 없다는 뜻입니다.
                    Shift+우클릭은 브라우저 기본 메뉴입니다.</li>
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
