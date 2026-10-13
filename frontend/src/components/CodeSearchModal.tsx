import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Modal from './Modal'
import type { CodeItem } from './CodePickerField'

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

/** 열을 안 넘긴 화면의 기본 열 — 찾는 이름(alias)이 있으면 거래처검색 꼴, 덧붙임(sub)이 있으면 셋째 열, 아니면 사원검색 꼴. */
export function defaultCodeColumns(label: string, items: CodeItem[]): CodeColumn[] {
  const code: CodeColumn = { head: `${label}코드`, cell: (i) => i.code ?? '', link: true }
  const name: CodeColumn = { head: `${label}명`, cell: (i) => i.name, link: true }
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
  multiple, picked = [], onToggle, onClearAll, onApply, initialQuery = '', onNew, plain,
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
}) {
  const [q, setQ] = useState(initialQuery)
  const [withStopped, setWithStopped] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) setQ(initialQuery) }, [open, initialQuery])

  const cols = columns ?? defaultCodeColumns(label, items)
  const route = registerRouteOf(label)
  // 사원검색은 사용중단이 없는 꼴 — [사용중단포함] · [Option] 이 없다
  const bare = plain ?? route === '/hr/employees'
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((i) => (withStopped || !i.stopped) && (!needle ||
      `${i.code ?? ''} ${i.name} ${i.sub ?? ''} ${i.alias ?? ''} ${i.extra ?? ''}`.toLowerCase().includes(needle)))
  }, [items, q, withStopped])

  const runNew = () => {
    if (onNew) { onNew(); return }
    if (route) window.open(route, '_blank', 'width=960,height=700')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); runNew() }
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'F8' && multiple) { e.preventDefault(); onApply?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const span = cols.length + (multiple ? 1 : 0)
  return (
    <Modal open={open} title={title ?? `${label}검색`} width={960} onClose={onClose}>
      <div className="flex justify-end items-center gap-[5px] mb-[9px]">
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
        {!bare && <button type="button" className="ec-btn" title="표시 항목 설정">Option</button>}
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full text-left ec-head700">
          <colgroup>
            {multiple && <col width={34} />}
            {cols.map((c, n) => <col key={n} width={c.width} />)}
          </colgroup>
          <thead><tr>
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
            ) : shown.map((i) => {
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
        <button type="button" className="ec-btn" onClick={runNew} title={route || onNew ? undefined : '등록 화면이 없는 대상입니다'}>신규(F2)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        {multiple && picked.length > 0 && (
          <span className="ml-auto text-[12px] text-ec-label">선택 <b className="text-ec-blue">{picked.length}</b>건</span>
        )}
      </div>
    </Modal>
  )
}
