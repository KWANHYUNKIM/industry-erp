import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import Modal from './Modal'
import { rowToPairs, headerCells } from '../utils/tableExport'

/**
 * 표 우클릭 메뉴.
 *
 * 어떤 목록 화면이든 표 위에서 오른쪽 버튼을 누르면 "그 행에서 지금 할 수 있는 일"을 모아 보여준다.
 * 페이지마다 메뉴를 따로 정의하지 않는다 — 행 안에 이미 렌더돼 있는 버튼(수정·삭제·상세…)을 읽어서
 * 그대로 항목으로 만들기 때문에, 화면이 늘어나도 이 파일을 고칠 일이 없다.
 * 메뉴에서 고른 항목은 그 행의 버튼을 실제로 클릭한다. 따라서 동작·권한·확인창이 화면과 100% 같다.
 *
 * Shift+우클릭은 가로채지 않는다. 브라우저 기본 메뉴(검사·이미지 저장)가 필요할 때 쓰라고 남겨둔다.
 */

export interface ContextAction {
  label: string
  onClick?: () => void
  disabled?: boolean
}

interface MenuItem {
  label: string
  hint?: string
  disabled?: boolean
  run: () => void | Promise<void>
}

interface MenuSection {
  title: string
  items: MenuItem[]
}

interface OpenState {
  x: number
  y: number
  sections: MenuSection[]
}

/** 행 안에서 메뉴 항목으로 올릴 만한 조작 요소 */
const ROW_CONTROL_SELECTOR = 'button, a[href], [role=button], input[type=button], input[type=submit]'

/**
 * CRUD 판별. 화면이 `data-row-action="edit|delete|view"` 를 달아두면 그것을 먼저 믿고,
 * 없으면 이름으로 찾는다. 이름은 버튼 글자뿐 아니라 title·aria-label 도 함께 본다 —
 * 실제 화면에는 `<button title="삭제">✕</button>` 같은 아이콘 버튼이 적지 않다.
 */
const EDIT_RE = /^(수정|편집|변경|상세수정|edit|modify)/i
const DELETE_RE = /^(삭제|제거|delete|remove)/i
const VIEW_RE = /^(상세|보기|조회|열기|view|detail)/i
const NEW_RE = /^(신규|등록|추가|가입|작성|생성|new|add|create)/i

/** 접두어가 붙은 변형까지 잡는 2차 규칙. '영구삭제', '행 삭제', '라인 제거' 같은 것들 */
const EDIT_LOOSE = /수정|편집|변경/
const DELETE_LOOSE = /삭제|제거/
/** 지우기를 뜻하는 아이콘. 편집 그리드의 줄 삭제는 대부분 글자 없이 이것만 있다 */
const DELETE_ICON = /^[✕✖×⨯❌🗑🗙]$/
/** '삭제내역', '삭제취소'처럼 지우는 동작이 아닌 이름은 뺀다 */
const NOT_ACTION = /내역|목록|현황|취소|복구|이력/

/** 한 컨트롤을 가리키는 이름 후보들(글자·title·aria-label) */
function controlNames(el: Element): string[] {
  return [
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    el.getAttribute('title') ?? '',
    el.getAttribute('aria-label') ?? '',
  ].filter(Boolean)
}

function findRowControl(row: HTMLTableRowElement, kind: 'edit' | 'delete' | 'view', re: RegExp) {
  const controls = rowControls(row)
  const tagged = controls.find((el) => (el as HTMLElement).dataset.rowAction === kind)
  if (tagged) return tagged

  const hit = (test: (name: string) => boolean) =>
    controls.find((el) => controlNames(el).some((n) => !NOT_ACTION.test(n) && test(n)))

  // 1순위: 이름이 바로 그 동작으로 시작하는 것
  const exact = hit((n) => re.test(n))
  if (exact) return exact

  // 2순위: 접두어가 붙은 변형과 아이콘
  if (kind === 'edit') return hit((n) => EDIT_LOOSE.test(n))
  if (kind === 'delete') return hit((n) => DELETE_LOOSE.test(n) || DELETE_ICON.test(n))
  return undefined
}

/**
 * 행에 없으면 표를 감싼 상자에서 찾는다.
 * BOM처럼 카드 하나에 표 하나가 들어가고 수정·삭제는 카드 머리에 있는 화면이 있다.
 * 표에서 시작해 경계(목록 본문)까지 한 단계씩 올라가며, 다른 표의 행에 속하지 않은
 * 조작 요소만 본다. 가장 가까운 상자에서 찾자마자 멈추므로 화면 전체 버튼을 잘못 집지 않는다.
 */
function findNearbyControl(
  table: HTMLTableElement,
  re: RegExp,
  loose: RegExp,
  boundary: HTMLElement | null,
): HTMLElement | null {
  let node = table.parentElement
  while (node && node !== boundary) {
    const controls = (Array.from(node.querySelectorAll(ROW_CONTROL_SELECTOR)) as HTMLElement[])
      .filter((el) => !el.closest('tbody'))
    const names = (el: Element) => controlNames(el).filter((n) => !NOT_ACTION.test(n))
    const hit = controls.find((el) => names(el).some((n) => re.test(n)))
      ?? controls.find((el) => names(el).some((n) => loose.test(n)))
    if (hit) return hit
    node = node.parentElement
  }
  return null
}

/**
 * 행 안의 조작 요소를 모은다. React 의 onClick 은 DOM 에 드러나지 않으므로,
 * 버튼이 아니어도 손 모양 커서를 스스로 단 요소는 조작 요소로 본다(`<span onClick>` 대응).
 * 단 행 전체가 클릭 가능한 화면에서는 커서가 자식에게 상속되므로 이 추정을 쓰지 않는다.
 */
function rowControls(row: HTMLTableRowElement): HTMLElement[] {
  const found = new Set<HTMLElement>(Array.from(row.querySelectorAll(ROW_CONTROL_SELECTOR)))
  if (window.getComputedStyle(row).cursor !== 'pointer') {
    for (const el of Array.from(row.querySelectorAll('span, a, i')) as HTMLElement[]) {
      if (found.has(el)) continue
      const text = (el.textContent ?? '').trim()
      if (!text || text.length > 12) continue
      if (el.querySelector(ROW_CONTROL_SELECTOR)) continue
      if (window.getComputedStyle(el).cursor === 'pointer') found.add(el)
    }
  }
  return Array.from(found)
}

/**
 * 요소에서 사람이 읽을 이름을 뽑는다.
 * 글자가 아이콘 하나뿐이면(✕, 🗑) 메뉴에 그대로 쓸 수 없으므로 title/aria-label 을 앞세운다.
 */
function controlLabel(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  const attr = (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim()
  const iconOnly = !!text && !/[\w가-힣]/.test(text)
  if (text && !(iconOnly && attr)) return iconOnly && DELETE_ICON.test(text) ? '삭제' : text
  if (attr) return attr
  if (el instanceof HTMLInputElement && el.value) return el.value
  return ''
}

/**
 * 행 클릭으로 상세/수정이 열리는 화면에서, 무엇을 클릭해야 하는지 고른다.
 * React 의 onClick 은 DOM 에서 볼 수 없으므로 화면이 준 손 모양 커서를 신호로 삼는다.
 * 행 전체가 클릭형이면 행을, 특정 칸만 클릭형이면(제목 칸 등) 그중 글자가 가장 긴 칸을 고른다 —
 * 같은 행의 '📌' 같은 아이콘 칸을 눌러 엉뚱한 값을 바꾸지 않기 위해서다.
 */
function clickableTarget(row: HTMLTableRowElement): HTMLElement | null {
  if (row.dataset.rowAction === 'edit') return row
  const pointer = (el: Element) => window.getComputedStyle(el).cursor === 'pointer'
  if (pointer(row)) return row
  const cells = Array.from(row.cells)
    .filter((c) => pointer(c) && !c.querySelector('input, button, a, select, textarea'))
    .filter((c) => (c.textContent ?? '').trim().length > 1)
  if (cells.length === 0) return null
  return cells.reduce((best, c) =>
    (c.textContent ?? '').length > (best.textContent ?? '').length ? c : best)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true'
}

/** colSpan 안내행("불러오는 중…", "자료가 없습니다")은 데이터 행이 아니다. */
function isDataRow(row: HTMLTableRowElement): boolean {
  const cells = Array.from(row.cells)
  if (cells.length === 0) return false
  return !(cells.length === 1 && cells[0].colSpan > 1)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // http 로 접속했거나 권한이 없으면 clipboard API 가 막힌다 — 옛 방식으로 한 번 더 시도
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/** 열 숨기기: 헤더 index 의 셀을 머리·본문 모두에서 감춘다. */
function setColumnHidden(table: HTMLTableElement, index: number, hidden: boolean) {
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[]
  for (const row of rows) {
    const cell = row.cells[index]
    if (cell) cell.style.display = hidden ? 'none' : ''
  }
}

function hasHiddenColumn(table: HTMLTableElement): boolean {
  return headerCells(table).some((th) => th.style.display === 'none')
}

export default function TableContextMenu({
  containerRef,
  toolbarRef,
  pageActions = [],
  onNew,
  newLabel,
  onSearchValue,
  onFlash,
}: {
  /** 표가 들어 있는 영역. 이 안에서 일어난 우클릭만 가로챈다. */
  containerRef: RefObject<HTMLElement | null>
  /**
   * 하단 액션 툴바. 메뉴에서 고른 화면 기능은 넘겨받은 함수 대신 이 툴바의 진짜 버튼을 클릭한다.
   * '선택한 행 삭제'처럼 화면 상태를 읽는 기능은, 우클릭 시점에 붙잡아 둔 함수를 부르면
   * 옛 선택 상태로 실행된다. 버튼을 클릭하면 언제나 최신 상태로 돈다.
   */
  toolbarRef?: RefObject<HTMLElement | null>
  /** 화면 하단 툴바와 같은 기능들. 메뉴 아래쪽 '화면 기능'에 붙는다. */
  pageActions?: ContextAction[]
  onNew?: () => void
  newLabel?: string
  /** 셀 값으로 검색. 없으면 해당 항목을 숨긴다. */
  onSearchValue?: (value: string) => void
  /** 화면 상단 알림줄에 한 줄 띄운다. 없으면 조용히 넘어간다. */
  onFlash?: (msg: string) => void
}) {
  const [open, setOpen] = useState<OpenState | null>(null)
  const [detail, setDetail] = useState<{ label: string; value: string }[] | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const flash = useCallback((msg: string) => { onFlash?.(msg) }, [onFlash])

  const buildSections = useCallback((
    table: HTMLTableElement,
    row: HTMLTableRowElement | null,
    cell: HTMLTableCellElement | null,
  ): MenuSection[] => {
    const sections: MenuSection[] = []
    const picker = row?.querySelector('input[type=checkbox], input[type=radio]') as HTMLInputElement | null

    // 하단 툴바 버튼을 이름으로 찾아 클릭한다(넘겨받은 함수보다 이쪽이 항상 최신 상태를 본다)
    const toolbarButton = (re: RegExp): HTMLButtonElement | null => {
      const bar = toolbarRef?.current
      if (!bar) return null
      const buttons = Array.from(bar.querySelectorAll('button')) as HTMLButtonElement[]
      return buttons.find((b) => re.test(controlLabel(b))) ?? null
    }

    // 이 행만 선택 상태로 만든 뒤 하단 일괄 버튼을 누른다.
    // 체크박스 클릭 → React 상태 반영까지 한 틱 기다린다. 같은 틱에 누르면 옛 선택으로 실행된다.
    const runOnThisRowOnly = (button: HTMLButtonElement) => {
      if (picker) {
        const checked = Array.from(
          table.querySelectorAll('tbody input[type=checkbox]:checked, tbody input[type=radio]:checked'),
        ) as HTMLInputElement[]
        for (const cb of checked) if (cb !== picker) cb.click()
        if (!picker.checked) picker.click()
      }
      window.setTimeout(() => button.click(), 0)
    }

    // 1) CRUD — 이 메뉴에서 가장 먼저 보여야 할 것들
    const crud: MenuItem[] = []

    // 신규는 화면이 준 함수를 그대로 쓴다(선택 상태와 무관하므로 낡을 일이 없다).
    // 셸이 없는 화면에서는 툴바에서 이름으로 찾는다.
    const newBtn = onNew ? null : toolbarButton(NEW_RE)
    crud.push({
      label: newLabel?.replace(/\s*\(.*\)/, '').trim() || '신규 등록',
      hint: onNew || newBtn ? '추가' : '이 화면엔 등록 없음',
      disabled: !onNew && !newBtn,
      run: () => (onNew ? onNew() : newBtn?.click()),
    })

    if (row) {
      const viewBtn = findRowControl(row, 'view', VIEW_RE)
      crud.push({
        label: viewBtn ? controlLabel(viewBtn) : '이 행 상세 보기',
        hint: '조회',
        run: () => (viewBtn ? viewBtn.click() : setDetail(rowToPairs(table, row))),
      })

      // 수정: 행의 수정 버튼 → 없으면 행 클릭으로 열리는 화면인지 보고 행을 클릭
      const rowEdit = findRowControl(row, 'edit', EDIT_RE)
      const editBtn = rowEdit ?? findNearbyControl(table, EDIT_RE, EDIT_LOOSE, containerRef.current)
      const openTarget = editBtn ? null : clickableTarget(row)
      crud.push({
        label: '이 행 수정',
        hint: rowEdit ? '수정' : editBtn ? '이 표 수정' : openTarget ? '행 열기' : '이 화면엔 수정 없음',
        disabled: !editBtn && !openTarget,
        run: () => (editBtn ?? openTarget)?.click(),
      })

      // 삭제: 행의 삭제 버튼 → 표를 감싼 상자의 삭제 → 이 행만 선택하고 하단 삭제 버튼
      const rowDel = findRowControl(row, 'delete', DELETE_RE)
      const delBtn = rowDel ?? findNearbyControl(table, DELETE_RE, DELETE_LOOSE, containerRef.current)
      const bulkDelete = delBtn ? null : toolbarButton(DELETE_RE)
      crud.push({
        label: '이 행 삭제',
        hint: delBtn ? '삭제' : bulkDelete && picker ? '이 행만 선택 후' : '이 화면엔 삭제 없음',
        disabled: !delBtn && !(bulkDelete && picker),
        run: () => {
          if (delBtn) delBtn.click()
          else if (bulkDelete) runOnThisRowOnly(bulkDelete)
        },
      })
    }

    if (crud.length > 0) sections.push({ title: '등록 · 수정 · 삭제', items: crud })

    // 2) 그 밖에 이 행에 달려 있는 버튼들(승인·인쇄·복사 등). CRUD 로 이미 올린 것은 뺀다
    if (row) {
      const used = new Set<Element>()
      for (const kind of [['edit', EDIT_RE], ['delete', DELETE_RE], ['view', VIEW_RE]] as const) {
        const el = findRowControl(row, kind[0], kind[1])
        if (el) used.add(el)
      }
      const rest = rowControls(row)
        .filter((el) => !used.has(el))
        .map((el) => ({ el, label: controlLabel(el) }))
        .filter((c) => c.label)
        .slice(0, 8)

      if (rest.length > 0) {
        sections.push({
          title: '이 행의 다른 기능',
          items: rest.map((c) => ({
            label: c.label,
            disabled: isDisabled(c.el),
            run: () => { (c.el as HTMLElement).click() },
          })),
        })
      }
    }

    // 3) 행 선택·복사 등 보조 기능
    const rowItems: MenuItem[] = []
    if (picker) {
      rowItems.push({
        label: picker.checked ? '행 선택 해제' : '이 행 선택',
        run: () => picker.click(),
      })
    }
    if (row) {
      rowItems.push({
        label: '행 복사',
        hint: '탭 구분',
        run: async () => {
          const text = rowToPairs(table, row).map((p) => p.value).join('\t')
          flash(await copyText(text) ? '행을 복사했습니다.' : '복사에 실패했습니다.')
        },
      })
    }
    const inHead = !!cell?.closest('thead')
    const cellText = (cell?.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (cell && cellText && !inHead) {
      rowItems.push({
        label: '이 값 복사',
        hint: cellText.length > 14 ? `${cellText.slice(0, 14)}…` : cellText,
        run: async () => {
          flash(await copyText(cellText) ? '값을 복사했습니다.' : '복사에 실패했습니다.')
        },
      })
      if (onSearchValue) {
        rowItems.push({
          label: '이 값으로 검색',
          run: () => onSearchValue(cellText),
        })
      }
    }
    if (rowItems.length > 0) sections.push({ title: '행', items: rowItems })

    // 3) 열 — 헤더에서 우클릭했으면 그 열, 본문이면 그 셀이 속한 열
    const colItems: MenuItem[] = []
    const heads = headerCells(table)
    // 셀 위치와 헤더 순서가 1:1로 맞는 단순한 표에서만 열 조작을 내놓는다.
    // 그룹 헤더나 병합 셀이 있으면 index 가 어긋나 엉뚱한 열을 감춘다.
    const headRowCount = table.querySelectorAll('thead tr').length
    const simpleGrid = headRowCount === 1 && heads.every((h) => h.colSpan <= 1)
    const colIndex = simpleGrid && cell ? Array.from(cell.parentElement?.children ?? []).indexOf(cell) : -1
    const colName = colIndex >= 0
      ? (heads[colIndex]?.textContent ?? '').replace(/[▼▲↑↓]/g, '').replace(/\s+/g, ' ').trim()
      : ''
    if (colIndex >= 0 && heads.length > 0) {
      colItems.push({
        label: '이 열 숨기기',
        hint: colName || undefined,
        run: () => setColumnHidden(table, colIndex, true),
      })
    }
    if (inHead && colName) {
      colItems.push({
        label: '열 이름 복사',
        hint: colName,
        run: async () => {
          flash(await copyText(colName) ? '열 이름을 복사했습니다.' : '복사에 실패했습니다.')
        },
      })
    }
    if (hasHiddenColumn(table)) {
      colItems.push({
        label: '숨긴 열 모두 보이기',
        run: () => heads.forEach((_, i) => setColumnHidden(table, i, false)),
      })
    }
    if (colItems.length > 0) sections.push({ title: '열', items: colItems })

    // 5) 화면 기능 — 하단 툴바와 같은 것들을 손 옮기지 않고 쓰라고 여기에도 둔다.
    //    (엑셀·인쇄, 그리고 '선택한 행 전부' 를 대상으로 하는 일괄 기능들)
    const pageItems: MenuItem[] = []
    for (const a of pageActions) {
      if (!a.onClick) continue
      const btn = toolbarButton(new RegExp(`^${escapeRe(a.label)}$`))
      pageItems.push({
        label: a.label,
        disabled: a.disabled,
        run: () => (btn ? btn.click() : a.onClick?.()),
      })
    }
    if (pageItems.length > 0) sections.push({ title: '화면 기능', items: pageItems })

    return sections
  }, [containerRef, flash, newLabel, onNew, onSearchValue, pageActions, toolbarRef])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onContextMenu = (e: MouseEvent) => {
      if (e.shiftKey) return                       // 브라우저 기본 메뉴는 남겨둔다
      const target = e.target as HTMLElement | null
      if (!target) return
      // 입력 중인 칸에서는 잘라내기·붙여넣기가 있는 기본 메뉴가 더 쓸모 있다
      if (target.closest('input, textarea, select')) return
      // 이 메뉴가 띄운 상세 팝업 안에서 다시 메뉴가 열리지 않게 한다
      if (target.closest('[data-ctx-skip="true"]')) return

      const table = target.closest('table') as HTMLTableElement | null
      if (!table) return

      const cell = target.closest('td, th') as HTMLTableCellElement | null
      const tr = target.closest('tr') as HTMLTableRowElement | null
      const row = tr && tr.closest('tbody') && isDataRow(tr) ? tr : null

      const sections = buildSections(table, row, cell)
      if (sections.length === 0) return

      e.preventDefault()
      e.stopPropagation()                          // 바깥(레이아웃) 폴백 메뉴가 겹쳐 뜨지 않게 막는다
      setOpen({ x: e.clientX, y: e.clientY, sections })
    }

    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [buildSections, containerRef])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    // 메뉴가 길면 메뉴 안에서 스크롤이 일어난다. 그것까지 '화면이 움직였다'로 보면
    // 휠을 굴리는 순간 메뉴가 닫혀 아래쪽 항목을 고를 수 없다. 메뉴 안 스크롤은 넘어간다.
    const onScroll = (e: Event) => {
      // target 은 Node 가 아닐 수 있다(window 에서 올라온 scroll). contains 에 그대로 넣으면 예외가 나고
      // 그러면 메뉴가 영영 안 닫힌다.
      const target = e.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const menu: ReactNode = open && (() => {
    const count = open.sections.reduce((n, s) => n + s.items.length + 1, 0)
    const width = 208
    const height = Math.min(count * 26 + 12, 420)
    // 화면 밖으로 나가면 커서 반대쪽으로 뒤집는다
    const left = Math.max(4, Math.min(open.x, window.innerWidth - width - 6))
    const top = open.y + height > window.innerHeight ? Math.max(4, open.y - height) : open.y

    return (
      <div
        ref={menuRef}
        data-table-context-menu="true"
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'fixed', left, top, zIndex: 80, width,
          background: '#fff', border: '1px solid #c9d1da', borderRadius: 3,
          boxShadow: '0 6px 18px rgba(20,36,68,.22)', padding: 4,
          // 메뉴 끝까지 굴려도 그 스크롤이 뒷장으로 넘어가지 않게 한다(넘어가면 메뉴가 닫힌다)
          maxHeight: 420, overflowY: 'auto', overscrollBehavior: 'contain',
        }}
      >
        {open.sections.map((sec, si) => (
          <div key={sec.title} style={{ borderTop: si > 0 ? '1px solid #eef1f5' : undefined, paddingTop: si > 0 ? 3 : 0, marginTop: si > 0 ? 3 : 0 }}>
            <div style={{ padding: '3px 8px', fontSize: 10.5, fontWeight: 700, color: '#9aa1ab' }}>{sec.title}</div>
            {sec.items.map((item, ii) => (
              <button
                key={`${item.label}-${ii}`}
                disabled={item.disabled}
                onClick={() => { setOpen(null); void item.run() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                  padding: '5px 8px', fontSize: 12, background: 'none', border: 0, borderRadius: 2,
                  color: item.disabled ? '#b6bcc5' : '#333',
                  cursor: item.disabled ? 'default' : 'pointer',
                }}
                onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = 'var(--ec-blue-light)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                {item.hint && (
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#9aa1ab', maxWidth: 78, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  })()

  return (
    <>
      {menu}
      <Modal open={detail !== null} title="행 상세" width={520} onClose={() => setDetail(null)}>
        <table className="ec-grid" data-ctx-skip="true">
          <tbody>
            {(detail ?? []).map((p, i) => (
              <tr key={i}>
                <th style={{ width: 150, textAlign: 'left' }}>{p.label}</th>
                <td>{p.value || <span style={{ color: '#b6bcc5' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </>
  )
}
