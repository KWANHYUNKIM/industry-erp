import { useState, type ReactNode } from 'react'

/**
 * 원본 Self-Customizing 설정 화면(기능설정 C000113 · 기본값설정 C001124)의 틀.
 *
 * <p>★제목 + [입력 후 Enter] 찾기 · 알약(모듈) · [전체접기] · '○○ 설정' 판(윗선 0.5px 파랑 · 머리 h34)
 * 안에 ▼묶음 · [이름(링크) | 값] 줄(h28 · 이름 칸 209)을 늘어놓는다. 이름을 누르면 화면이 그 묶음의
 * 팝업을 띄운다(onEdit). 누를 수 없는 줄(고정값)은 이름만 같은 색으로 보인다.
 */
export interface SheetRow { label: string; value: ReactNode; editable?: boolean }
export interface SheetGroup { title: string; rows: SheetRow[] }
export interface SheetSection { title: string; groups: SheetGroup[] }

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

  const sections = sheet[tab]
  const keys = sections.flatMap((s) => [s.title, ...s.groups.map((g) => `${s.title}/${g.title}`)])
  const allFolded = keys.length > 0 && keys.every((k) => folded.has(k))
  const flip = (k: string) => setFolded((f) => { const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const match = (r: SheetRow) => !query || r.label.includes(query)

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="ec-page-head">
        <h1 className="ec-page-title off">{title}</h1>
        <div className="tools">
          <input className="ec-input w-[150px]" placeholder="입력 후 [Enter]" value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setQuery(find.trim()) }} />
        </div>
      </div>

      {children}

      <div className="ec-pills mb-[6px]">
        {tabs.map((t) => (
          <button key={t} className={`ec-pill${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
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
              <span className="text-[9px]">{folded.has(s.title) ? '▶' : '▼'}</span>{s.title}
            </button>
            {!folded.has(s.title) && (
              <div className="py-[18px] px-[9px]">
                {s.groups.filter((g) => g.rows.some(match)).map((g) => {
                  const k = `${s.title}/${g.title}`
                  return (
                    <div key={g.title} className="mb-[28px] last:mb-0">
                      <button className="flex items-center gap-[4px] h-[22px] mb-[5px] text-ec-ink" onClick={() => flip(k)}>
                        <span className="text-[9px]">{folded.has(k) ? '▶' : '▼'}</span>{g.title}
                      </button>
                      {!folded.has(k) && g.rows.filter(match).map((r) => (
                        <div key={r.label} className="flex items-center min-h-[28px] pl-[204px] mobile:pl-[20px] hover:bg-ec-row-hover">
                          <span className="w-[209px] shrink-0 mobile:w-[140px]">
                            {r.editable && onEdit
                              ? <button className="text-ec-navy hover:underline" onClick={() => onEdit(g)}>{r.label}</button>
                              : <span className="text-ec-navy" title="우리 ERP 에서는 고정값입니다.">{r.label}</span>}
                          </span>
                          <span>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
    </div>
  )
}
