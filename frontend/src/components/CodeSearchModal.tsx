import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Modal from './Modal'
import type { CodeItem } from './CodePickerField'
import { api } from '../api/client'

/**
 * 코드도움 창 — 원본 '거래처검색' · '창고검색' · '사원검색' 의 꼴(2026-10-13 loginaa 구매입력에서 실측, plans/공용.md).
 *
 * - 창 960. 머리 줄 [사용중단포함] · 빠른 검색칸('입력 후 [Enter]') · [Search(F3)] · [Option] —
 *   사원검색처럼 사용중단이 없는 대상은 [사용중단포함] · [Option] 이 없다(`plain`).
 * - 격자 열은 대상마다 다르다: 거래처 [거래처코드 155][거래처명 513][검색창내용 186][상세내역 77],
 *   창고 [구분 235][창고코드 235][창고명 470], 사원 [사원코드 466][사원명 466]. 화면이 `columns` 로 넘기고,
 *   안 넘기면 {@link defaultCodeColumns} 가 항목 모양을 보고 고른다. 머리 굵기 700, 코드 · 이름은 링크 글자색.
 * - 하단 [신규(F2)] [닫기]. [신규(F2)] 는 그 대상의 등록 화면을 새 창으로 연다(`onNew` 가 있으면 그것, 없으면 이름으로 짐작,
 *   짐작도 안 되면 모양만).
 * - 한 쪽 50줄 — 넘치면 머리 줄 왼쪽에 쪽번호(원본 품목검색 2026-10-14 실측: 50줄 · 격자 위 왼쪽).
 * - 머리 높이 34.8 — 원본 머리 칸에는 정렬 ▾(14px)가 들어 있어 보통 격자 머리(33.8)보다 1 높다.
 * - [Option] 은 원본처럼 [검색항목설정] [양식설정 ›] [조건양식설정] 판을 연다(모양만 — 우리는 양식을 저장하지 않는다).
 */
export interface CodeColumn {
  head: string
  width?: number
  cell: (i: CodeItem) => ReactNode
  /** 코드 · 이름처럼 링크 글자색으로 그리는 칸 */
  link?: boolean
}

/** 이름(label)으로 짐작하는 등록 화면 — 원본 코드도움 [신규(F2)] 가 여는 그 대상의 등록 창. */
const REGISTER: [RegExp, string][] = [
  [/거래처|납품처|구매처|매출처|매입처|외주처|고객/, '/sales/partners'],
  [/품목|제품|자재|원재료|부품/, '/inventory/items'],
  [/창고|공장|공정/, '/inventory/warehouses'],
  [/사원|담당|직원/, '/hr/employees'],
  [/계정/, '/accounting/accounts'],
  [/프로젝트/, '/inventory/projects'],
  [/부서/, '/hr/departments'],
]
export function registerRouteOf(label: string): string | null {
  return REGISTER.find(([re]) => re.test(label))?.[1] ?? null
}

/** 한 쪽 줄 수 — 원본 코드도움 창(품목검색 실측 50줄). */
const PAGE_SIZE = 50

/**
 * 창고 [구분](창고 · 공장 · 외주 …) — 화면마다 창고 목록을 넘기는 꼴이 제각각이라(id · 이름 · location …)
 * 창이 한 번 받아 둔다. 열쇠는 id · 코드 · 이름.
 */
let warehouseKinds: Promise<Map<string, string>> | null = null
function loadWarehouseKinds() {
  warehouseKinds ??= api.get<{ id: number; code?: string | null; name: string; kind?: string | null }[]>('/warehouses')
    .then((r) => {
      const m = new Map<string, string>()
      for (const w of r.data) {
        if (!w.kind) continue
        m.set(`id:${w.id}`, w.kind); m.set(`name:${w.name}`, w.kind)
        if (w.code) m.set(`code:${w.code}`, w.kind)
      }
      return m
    })
    .catch(() => { warehouseKinds = null; return new Map<string, string>() })
  return warehouseKinds
}
const kindOf = (kinds: Map<string, string> | undefined, i: CodeItem) =>
  kinds?.get(`id:${i.value}`) ?? (i.code ? kinds?.get(`code:${i.code}`) : undefined) ?? kinds?.get(`name:${i.name}`) ?? ''

/**
 * 열을 안 넘긴 화면의 기본 열 — 창고면 창고검색 꼴([구분][창고코드][창고명]), 품목이면 품목검색 꼴, 찾는 이름(alias)이 있으면 거래처검색 꼴,
 * 덧붙임(sub)이 있으면 셋째 열, 아니면 사원검색 꼴.
 */
export function defaultCodeColumns(label: string, items: CodeItem[], kinds?: Map<string, string>): CodeColumn[] {
  const code: CodeColumn = { head: `${label}코드`, cell: (i) => i.code ?? '', link: true }
  const name: CodeColumn = { head: `${label}명`, cell: (i) => i.name, link: true }
  if (/창고/.test(label)) {
    return [{ head: '구분', width: 235, cell: (i) => kindOf(kinds, i) }, { ...code, width: 235 }, { ...name, width: 470 }]
  }
  // 품목검색(원본 2026-10-14 실측): [품목코드 175][품목명[규격] 486][검색창내용 177][규격그룹선택 45]
  if (registerRouteOf(label) === '/inventory/items') {
    return [
      { ...code, width: 175 },
      { head: `${label}명[규격]`, width: 486, cell: (i) => (i.sub ? `${i.name} [${i.sub}]` : i.name), link: true },
      { head: '검색창내용', width: 177, cell: (i) => i.alias ?? '' },
      { head: '규격그룹선택', width: 45, cell: () => '' },
    ]
  }
  if (items.some((i) => i.alias) || registerRouteOf(label) === '/sales/partners') {
    return [
      { ...code, width: 155 }, { ...name, width: 513 },
      { head: '검색창내용', width: 186, cell: (i) => i.alias ?? '' },
      { head: '상세내역', width: 77, cell: () => <span className="text-ec-navy">내역</span> },
    ]
  }
  // 사원검색은 [사원코드][사원명] 둘뿐이다(부서 같은 덧붙임을 안 보인다)
  if (items.some((i) => i.sub) && registerRouteOf(label) !== '/hr/employees') {
    return [{ ...code, width: 235 }, { ...name, width: 470 }, { head: '', width: 235, cell: (i) => i.sub ?? '' }]
  }
  return [{ ...code, width: 466 }, { ...name, width: 466 }]
}

export default function CodeSearchModal({
  open, label, title, items, columns, value, onPick, onClose, emptyLabel,
  multiple, picked = [], onToggle, onClearAll, onApply, initialQuery = '', onNew, plain, hideNew,
}: {
  open: boolean
  /** 대상 이름(거래처 · 창고 …). 창 제목 기본값은 `${label}검색`. */
  label: string
  title?: string
  items: CodeItem[]
  columns?: CodeColumn[]
  value?: string
  onPick: (item: CodeItem | null) => void
  onClose: () => void
  /** 맨 위 '(전체)' 지우기 줄의 글자. undefined · '' 면 줄이 없다. */
  emptyLabel?: string
  multiple?: boolean
  picked?: string[]
  onToggle?: (item: CodeItem) => void
  onClearAll?: () => void
  onApply?: () => void
  initialQuery?: string
  /** [신규(F2)] — 없으면 이름으로 등록 화면을 짐작해 새 창으로 연다. */
  onNew?: () => void
  /** 사원검색 꼴 — [사용중단포함] · [Option] 이 없다. */
  plain?: boolean
  /** [신규(F2)] 가 없는 창(거래처특별단가그룹수정의 단가그룹 코드도움 — 하단 [닫기] 하나, E040120 실측). */
  hideNew?: boolean
}) {
  const [q, setQ] = useState(initialQuery)
  const [withStopped, setWithStopped] = useState(false)
  const [page, setPage] = useState(1)
  const [optionOpen, setOptionOpen] = useState(false)
  const [kinds, setKinds] = useState<Map<string, string>>()
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) setQ(initialQuery) }, [open, initialQuery])
  const wantsKinds = open && !columns && /창고/.test(label)
  useEffect(() => {
    if (!wantsKinds) return
    let alive = true
    void loadWarehouseKinds().then((m) => { if (alive) setKinds(m) })
    return () => { alive = false }
  }, [wantsKinds])

  const cols = columns ?? defaultCodeColumns(label, items, kinds)
  const route = registerRouteOf(label)
  // 사원검색은 사용중단이 없는 꼴 — [사용중단포함] · [Option] 이 없다
  const bare = plain ?? route === '/hr/employees'
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((i) => (withStopped || !i.stopped) && (!needle ||
      `${i.code ?? ''} ${i.name} ${i.sub ?? ''} ${i.alias ?? ''} ${i.extra ?? ''}`.toLowerCase().includes(needle)))
  }, [items, q, withStopped])
  useEffect(() => { setPage(1) }, [q, withStopped, open])
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const rows = shown.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)

  const runNew = () => {
    if (onNew) { onNew(); return }
    if (route) window.open(route, '_blank', 'width=960,height=700')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2' && !hideNew) { e.preventDefault(); runNew() }
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'F8' && multiple) { e.preventDefault(); onApply?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const span = cols.length + (multiple ? 1 : 0)
  // #root 끝에 띄운다(격자 규칙이 `#root table` 이라 body 로는 못 뺀다) — 입력 격자 칸(🔍) 안에 그려지면 `.ec-grid-input tbody tr { height: 41px }` · `td { padding: 0 }` 같은
  // 바깥 격자 규칙이 창 안 격자에도 걸려 머리 41 · 줄 41 이 됐다(품목검색, 2026-10-14). React 이벤트는 그대로 부모로 간다.
  if (!open) return null
  return createPortal(
    <Modal open={open} title={title ?? `${label}검색`} width={960} onClose={onClose}>
      <div className="flex justify-end items-center gap-[5px] mb-[9px]">
        {pages > 1 && (
          <nav className="ec-paging mr-auto" aria-label="쪽">
            {cur > 1 && <button type="button" aria-label="처음" onClick={() => setPage(1)}>«</button>}
            {Array.from({ length: pages }, (_, n) => n + 1)
              .filter((n) => Math.floor((n - 1) / 10) === Math.floor((cur - 1) / 10))
              .map((n) => (
                <button key={n} type="button" className={n === cur ? 'active' : undefined}
                        aria-current={n === cur ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
              ))}
            {cur < pages && <button type="button" aria-label="끝" onClick={() => setPage(pages)}>»</button>}
          </nav>
        )}
        {!bare && (
          <button type="button" className={`ec-btn${withStopped ? ' ec-btn-primary' : ''}`} aria-pressed={withStopped}
                  onClick={() => setWithStopped((v) => !v)}>사용중단포함</button>
        )}
        <input
          ref={searchRef}
          className="ec-input w-[180px]"
          autoFocus
          value={q}
          aria-label={`${label} 검색어`}
          placeholder="입력 후 [Enter]"
          onChange={(e) => setQ(e.target.value)}
          // <form> 안에 놓이면 Enter 가 바깥 폼을 제출해 버린다 — 막는다
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!multiple && shown.length === 1) onPick(shown[0]) } }}
        />
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => searchRef.current?.focus()}>Search(F3)</button>
        {!bare && (
          <div className="relative">
            <button type="button" className="ec-btn" aria-expanded={optionOpen} onClick={() => setOptionOpen((v) => !v)}>Option</button>
            {optionOpen && <>
              <div className="ec-backdrop-clear" onClick={() => setOptionOpen(false)} />
              {/* 원본 판: 검색항목설정 · 양식설정(› 기본(수정불가) · 신규양식추가) · 조건양식설정 — 모양만 */}
              <div className="ec-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => setOptionOpen(false)}>검색항목설정</button>
                <button type="button" role="menuitem" onClick={() => setOptionOpen(false)}>양식설정 ›</button>
                <button type="button" role="menuitem" onClick={() => setOptionOpen(false)}>조건양식설정</button>
              </div>
            </>}
          </div>
        )}
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full text-left ec-head700">
          <colgroup>
            {multiple && <col width={34} />}
            {cols.map((c, n) => <col key={n} width={c.width} />)}
          </colgroup>
          <thead className="[&_th]:h-[var(--ec-th-h-sort)]"><tr>
            {multiple && <th></th>}
            {cols.map((c, n) => <th key={n}>{c.head}</th>)}
          </tr></thead>
          <tbody>
            {/* emptyLabel="" — 꼭 하나를 골라야 하는 칸(수집데이터등록 [수신문서])은 지우기 줄이 없다. */}
            {!multiple && !!emptyLabel && (
              <tr onClick={() => onPick(null)} className="cursor-pointer">
                <td colSpan={span} className="text-ec-hint">({emptyLabel})</td>
              </tr>
            )}
            {shown.length === 0 ? (
              <tr><td colSpan={span} className="ec-empty">조회 결과가 없습니다.</td></tr>
            ) : rows.map((i) => {
              const on = multiple ? picked.includes(i.value) : i.value === value
              return (
                <tr key={i.value} onClick={() => (multiple ? onToggle?.(i) : onPick(i))}
                    className={`cursor-pointer${on ? ' bg-[var(--ec-blue-light)]' : ''}`}>
                  {multiple && <td className="text-center"><input type="checkbox" readOnly checked={on} /></td>}
                  {cols.map((c, n) => <td key={n} className={c.link ? 'text-ec-navy' : undefined}>{c.cell(i)}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-[5px] mt-[9px]">
        {multiple && <>
          <button type="button" className="ec-btn ec-btn-primary" onClick={onApply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClearAll}>전체 해제</button>
        </>}
        {!hideNew && <button type="button" className="ec-btn" onClick={runNew} title={route || onNew ? undefined : '등록 화면이 없는 대상입니다'}>신규(F2)</button>}
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        {multiple && picked.length > 0 && (
          <span className="ml-auto text-[12px] text-ec-label">선택 <b className="text-ec-blue">{picked.length}</b>건</span>
        )}
      </div>
    </Modal>,
    document.getElementById('root') ?? document.body,
  )
}
