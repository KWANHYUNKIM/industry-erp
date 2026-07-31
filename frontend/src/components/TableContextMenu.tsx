import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react'
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
const ROW_CONTROL_SELECTOR = 'button, a[href], input[type=button], input[type=submit]'

/** 요소에서 사람이 읽을 이름을 뽑는다. 아이콘 버튼은 title/aria-label 을 쓴다. */
function controlLabel(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text) return text
  const attr = el.getAttribute('title') || el.getAttribute('aria-label') || ''
  if (attr.trim()) return attr.trim()
  if (el instanceof HTMLInputElement && el.value) return el.value
  return ''
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
  pageActions = [],
  onNew,
  newLabel,
  onSearchValue,
  onFlash,
}: {
  /** 표가 들어 있는 영역. 이 안에서 일어난 우클릭만 가로챈다. */
  containerRef: RefObject<HTMLElement | null>
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

  const flash = useCallback((msg: string) => { onFlash?.(msg) }, [onFlash])

  const buildSections = useCallback((
    table: HTMLTableElement,
    row: HTMLTableRowElement | null,
    cell: HTMLTableCellElement | null,
  ): MenuSection[] => {
    const sections: MenuSection[] = []

    // 1) 행 안에 이미 있는 버튼들 — 화면이 정의한 진짜 행 기능
    if (row) {
      const controls = Array.from(row.querySelectorAll(ROW_CONTROL_SELECTOR))
        .map((el) => ({ el, label: controlLabel(el) }))
        .filter((c) => c.label)
        .slice(0, 10)

      if (controls.length > 0) {
        sections.push({
          title: '이 행에서 하기',
          items: controls.map((c) => ({
            label: c.label,
            disabled: isDisabled(c.el),
            run: () => { (c.el as HTMLElement).click() },
          })),
        })
      }
    }

    // 2) 행 선택 체크박스가 있으면 메뉴에서도 켜고 끌 수 있게 한다
    //    (하단 '삭제·출력' 같은 일괄 기능이 이 선택을 본다)
    const picker = row?.querySelector('input[type=checkbox], input[type=radio]') as HTMLInputElement | null
    const rowItems: MenuItem[] = []
    if (picker) {
      rowItems.push({
        label: picker.checked ? '행 선택 해제' : '이 행 선택',
        run: () => picker.click(),
      })
    }
    if (row) {
      rowItems.push({
        label: '행 상세 보기',
        run: () => setDetail(rowToPairs(table, row)),
      })
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

    // 4) 화면 기능 — 하단 툴바와 같은 것들을 손 옮기지 않고 쓰라고 여기에도 둔다
    const pageItems: MenuItem[] = []
    if (onNew) pageItems.push({ label: newLabel ?? '신규', run: onNew })
    for (const a of pageActions) {
      if (!a.onClick) continue
      pageItems.push({ label: a.label, disabled: a.disabled, run: a.onClick })
    }
    if (pageItems.length > 0) sections.push({ title: '화면 기능', items: pageItems })

    return sections
  }, [flash, newLabel, onNew, onSearchValue, pageActions])

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
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
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
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'fixed', left, top, zIndex: 80, width,
          background: '#fff', border: '1px solid #c9d1da', borderRadius: 3,
          boxShadow: '0 6px 18px rgba(20,36,68,.22)', padding: 4,
          maxHeight: 420, overflowY: 'auto',
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
