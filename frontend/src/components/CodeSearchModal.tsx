import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Modal from './Modal'
import type { CodeItem } from './CodePickerField'
import { api } from '../api/client'
import { EcDateRange } from './ui/EcDateInput'

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
  // 원본 전표 [담당자] 코드도움의 [신규(F2)] 는 재고 I › 기초등록 › 사원(담당)등록을 연다(관리 사원등록과 다른 마스터)
  [/담당/, '/inventory/sales-reps'],
  [/사원|직원/, '/hr/employees'],
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

type CodeSearchProps = {
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
  /** 사원검색 꼴(인사발령입력 2026-10-22 실측) — [퇴사자포함] · Search(F3) 조건 판 · 체크칸 + 번호 · [적용(F8)] 여러 개 고름. */
  employeeSearch?: boolean
  onApplyMany?: (items: CodeItem[]) => void
}

/**
 * 창 안의 상태(검색칸 · 쪽 · [사용중단포함] · 조건 판 …)는 <b>열 때마다 새로</b> 시작한다 — 닫힌 동안에는 본문을 아예 안 그린다.
 * 예전에는 닫혀도 컴포넌트가 남아 지난번 검색칸 글자를 들고 있다가, 같은 줄을 다시 쓸 때(저장 뒤 다음 전표의 같은 줄 —
 * 입력 격자 줄은 key 가 줄 번호라 같은 칸이 그대로 남는다) 친 글자가 그 뒤에 붙었다: 2번째 전표 'C003C003',
 * 3번째 'C004C004C004' → '조회 결과가 없습니다'(2026-10-28 데이터이관 QA 38회, 구매입력 줄 품목). 원본은 늘 친 글자 그대로다.
 */
export default function CodeSearchModal(props: CodeSearchProps) {
  if (!props.open) return null
  return <CodeSearchBody {...props} />
}

function CodeSearchBody({
  open, label, title, items, columns, value, onPick, onClose, emptyLabel,
  multiple, picked = [], onToggle, onClearAll, onApply, initialQuery = '', onNew, plain, hideNew, employeeSearch, onApplyMany,
}: CodeSearchProps) {
  const [q, setQ] = useState(initialQuery)
  const [withStopped, setWithStopped] = useState(false)
  const [page, setPage] = useState(1)
  const [optionOpen, setOptionOpen] = useState(false)
  const [kinds, setKinds] = useState<Map<string, string>>()
  const searchRef = useRef<HTMLInputElement>(null)
  // 사원검색 조건 판 — [기본] 탭만 거른다(다른 탭의 칸은 모양만: 우리 사원 자료에 없는 값)
  const EMP_COND0 = { code: '', name: '', dept: '', project: '', hireOn: false, hireFrom: '', hireTo: '', resignOn: false, resignFrom: '', resignTo: '', status: '재직자' as '전체' | '재직자' | '퇴사자' }
  const [panel, setPanel] = useState(false)
  const [panelTab, setPanelTab] = useState('기본')
  const [draft, setDraft] = useState(EMP_COND0)
  const [cond, setCond] = useState<typeof EMP_COND0 | null>(null)
  const [many, setMany] = useState<string[]>([])
  // 열린 채로 화면이 검색어를 바꿔 넘기면 따라간다(처음 값은 위 useState 가 받는다)
  useEffect(() => { setQ(initialQuery) }, [initialQuery])
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
  const bare = !employeeSearch && (plain ?? route === '/hr/employees')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((i) => {
      if (employeeSearch && cond) {
        const c = cond
        if (c.status === '재직자' ? i.stopped : c.status === '퇴사자' ? !i.stopped : false) return false
        if (c.code && !(i.code ?? '').toLowerCase().includes(c.code.toLowerCase())) return false
        if (c.name && !i.name.includes(c.name)) return false
        if (c.dept && !(i.sub ?? '').includes(c.dept)) return false
        if (c.hireOn && ((c.hireFrom && (i.hireDate ?? '') < c.hireFrom) || (c.hireTo && (i.hireDate ?? '9999') > c.hireTo))) return false
        if (c.resignOn && ((c.resignFrom && (i.resignDate ?? '') < c.resignFrom) || (c.resignTo && (i.resignDate ?? '9999') > c.resignTo))) return false
      } else if (!withStopped && i.stopped) return false
      return !needle || `${i.code ?? ''} ${i.name} ${i.sub ?? ''} ${i.alias ?? ''} ${i.extra ?? ''}`.toLowerCase().includes(needle)
    })
  }, [items, q, withStopped, cond, employeeSearch])
  useEffect(() => { setPage(1) }, [q, withStopped, cond])
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const rows = shown.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)

  const runNew = () => {
    // 화면이 띄우는 등록 창(Modal)은 제자리에 그려지고 이 창은 body 끝에 붙어, 이 창을 둔 채 열면 등록 창이 뒤에 깔려
    // [신규(F2)] 가 아무 일도 안 하는 것처럼 보였다(2026-10-27 불량처리입력 불량유형). 이 창을 닫고 연다.
    if (onNew) { onClose(); onNew(); return }
    if (route) window.open(route, '_blank', 'width=960,height=700')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2' && !hideNew) { e.preventDefault(); runNew() }
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'F8' && multiple) { e.preventDefault(); onApply?.() }
      if (e.key === 'F8' && employeeSearch) { e.preventDefault(); if (panel) applyCond(); else applyMany() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const applyCond = () => { setCond(draft); setPanel(false) }
  const applyMany = () => { const its = items.filter((i) => many.includes(i.value)); if (its.length) onApplyMany?.(its); else onClose() }
  const span = cols.length + (multiple || employeeSearch ? 1 : 0)
  // #root 끝에 띄운다(격자 규칙이 `#root table` 이라 body 로는 못 뺀다) — 입력 격자 칸(🔍) 안에 그려지면 `.ec-grid-input tbody tr { height: 41px }` · `td { padding: 0 }` 같은
  // 바깥 격자 규칙이 창 안 격자에도 걸려 머리 41 · 줄 41 이 됐다(품목검색, 2026-10-14). React 이벤트는 그대로 부모로 간다.
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
        {!bare && !(employeeSearch && panel) && (
          <button type="button" className={`ec-btn${withStopped ? ' ec-btn-primary' : ''}`} aria-pressed={withStopped}
                  onClick={() => { setWithStopped((v) => !v); if (employeeSearch) setCond(null) }}>{employeeSearch ? '퇴사자포함' : '사용중단포함'}</button>
        )}
        {!(employeeSearch && panel) && <input
          ref={searchRef}
          className="ec-input w-[180px]"
          autoFocus
          value={q}
          aria-label={`${label} 검색어`}
          placeholder="입력 후 [Enter]"
          onChange={(e) => setQ(e.target.value)}
          // <form> 안에 놓이면 Enter 가 바깥 폼을 제출해 버린다 — 막는다
          // 걸린 것이 여럿이어도 코드가 친 글자와 똑같은 것이 하나면 그것을 고른다(코드칸 직접 입력과 같다 — 창고 '100' 이 1001 에도 걸려 첫 Enter 가 헛돌았다)
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (multiple || employeeSearch) return
            const low = q.trim().toLowerCase()
            const exact = low ? shown.filter((i) => (i.code ?? '').trim().toLowerCase() === low) : []
            if (exact.length === 1) onPick(exact[0])
            else if (shown.length === 1) onPick(shown[0])
          }}
        />}
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => { if (employeeSearch) { setPanel((v) => !v); return } searchRef.current?.focus() }}>Search(F3)</button>
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

      {employeeSearch && panel && (
        <div className="ec-cond mb-[9px]">
          <div className="ec-pills mb-[8px]">
            {['기본', '사원정보', '추가정보', '신상정보', '인사자료', '기타설정'].map((t) => (
              <button key={t} type="button" className={`ec-pill no-ec${panelTab === t ? ' active' : ''}`} onClick={() => setPanelTab(t)}>{t}</button>
            ))}
          </div>
          {panelTab === '기본' ? (
            <ul className="ec-form">
              {([['사원번호', 'code'], ['성명', 'name'], ['부서', 'dept'], ['프로젝트', 'project']] as const).map(([l, k]) => (
                <li key={k}><span className="title">{l}</span>
                  <div className="form"><input className="ec-input w-full" aria-label={l} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCond() } }} /></div></li>
              ))}
              {([['입사일자', 'hire'], ['퇴사일자', 'resign']] as const).map(([l, k]) => (
                <li key={k}><span className="title">{l}</span>
                  <div className="form flex items-center gap-[6px]">
                    {draft[`${k}On` as 'hireOn'] && <>
                      <EcDateRange from={{ className: "ec-input w-[130px]", 'aria-label': `${l} 시작`, value: draft[`${k}From` as 'hireFrom'], onChange: (e) => setDraft({ ...draft, [`${k}From`]: e.target.value }) }} to={{ className: "ec-input w-[130px]", 'aria-label': `${l} 끝`, value: draft[`${k}To` as 'hireTo'], onChange: (e) => setDraft({ ...draft, [`${k}To`]: e.target.value }) }} />
                    </>}
                    <label className="inline-flex items-center gap-[4px]"><input type="checkbox" checked={draft[`${k}On` as 'hireOn']} onChange={(e) => setDraft({ ...draft, [`${k}On`]: e.target.checked })} />사용</label>
                  </div></li>
              ))}
              <li><span className="title">재직구분</span>
                <div className="form flex items-center gap-[12px]">
                  {(['전체', '재직자', '퇴사자'] as const).map((v) => (
                    <label key={v} className="inline-flex items-center gap-[4px]"><input type="radio" name="emp-status" checked={draft.status === v} onChange={() => setDraft({ ...draft, status: v })} />{v}</label>
                  ))}
                </div></li>
            </ul>
          ) : (
            // 다른 탭의 칸은 원본 이름표만 — 우리 사원 자료에 없는 값이라 거르지 않는다(2026-10-22 실측: 사원정보 · 추가정보 · 기타설정)
            <ul className="ec-form">
              {(({
                '사원정보': ['사원번호', '성명', '생년월일', '부서', '프로젝트', '직위/직급', '직책', '전화', '모바일', 'Email', '입사구분', '퇴사사유', '적요'],
                '추가정보': ['숫자형식1', '코드형식1'],
                '기타설정': ['영문성명', '제2외국어성명', '주민등록번호', '주소', '급여통장(은행코드)'],
              } as Record<string, string[]>)[panelTab] ?? []).map((l) => (
                <li key={l}><span className="title">{l}</span><div className="form"><input className="ec-input w-full" aria-label={l} disabled={l === '주민등록번호'} /></div></li>
              ))}
            </ul>
          )}
          <div className="flex gap-[6px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={applyCond}>검색(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setDraft(EMP_COND0)}>다시 작성</button>
          </div>
        </div>
      )}

      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full text-left ec-head700">
          <colgroup>
            {(multiple || employeeSearch) && <col width={employeeSearch ? 52 : 34} />}
            {cols.map((c, n) => <col key={n} width={c.width} />)}
          </colgroup>
          <thead className="[&_th]:h-[var(--ec-th-h-sort)]"><tr>
            {(multiple || employeeSearch) && <th></th>}
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
            ) : rows.map((i, n) => {
              const on = employeeSearch ? many.includes(i.value) : multiple ? picked.includes(i.value) : i.value === value
              return (
                <tr key={i.value} onClick={() => (employeeSearch ? setMany(on ? many.filter((v) => v !== i.value) : [...many, i.value]) : multiple ? onToggle?.(i) : onPick(i))}
                    className={`cursor-pointer${on ? ' bg-[var(--ec-blue-light)]' : ''}`}>
                  {multiple && <td className="text-center"><input type="checkbox" readOnly checked={on} /></td>}
                  {employeeSearch && <td className="text-center whitespace-nowrap"><input type="checkbox" readOnly checked={on} /> {(cur - 1) * PAGE_SIZE + n + 1}</td>}
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
        {employeeSearch && <button type="button" className="ec-btn ec-btn-primary" onClick={applyMany}>적용(F8)</button>}
        {!hideNew && !employeeSearch && <button type="button" className="ec-btn" onClick={runNew} title={route || onNew ? undefined : '등록 화면이 없는 대상입니다'}>신규(F2)</button>}
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        {employeeSearch && <span className="ml-[8px] text-[12px] text-ec-label">키보드 활용 TIP <span className="text-ec-navy">상세보기</span></span>}
        {multiple && picked.length > 0 && (
          <span className="ml-auto text-[12px] text-ec-label">선택 <b className="text-ec-blue">{picked.length}</b>건</span>
        )}
      </div>
    </Modal>,
    document.getElementById('root') ?? document.body,
  )
}
