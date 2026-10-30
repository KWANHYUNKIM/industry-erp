import { useEffect, useState, type ReactNode } from 'react'
import Modal from './Modal'

/**
 * 원본 Self-Customizing 설정 화면(기능설정 C000113 · 기본값설정 C001124 · 보안설정 C001138)의 틀.
 *
 * <p>★제목 + [입력 후 Enter] 찾기 · [도움말] · 알약(모듈) · [전체접기] · '○○ 설정' 판(윗선 0.5px 파랑 · 머리 h34)
 * 안에 ▼묶음 · [이름(링크) | 값] 줄(h28 · 이름 칸 209)을 늘어놓는다.
 *
 * <p>클릭(2026-10-30 loginaa 다시 눌러 봄 — plans/데이터이관/클릭대조/click-orig-SC-기능설정.txt):
 * <ul>
 *   <li><b>모든 줄 이름이 창을 띄운다.</b> 창 제목은 묶음 이름이 아니라 원본 창 이름(국가 및 통화 · 부가세설정-재고 ·
 *       회계반영체크기본값 …) — 줄의 {@code popup} · 묶음의 {@code popup}. 바꿀 수 있는 줄은 화면이 띄우고(onEdit),
 *       우리에게 고정값인 줄은 이 틀이 같은 제목의 창을 읽기 전용으로 띄운다(⊙이름 · 원본 설명 · 막힌 칸 · [닫기]).
 *       예전에는 고정값 줄 이름이 눌리지 않았다.</li>
 *   <li>[입력 후 Enter] 는 줄을 거르지 않는다 — 판 · 묶음 · 줄 이름 중 낱말이 든 것을 차례로 주황 바탕으로 칠하고,
 *       Enter 를 누를 때마다 다음 것으로, 끝에서 처음으로 돈다(원본 text-warning-inverse). 접혀 있으면 편다.</li>
 *   <li>[도움말] — 원본은 메뉴별 도움말 창. 우리는 이 화면 쓰는 법.</li>
 * </ul>
 */
export interface SheetRow {
  label: string
  value: ReactNode
  editable?: boolean
  /** 이 줄을 누르면 뜨는 원본 창 제목(없으면 묶음의 popup · 묶음 이름) */
  popup?: string
  /** 창 안 ⊙이름 아래 설명(원본 글) */
  desc?: string
}
export interface SheetGroup {
  title: string
  rows: SheetRow[]
  popup?: string
  /** 원본 창이 누른 줄 하나만 보여 줄 때(단가(vat포함) — 영업관리 · 구매관리 창이 따로) */
  solo?: boolean
}
export interface SheetSection { title: string; groups: SheetGroup[] }

const popupOf = (g: SheetGroup, r: SheetRow) => r.popup ?? g.popup ?? g.title

export default function EcSettingSheet<T extends string>({ title, tabs, sheet, loading, onEdit, children }: {
  title: string
  tabs: readonly T[]
  sheet: Record<T, SheetSection[]>
  loading?: boolean
  onEdit?: (group: SheetGroup) => void
  /** 팝업 · 오류 줄처럼 틀 밖에 얹는 것 */
  children?: ReactNode
}) {
  const [tab, setTab] = useState<T>(tabs[0])
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [find, setFind] = useState('')
  const [query, setQuery] = useState('')
  const [hit, setHit] = useState(-1)
  const [fixed, setFixed] = useState<{ title: string; rows: SheetRow[] } | null>(null)
  const [help, setHelp] = useState(false)

  const sections = sheet[tab]
  const keys = sections.flatMap((s) => [s.title, ...s.groups.map((g) => `${s.title}/${g.title}`)])
  const allFolded = keys.length > 0 && keys.every((k) => folded.has(k))
  const flip = (k: string) => setFolded((f) => { const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k); return n })

  // 찾은 이름 — 화면에 그린 차례(판 → 묶음 → 줄). 키: 판 's:판' · 묶음 'g:판/묶음' · 줄 'r:판/묶음/이름'
  const found: { key: string; s: string; g?: string }[] = !query ? [] : sections.flatMap((s) => [
    ...(s.title.includes(query) ? [{ key: `s:${s.title}`, s: s.title }] : []),
    ...s.groups.flatMap((g) => [
      ...(g.title.includes(query) ? [{ key: `g:${s.title}/${g.title}`, s: s.title }] : []),
      ...g.rows.filter((r) => r.label.includes(query))
        .map((r) => ({ key: `r:${s.title}/${g.title}/${r.label}`, s: s.title, g: g.title })),
    ]),
  ])
  const cur = hit >= 0 && hit < found.length ? found[hit] : null
  const hitKey = cur?.key ?? ''
  const mark = (k: string) => (k === hitKey ? ' bg-[var(--ec-find-hit)] text-white rounded-[6px] px-[1.8px] py-[0.9px]' : '')

  function search() {
    const q = find.trim()
    if (q !== query) { setQuery(q); setHit(q ? 0 : -1); return }
    if (found.length > 0) setHit((h) => (h + 1) % found.length)
  }

  // 찾은 것이 접힌 판 · 묶음 안이면 펴고, 화면 안으로 굴린다
  useEffect(() => {
    if (!cur) return
    const { s, g } = cur
    setFolded((f) => {
      if (!f.has(s) && !(g && f.has(`${s}/${g}`))) return f
      const n = new Set(f); n.delete(s); if (g) n.delete(`${s}/${g}`); return n
    })
    requestAnimationFrame(() => document.querySelector('[data-find-hit]')?.scrollIntoView?.({ block: 'nearest' }))
  }, [hitKey])

  function open(g: SheetGroup, r: SheetRow) {
    if (r.editable && onEdit) { onEdit(g); return }
    const t = popupOf(g, r)
    setFixed({ title: t, rows: g.solo ? [r] : g.rows.filter((x) => !x.editable && popupOf(g, x) === t) })
  }

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="ec-page-head">
        <h1 className="ec-page-title off">{title}</h1>
        <div className="tools">
          <input className="ec-input w-[150px]" placeholder="입력 후 [Enter]" value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search() }} />
          <button className="ec-btn" onClick={() => setHelp(true)}>도움말</button>
        </div>
      </div>

      {children}

      <div className="ec-pills mb-[6px]">
        {tabs.map((t) => (
          <button key={t} className={`ec-pill${tab === t ? ' active' : ''}`} onClick={() => { setTab(t); setHit(query ? 0 : -1) }}>{t}</button>
        ))}
      </div>

      <div className="flex justify-end mb-[6px]">
        <button className="ec-btn ec-btn-sm" disabled={keys.length === 0}
          onClick={() => setFolded(allFolded ? new Set() : new Set(keys))}>{allFolded ? '전체펼치기' : '전체접기'}</button>
      </div>

      {loading ? <p className="ec-empty">불러오는 중…</p>
        : sections.length === 0 ? <p className="ec-empty">설정할 항목이 없습니다.</p>
        : sections.map((s) => (
          <div key={s.title} className="bg-ec-panel border-t-[0.5px] border-ec-blue mb-[10px]">
            <button className="flex items-center gap-[4px] w-full h-[34px] px-[9px] border-b-[0.5px] border-ec-line text-ec-text text-left"
              onClick={() => flip(s.title)}>
              <span className="text-[9px]">{folded.has(s.title) ? '▶' : '▼'}</span>
              <span className={mark(`s:${s.title}`)} data-find-hit={hitKey === `s:${s.title}` || undefined}>{s.title}</span>
            </button>
            {!folded.has(s.title) && (
              <div className="py-[18px] px-[9px]">
                {s.groups.map((g) => {
                  const k = `${s.title}/${g.title}`
                  return (
                    <div key={g.title} className="mb-[28px] last:mb-0">
                      <button className="flex items-center gap-[4px] h-[22px] mb-[5px] text-ec-ink" onClick={() => flip(k)}>
                        <span className="text-[9px]">{folded.has(k) ? '▶' : '▼'}</span>
                        <span className={mark(`g:${k}`)} data-find-hit={hitKey === `g:${k}` || undefined}>{g.title}</span>
                      </button>
                      {!folded.has(k) && g.rows.map((r) => {
                        const rk = `r:${k}/${r.label}`
                        return (
                          <div key={r.label} className="flex items-center min-h-[28px] pl-[204px] mobile:pl-[20px] hover:bg-ec-row-hover">
                            <span className="w-[209px] shrink-0 mobile:w-[140px]">
                              <button className={`text-ec-navy hover:underline${mark(rk)}`} data-find-hit={hitKey === rk || undefined}
                                onClick={() => open(g, r)}>{r.label}</button>
                            </span>
                            <span>{r.value}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}

      {fixed && (
        <Modal open title={fixed.title} onClose={() => setFixed(null)} width={960}>
          {fixed.rows.map((r) => (
            <div key={r.label} className="pb-[10px] mb-[10px]">
              <div className="mb-[2px]">⊙ {r.label}</div>
              {r.desc && <div className="pl-[13px] mb-[6px]">{r.desc}</div>}
              <div className="pl-[13px]">
                <input className="ec-input w-[260px]" disabled readOnly aria-label={r.label}
                  value={typeof r.value === 'string' ? r.value : ''} />
              </div>
            </div>
          ))}
          <p className="text-ec-hint mb-[8px]">우리 ERP 에서는 고정값이라 바꿀 수 없습니다.</p>
          <div className="ec-slip-footer">
            <button className="ec-btn" onClick={() => setFixed(null)}>닫기</button>
          </div>
        </Modal>
      )}

      <Modal open={help} title={`${title} · 도움말`} width={420} onClose={() => setHelp(false)}>
        <ul className="pl-[16px] m-0 leading-[1.7]">
          <li><b>알약</b> — 모듈(공통 · 회계 · 재고 …)마다 설정 판을 바꿔 봅니다.</li>
          <li><b>항목 이름</b> — 누르면 그 설정 창이 뜹니다. 고정값인 항목은 값만 보여 줍니다.</li>
          <li><b>입력 후 [Enter]</b> — 낱말이 든 이름을 주황으로 칠합니다. Enter 를 다시 누르면 다음 이름으로 갑니다.</li>
          <li><b>전체접기</b> — 판 · 묶음을 모두 접거나 폅니다. ▼ 이름을 누르면 그것만 접힙니다.</li>
        </ul>
      </Modal>
    </div>
  )
}
