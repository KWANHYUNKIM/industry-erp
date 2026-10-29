import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { exportTableToXlsx } from '../utils/excel'
import { openPrintWindow, printTable, signModuleOf, type PrintSignLine } from '../utils/print'
import { ecAlert, NO_SELECTION_MESSAGE } from './EcDialog'
import { findDataTable } from '../utils/tableExport'
import Modal from './Modal'
import TableContextMenu from './TableContextMenu'
import { INQUIRY_PICKS, periodOf } from '../utils/periods'

/**
 * 인쇄 시점에 기본 결재란을 가져온다. 셸이 뜰 때마다 미리 부르면 인쇄하지 않는 화면에서도
 * 매번 요청이 나간다. 결재란이 없거나 조회가 실패하면 결재란 없이 인쇄한다 — 도장칸이 없다고
 * 출력을 막을 이유는 없다.
 */
async function defaultSignLine(): Promise<PrintSignLine | null> {
  try {
    // 결재란은 모듈(회계 · 재고 · 관리)마다 따로다 — 화면 주소로 고른다(printDocument 와 같은 규칙)
    const r = await api.get<PrintSignLine>('/print-sign-lines/default', { params: { module: signModuleOf(window.location.pathname) } })
    return r.status === 204 ? null : r.data
  } catch {
    return null
  }
}

export interface BottomAction {
  label: string
  onClick?: () => void
  primary?: boolean
  /** 지금은 누를 수 없는 버튼(권한 · 상태 때문에). 고른 줄이 없는 것은 잠그지 말고 `selected` 를 준다. */
  disabled?: boolean
  /**
   * 고른 줄 수 — <b>고른 줄에 대고 하는 버튼</b>([선택삭제] · [진행상태변경] · [다른전표생성] …)에 준다.
   * 원본(2026-10-13 loginaa 구매조회 실측)은 이 버튼을 잠그지 않고, 0 줄인 채로 누르면 화면 안 '알림' 창에
   * "리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다." 를 띄운다. 0 이면 셸이 그 알림을 띄우고 onClick 은 안 부른다.
   */
  selected?: number
  /**
   * 붙은 ▴ 펼침 — 원본 [입금보고서작성 ▴] 의 [채권만감소] 처럼 같은 버튼에 딸린 다른 동작(채권감소등록 E060402 실측).
   * 펼침은 위로 열린다(버튼줄이 화면 바닥에 있다).
   */
  menu?: { label: string; onClick: () => void }[]
  /** 버튼 전체가 펼침을 연다(원본 마스터 리스트 [사용중단/재사용 ▴] 2026-10-22 실측 — 글자를 눌러도 사용중단 · 삭제 · 재사용이 위로 펴진다). 없으면 글자는 onClick. */
  menuOnly?: boolean
}

/** 조건 판 아래 줄의 [양식 ⌄] — ✓ 지금 양식 · 기본(수정불가)(빨간 글자) · 신규양식추가(원본 이익관리 현황 2026-10-22 실측). 메뉴는 위로 펴진다. */
function FormPill({ current, up = false }: { current: string; up?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <button type="button" className="ec-btn ec-btn-sm" aria-label="양식" onClick={() => setOpen((v) => !v)}>{current} ⌄</button>
      {open && (
        <div className={`ec-menu ${up ? 'absolute bottom-full left-0 mb-[2px] min-w-[120px]' : 'ec-search-picks'}`}>
          <button type="button" className="font-bold" onClick={() => setOpen(false)}>✓ {current}</button>
          <button type="button" className="text-ec-danger" onClick={() => { setOpen(false); void ecAlert('양식은 하나만 지원합니다.') }}>기본(수정불가)</button>
          <button type="button" className="font-bold" onClick={() => { setOpen(false); void ecAlert('신규양식추가는 지원하지 않습니다(양식 하나).') }}>신규양식추가</button>
        </div>
      )}
    </span>
  )
}

/** 하단 버튼 하나 — menu 가 있으면 붙은 묶음(.ec-btn-group + ▴). */
function FooterButton({ a }: { a: BottomAction }) {
  const [open, setOpen] = useState(false)
  const cls = `ec-btn${a.primary ? ' ec-btn-primary' : ''}`
  if (!a.menu?.length) return <button className={cls} onClick={a.onClick} disabled={a.disabled}>{a.label}</button>
  return (
    <span className="ec-btn-group relative">
      <button className={cls} onClick={a.menuOnly ? () => setOpen((v) => !v) : a.onClick} disabled={a.disabled}>{a.label}</button>
      <button className={`${cls} ec-btn-arrow`} aria-label={`${a.label} 더보기`} onClick={() => setOpen((v) => !v)}>▴</button>
      {open && (
        <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[110px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
          {a.menu.map((m) => (
            <button key={m.label} type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                    onClick={() => { setOpen(false); m.onClick() }}>{m.label}</button>
          ))}
        </div>
      )}
    </span>
  )
}

/** onClick이 없을 때 셸이 기본 동작을 붙여주는 액션 라벨 */
const EXCEL_LABELS = ['Excel', '엑셀']
const PRINT_LABELS = ['인쇄', '출력']
/**
 * 원본 [미리보기] — 인쇄와 <b>같은 종이</b>를 띄우되 인쇄 대화상자는 안 띄운다.
 * 무엇이 나오는지 보려고 [인쇄]를 누르면 대화상자부터 떠서 <b>취소를 먼저</b> 눌러야 했다.
 */
const PREVIEW_LABELS = ['미리보기']

const CONDS = '.ec-cond, .ec-search-conds'
/** 조건 판 안에서 화면이 둔 [검색(F8)] · [다시작성] 단추를 알아보는 글자 */
const SEARCH_RE = /^검색(\(F8\))?$/
const RESET_RE = /^다시\s?작성$/
const condsOf = (root: HTMLElement | null) =>
  [...(root?.querySelectorAll<HTMLElement>(CONDS) ?? [])].find((el) => !el.closest('[role="dialog"]')) ?? null
const condButton = (root: HTMLElement | null, re: RegExp) =>
  [...(condsOf(root)?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => re.test(b.textContent?.trim() ?? '')) ?? null
const isCheck = (f: Element) => f instanceof HTMLInputElement && (f.type === 'checkbox' || f.type === 'radio')
/** ▾ 에 둘 기간 — 판 안의 빠른선택 단추 글자, 없으면 날짜칸이 둘 이상일 때 조회 화면 묶음(INQUIRY_PICKS) */
function pickLabels(el: HTMLElement): string[] {
  const own = [...el.querySelectorAll('.ec-btn-pick')].map((b) => b.textContent?.trim() ?? '').filter(Boolean)
  if (own.length) return own
  return el.querySelectorAll('input[type="date"]').length >= 2 ? [...INQUIRY_PICKS] : []
}
/**
 * 떠 있는 조건 판에서는 셸의 줄이 [검색(F8)│▾] [다시작성] 을 맡는다 — 화면이 판 안에 둔 같은 단추(와 빠른선택 줄)는
 * 겹치므로 감춘다(index.css <code>[data-shell-dup]</code>). 그 단추만 든 줄(li)이면 줄째 감춘다.
 */
function markOwnButtons(el: HTMLElement) {
  const own = (b: Element) => b.classList.contains('ec-btn-pick') || SEARCH_RE.test(b.textContent?.trim() ?? '') || RESET_RE.test(b.textContent?.trim() ?? '')
  for (const b of el.querySelectorAll('button')) {
    if (!own(b)) continue
    const li = b.closest('li')
    const box = li && el.contains(li) && [...li.querySelectorAll('button')].every(own) && !li.querySelector('input, select') ? li : b
    box.setAttribute('data-shell-dup', '')
  }
}
/** React 가 듣는 칸에 값을 넣는다 — value 만 바꾸면 화면 상태가 안 바뀐다(네이티브 setter + input 이벤트). */
function setFieldValue(f: HTMLInputElement | HTMLSelectElement, v: string) {
  const proto = f instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(f, v)
  f.dispatchEvent(new Event(f instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
/** [다시작성] 기본 동작 — 판의 칸을 처음 본 값으로. 체크 · 라디오는 눌러서 바꾼다(React 는 click 으로 듣는다). */
function restoreFields(el: HTMLElement, first: WeakMap<Element, string | boolean>) {
  for (const f of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) {
    if (!first.has(f)) continue
    const v = first.get(f)!
    if (isCheck(f)) {
      const c = f as HTMLInputElement
      // 라디오는 처음 켜져 있던 것을 다시 누르면 같은 묶음의 나머지가 꺼진다
      if (c.type === 'radio' ? (v === true && !c.checked) : c.checked !== v) c.click()
    }
    else if (f.value !== v) setFieldValue(f, v as string)
  }
}

/** 이카운트 목록 화면 쉘: ☆제목 + 우측 검색툴바 + 본문 + 하단 액션툴바 */
export default function EcListShell({
  title, search, onSearchChange, onSearch, newLabel = '신규(F2)', onNew,
  renderForm, formTitle, formWidth, actions = [], help, searchable = true, option = true,
  signLine = false, searchBtn = false, collapseConditions, onReset, optionMenu, formMenu, headExtra, children,
}: {
  title: string
  /** 머리 검색칸 왼쪽에 붙는 것 — 원본 품목 · 거래처리스트의 [사용중단포함] 단추 자리. */
  headExtra?: ReactNode
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
  /**
   * 출력물에 <b>결재란</b>을 찍을지. 원본 [결재방표시] 조건이 이것을 <b>켠다</b>.
   * 끄면 결재란을 <b>가져오지도 않는다</b> — 안 찍을 것을 부르면 인쇄가 그만큼 늦어진다.
   *
   * <p><b>기본값은 꺼짐이다.</b> 원본 [결재방표시]가 25개 화면에서 전부 꺼짐으로 시작한다
   * (qa/fixtures/ecount-checkbox-default.json). 예전에는 이 기본값이 <b>켜짐</b>이라,
   * 조건을 안 단 목록 화면 전부가 <b>묻지도 않고 결재란을 찍고 있었다</b> — 조건이 없으니
   * 끌 방법도 없었다. 화면에 조건을 다는 것보다 이 한 줄이 먼저다.
   */
  signLine?: boolean
  /** 검색칸 없이 펼친 조건 판으로 시작하되 머리에 처음부터 [Search(F3)] 단추가 있는 화면(원본 거래이력조회(회계) E010712, 2026-10-22 실측). */
  searchBtn?: boolean
  /**
   * 조회 조건을 접어 두고 [Search(F3)] 로 펼친다. 조건은 화면 안의 <code>.ec-cond</code> 나
   * <code>.ec-search-conds</code> 를 그대로 쓴다(화면은 고칠 것이 없다).
   * 기본값은 원본 규칙(2026-10-13 판매조회 · 사원리스트 · 채권거래내역 · A/S수리현황 실측, plans/공용.md 규칙 3):
   * <ul>
   *   <li>머리에 빠른 검색칸이 있는 화면(<code>searchable</code>) — 접혀서 시작한다.</li>
   *   <li>없는 화면(현황 · 내역) — 펼쳐서 시작하고, 조건 판의 [검색(F8)] 을 누르면 접히며 머리에 [Search(F3)] 가 생긴다.</li>
   * </ul>
   * 값을 주면 그 값이 이긴다(<code>collapseConditions={rows !== null}</code> 처럼 화면이 직접 정하던 곳).
   */
  collapseConditions?: boolean
  /**
   * 조건 판 [다시작성] — 조건을 처음 값으로 되돌린다. 주지 않으면 조건 판 안의 화면 [다시작성] 단추를 누르고,
   * 그것도 없으면 셸이 판의 칸(입력 · 선택 · 체크)을 처음 보았을 때의 값으로 되돌린다.
   */
  onReset?: () => void
  /**
   * [Option] 을 눌렀을 때 뜨는 줄. 주지 않으면 공용 셋(Excel 내려받기 · 인쇄 · 검색조건 초기화).
   * 원본이 화면마다 다른 것을 띄우는 곳만 준다(지출증빙현황 E030402 — '계정설정' 하나, 2026-10-20 실측).
   */
  optionMenu?: { label: string; onClick: () => void }[]
  /**
   * 조건 판 아래 줄 맨 앞의 [양식 ⌄](원본 이익관리 · 현황 화면 2026-10-22 실측: ✓ 지금 양식 · 기본(수정불가)(빨간 글자) · 신규양식추가).
   * 양식 디자이너는 두지 않아 고르기만 하고 안내한다.
   */
  formMenu?: { current: string }
  children: ReactNode
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [localSearch, setLocalSearch] = useState('')
  const [optionOpen, setOptionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)   // 휴대폰: 하단 버튼줄 펼침(⌄)
  const [headMore, setHeadMore] = useState(false)   // 휴대폰: 머리 도구 펼침(⌄) — 제목 · 도움말
  // 조건 판 — 원본 규칙(plans/공용.md 규칙 3 · 4). 판이 있는지는 그려진 뒤에야 안다.
  const [hasConds, setHasConds] = useState(false)
  const [searched, setSearched] = useState(false)   // 검색칸 없는 화면: 조건 판 [검색(F8)] 을 한 번 눌렀다
  const collapse = collapseConditions ?? (hasConds && (searchable || searched))
  // 검색칸 없는 화면도 접힌 뒤에는 머리에 [Search(F3)] 가 생긴다(원본 A/S수리현황)
  const showSearch = searchable || (collapseConditions === undefined && searched)
  // 검색칸 없이 접혀서 시작하는 화면(searchable={false} · collapseConditions): 머리에 [Search(F3)] 단추만 — 판을 편다
  // (원본 일용근로 사원별급여조회 E020135, 2026-10-20 실측: 머리 Search(F3) · Option · 도움말, 입력칸 없음)
  const searchButtonOnly = !showSearch && !searchable && (collapseConditions === true || searchBtn)
  const [condOpen, setCondOpen] = useState(false)
  const [barTop, setBarTop] = useState<number | null>(null)
  const [picks, setPicks] = useState<string[]>([])   // ▾ 기간 빠른선택 — 판 안의 .ec-btn-pick, 없으면 날짜칸 둘에 INQUIRY_PICKS
  const [picksOpen, setPicksOpen] = useState(false)
  const firstValues = useRef(new WeakMap<Element, string | boolean>())
  useLayoutEffect(() => {
    const el = condsOf(bodyRef.current)
    if (Boolean(el) !== hasConds) setHasConds(Boolean(el))
    if (!el) return
    // [다시작성] 이 되돌릴 '처음 값' — 칸을 처음 본 때의 값(화면이 나중에 그리는 칸도 처음 본 때)
    for (const f of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) {
      if (!firstValues.current.has(f)) firstValues.current.set(f, isCheck(f) ? (f as HTMLInputElement).checked : f.value)
    }
    // 펼친 조건 판 바로 아래에 [검색(F8)] 줄을 붙인다 — 판 높이는 화면마다 달라 그려진 뒤 잰다
    const top = condOpen ? el.offsetTop + el.offsetHeight : null
    if (top !== barTop) setBarTop(top)
    if (condOpen) {
      markOwnButtons(el)
      const labels = pickLabels(el)
      if (labels.join('|') !== picks.join('|')) setPicks(labels)
    }
  })
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch
  const footerSearchRef = useRef<(() => void) | undefined>(undefined)

  /** 조건 판 [검색(F8)] — 화면이 판 안에 둔 [검색] 단추가 있으면 그것(그 화면의 조건으로 찾는다), 없으면 onSearch. */
  const searchConds = () => {
    const own = condButton(bodyRef.current, SEARCH_RE)
    if (own) own.click()
    else if (onSearchRef.current) onSearchRef.current()
    else footerSearchRef.current?.()
    setCondOpen(false)
    setPicksOpen(false)
  }
  const resetConds = () => {
    if (onReset) { onReset(); return }
    const own = condButton(bodyRef.current, RESET_RE)
    if (own) { own.click(); return }
    const el = condsOf(bodyRef.current)
    if (el) restoreFields(el, firstValues.current)
  }
  /** ▾ 기간 빠른선택 — 고르면 기간을 넣고 바로 찾는다(원본). */
  const pickPeriod = (label: string) => {
    const el = condsOf(bodyRef.current)
    if (!el) return
    const own = [...el.querySelectorAll<HTMLButtonElement>('.ec-btn-pick')].find((b) => b.textContent?.trim() === label)
    if (own) own.click()
    else {
      const dates = el.querySelectorAll<HTMLInputElement>('input[type="date"]')
      const endNow = dates[1]?.value
      const r = periodOf(label, new Date(), undefined, endNow ? { from: dates[0]?.value ?? endNow, to: endNow } : undefined)
      if (r && dates.length >= 2) {
        if (r.from) setFieldValue(dates[0], r.from)
        setFieldValue(dates[1], r.to)
      }
    }
    setPicksOpen(false)
    // 화면 상태가 새 기간으로 다시 그려진 다음에 찾는다 — 같은 틱이면 옛 기간으로 찾는다
    window.setTimeout(searchConds, 0)
  }

  // 페이지가 검색을 직접 처리하지 않으면 셸이 렌더된 행을 필터링한다
  const searchHandledByPage = typeof onSearch === 'function'
  // 낱말을 화면이 들고 있지 않으면(onSearchChange 없음) 셸이 들고 행을 추린다 — 전에는 칸에 글자가 안 들어갔다
  const keywordLocal = !onSearchChange
  const searchValue = keywordLocal ? localSearch : (search ?? '')

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
    return printTable(t, title, signLine ? await defaultSignLine() : null, win)
  })

  const doPreview = withTable(async (t) => {
    const win = openPrintWindow()
    if (!win) return true
    return printTable(t, title, signLine ? await defaultSignLine() : null, win, false)
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
    // 원본: 검색창이 비어 있으면 [Search(F3)] 는 조회 조건 판을 펼친다(닫는다)
    if (collapse && !searchValue.trim()) { setCondOpen((v) => !v); setPicksOpen(false); return }
    if (keywordLocal && localSearch.trim()) filterRows(localSearch)
    else if (searchHandledByPage) onSearch!()
    else filterRows(localSearch)
  }

  const changeSearch = (v: string) => {
    if (keywordLocal) setLocalSearch(v)
    else onSearchChange!(v)
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
    // 검색칸 없는 화면: 하단 [검색(F8)] 도 조건 판을 접는다(원본 A/S수리현황 — 판 아래 줄이든 하단이든 같은 검색)
    if (handler && SEARCH_RE.test(a.label.trim())) {
      const run = handler
      handler = () => { run(); if (collapseConditions === undefined && hasConds && !searchable) setSearched(true); setCondOpen(false) }
    }
    // 고른 줄이 없으면 잠그지 않고 원본 알림을 띄운다(BottomAction.selected) — 우클릭 메뉴도 같은 동작
    if (a.selected === 0) handler = () => { void ecAlert(NO_SELECTION_MESSAGE) }
    return { ...a, onClick: handler }
  })
  footerSearchRef.current = resolved.find((a) => SEARCH_RE.test(a.label.trim()))?.onClick

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
    // 조건 판이 보이면 그 판의 [검색(F8)] 이 먼저다(원본 — 판 안의 칸에서 F8)
    F8: condOpen ? searchConds
      : (!collapse && condButton(bodyRef.current, SEARCH_RE)) ? () => condButton(bodyRef.current, SEARCH_RE)?.click()
      : (resolved.find((a) => a.label.includes('F8') && a.onClick)
        ?? resolved.find((a) => a.primary && a.onClick))?.onClick,
    // 신규 — 하단 좌측 버튼(모달 폼이 있으면 그걸 연다)
    F2: (onNew || renderForm) ? () => (renderForm ? setFormOpen(true) : onNew?.()) : undefined,
    // Search — 목록 낱말 추리기. 검색상자를 숨긴 화면(searchable={false})에는 없다.
    F3: showSearch || searchButtonOnly ? runSearch : undefined,
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
    // 원본: 하단 버튼줄은 격자(본문) 바로 다음에 흐르고, 자료가 창보다 길 때만 창 바닥에 붙는다(.ec-footer sticky —
    // 지금은 틀(.ec-frame)이 아니라 창이 스크롤돼 고정이 안 걸린다, plans/공용.md 남은 것).
    // 틀 높이를 채우지 않는다 — min-h-100% 로 채우면 짧은 목록에서도 버튼줄이 틀 바닥으로 밀려났다(2026-10-13 6개 화면 실측).
    <div className="ec-list-shell flex flex-col">
      {/* 상단: ★제목 + 검색 (styles/shell.css .ec-page-head) */}
      <div className={`ec-page-head${headMore ? ' more' : ''}`}>
        {/* 원본 휴대폰 목록 화면은 제목을 감추고 검색 도구만 남긴다 */}
        <span className="ec-page-title m-hide">{title}</span>
        <div className="tools relative">
          {headExtra}
          {showSearch && <>
            <input
              className="ec-input ec-quick"
              placeholder="입력 후 [Enter]"
              value={searchValue}
              onChange={(e) => changeSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
            />
            <button className="ec-btn ec-btn-primary" onClick={runSearch}>Search(F3)</button>
          </>}
          {searchButtonOnly && <button className="ec-btn ec-btn-primary" onClick={runSearch}>Search(F3)</button>}
          {option && <button className="ec-btn" onClick={() => setOptionOpen((v) => !v)}>Option</button>}
          <button className="ec-btn m-hide" onClick={() => setHelpOpen(true)}>도움말</button>
          {/* 휴대폰: 한 줄에 못 둔 머리 도구(제목 · 도움말)는 ⌄ 로 펼친다(원본 btn-toolbar-more) */}
          <button className="ec-btn ec-more" aria-label="도구 더 보기" onClick={() => setHeadMore((v) => !v)}>{headMore ? '⌃' : '⌄'}</button>

          {optionOpen && (
            <>
              <div className="ec-backdrop-clear" onClick={() => setOptionOpen(false)} />
              <div className="ec-menu">
                {(optionMenu?.map((m) => ({ label: m.label, run: async () => m.onClick() })) ?? [
                  { label: 'Excel 내려받기', run: doExcel },
                  { label: '인쇄', run: doPrint },
                  { label: '검색조건 초기화', run: async () => { setLocalSearch(''); filterRows('') } },
                ]).map((m) => (
                  <button key={m.label} onClick={() => { setOptionOpen(false); void m.run() }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {notice && <div className="ec-notice">{notice}</div>}

      {/* 그리드 본문 */}
      <div ref={bodyRef} data-conds={collapse ? (condOpen ? 'open' : 'closed') : undefined}
           className={`flex-1 min-h-0 ec-list-body${collapse ? (condOpen ? ' conds-open' : ' conds-closed') : ''}`}
           onKeyDown={(e) => { if (e.key === 'Escape' && condOpen) setCondOpen(false) }}
           onClick={(e) => {
             // 검색칸 없는 화면: 펼쳐 둔 조건 판의 [검색(F8)] 을 누르면(화면이 먼저 찾고) 판이 접힌다
             if (collapseConditions !== undefined || searchable || searched || condOpen) return
             const b = (e.target as HTMLElement).closest('button')
             if (b && b.closest(CONDS) && SEARCH_RE.test(b.textContent?.trim() ?? '')) setSearched(true)
           }}>
        {children}
        {/* 원본 조건 판 아래 줄: [검색(F8)│▾ 기간 빠른선택] [다시작성] — [닫기] 는 없다(Search(F3) · Esc 로 닫는다) */}
        {condOpen && barTop !== null && (
          <div className="ec-search-bar" style={{ top: barTop }}>
            {formMenu && <FormPill current={formMenu.current} />}
            <span className="ec-btn-group relative">
              <button className="ec-btn ec-btn-primary ec-btn-sm" onClick={searchConds}>검색(F8)</button>
              {picks.length > 0 && (
                <button className="ec-btn ec-btn-primary ec-btn-sm ec-btn-arrow" aria-label="기간 빠른선택"
                        onClick={() => setPicksOpen((v) => !v)}>▾</button>
              )}
              {picksOpen && (
                <div className="ec-menu ec-search-picks">
                  {picks.map((l) => <button key={l} type="button" onClick={() => pickPeriod(l)}>{l}</button>)}
                </div>
              )}
            </span>
            <button className="ec-btn ec-btn-sm" onClick={resetConds}>다시작성</button>
          </div>
        )}
      </div>

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

      {/* 하단 버튼줄 — 원본처럼 격자 바로 아래. 버튼이 하나도 없으면 빈 띠로 보이므로 아예 그리지 않는다. */}
      <div ref={toolbarRef} className={`ec-footer${moreOpen ? ' open' : ''}`} style={hasBottom ? undefined : { display: 'none' }}>
        <div className="ec-footer-btns">
        {formMenu && !collapse && <FormPill current={formMenu.current} up />}
        {(onNew || renderForm) && (
          <button
            className="ec-btn ec-btn-primary"
            onClick={() => (renderForm ? setFormOpen(true) : onNew?.())}
          >
            {newLabel}
          </button>
        )}
        {resolved.map((a, i) => <FooterButton key={i} a={a} />)}
        </div>
        {/* 휴대폰: 한 줄에 다 안 들어가는 버튼은 ⌄ 로 펼친다(원본) */}
        <button className="ec-btn ec-more" aria-label="버튼 더 보기" onClick={() => setMoreOpen((v) => !v)}>{moreOpen ? '⌃' : '⌄'}</button>
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

      <Modal open={helpOpen} title={`${title} · 도움말`} width={420} onClose={() => setHelpOpen(false)}>
        <div className="leading-[1.7]">
          {help ?? (
            <ul className="pl-[16px] m-0">
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
      </Modal>
    </div>
  )
}
