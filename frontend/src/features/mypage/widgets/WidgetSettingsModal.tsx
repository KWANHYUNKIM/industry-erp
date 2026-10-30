import { useEffect, useRef, useState } from 'react'
import Modal from '../../../components/Modal'
import { DEFAULT_ROWS, kindOf, ROW_CHOICES, visibleColumns } from './store'
import { type WidgetDef, type WidgetSettings } from './types'
import { EcDateRange } from '../../../components/ui/EcDateInput'

/**
 * 위젯 [설정] 창 — 원본 표 위젯 설정 창의 칸 차례(2026-10-30 실측):
 * 제목 · 종류 · 검색조건 · 기준일자 · 정렬기준(+ 오름/내림) · 적용양식 · 줄수 · 항목추가 → [저장(F8)] [닫기].
 * 칸은 위젯마다 원본에 있는 것만 보인다(def.fields).
 */
export default function WidgetSettingsModal({ def, value, onSave, onClose }: {
  def: WidgetDef
  value: WidgetSettings
  onSave: (s: WidgetSettings) => void
  onClose: () => void
}) {
  const f = def.fields ?? {}
  const cols = def.table?.columns ?? []
  const [s, setS] = useState<WidgetSettings>(() => ({
    ...value,
    columns: value.columns ?? visibleColumns(cols, value).map((c) => c.key),
  }))
  const set = (patch: Partial<WidgetSettings>) => setS((v) => ({ ...v, ...patch }))
  const period = s.period ?? f.defaultPeriod ?? '금월(~오늘)'
  const periods = f.periods ?? []
  const on = new Set(s.columns ?? [])
  const kind = kindOf(s, f)

  function save() {
    onSave({ ...s, title: s.title?.trim() || undefined })
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); saveRef.current() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Modal open title="위젯 설정" width={560} onClose={onClose}>
      <ul className="ec-form grid-cols-[minmax(0,1fr)]">
        <li>
          <div className="title">제목</div>
          <div className="form">
            <input className="ec-input w-full" value={s.title ?? def.settingTitle ?? def.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
        </li>
        {f.kinds && (
          <li>
            <div className="title">종류</div>
            <div className="form flex-wrap">
              {f.kindRadio ? f.kinds.map((k) => (
                <label key={k} className="ec-check">
                  <input type="radio" name="widget-kind" checked={kind === k} onChange={() => set({ kind: k })} />{k}
                </label>
              )) : (
                <select className="ec-input" value={kind} onChange={(e) => set({ kind: e.target.value })}>
                  {f.kinds.map((k) => <option key={k}>{k}</option>)}
                </select>
              )}
            </div>
          </li>
        )}
        {f.conditions && (
          <li>
            <div className="title">검색조건</div>
            <div className="form">
              <select className="ec-input" value={s.condition ?? ''} onChange={(e) => set({ condition: e.target.value || undefined })}>
                <option value="">=======</option>
                {f.conditions.map((c) => <option key={c}>{c}</option>)}
              </select>
              {s.condition && (
                <input className="ec-input flex-1" value={s.conditionValue ?? ''} placeholder={s.condition}
                  onChange={(e) => set({ conditionValue: e.target.value })} />
              )}
            </div>
          </li>
        )}
        {f.selects?.map((sel) => (
          <li key={sel.key}>
            <div className="title">{sel.label}</div>
            <div className="form">
              <select className="ec-input" value={s.extra?.[sel.key] ?? sel.def ?? sel.options[0]}
                onChange={(e) => set({ extra: { ...s.extra, [sel.key]: e.target.value } })}>
                {sel.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </li>
        ))}
        {periods.length > 0 && (
          <li>
            <div className="title">기준일자</div>
            <div className="form flex-wrap">
              <select className="ec-input" value={period} onChange={(e) => set({ period: e.target.value })}>
                {periods.map((p) => <option key={p}>{p}</option>)}
              </select>
              {period === '직접설정' && (
                <>
                  <EcDateRange from={{ className: "ec-input", value: s.from ?? '', onChange: (e) => set({ from: e.target.value }) }} to={{ className: "ec-input", value: s.to ?? '', onChange: (e) => set({ to: e.target.value }) }} />
                </>
              )}
            </div>
          </li>
        )}
        {cols.length > 0 && !f.noSort && (
          <li>
            <div className="title">정렬기준</div>
            <div className="form flex-wrap">
              <select className="ec-input" value={s.sortKey ?? f.defaultSort ?? ''} onChange={(e) => set({ sortKey: e.target.value || undefined })}>
                <option value="">=======</option>
                {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <label className="ec-check"><input type="radio" name="widget-sort" checked={!s.sortDesc} onChange={() => set({ sortDesc: false })} />오름차순</label>
              <label className="ec-check"><input type="radio" name="widget-sort" checked={!!s.sortDesc} onChange={() => set({ sortDesc: true })} />내림차순</label>
            </div>
          </li>
        )}
        {f.forms && (
          <li>
            <div className="title">적용양식</div>
            <div className="form">
              <select className="ec-input" value={s.form ?? f.forms[0]} onChange={(e) => set({ form: e.target.value })}>
                {f.forms.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </li>
        )}
        {!f.noRows && (
          <li>
            <div className="title">줄수</div>
            <div className="form">
              <select className="ec-input" value={s.rows ?? f.defaultRows ?? DEFAULT_ROWS} onChange={(e) => set({ rows: Number(e.target.value) })}>
                {ROW_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </li>
        )}
        {cols.length > 0 && (
          <li>
            <div className="title">항목추가</div>
            <div className="form flex-wrap gap-x-[9px]">
              {cols.map((c) => (
                <label key={c.key} className="ec-check">
                  <input type="checkbox" checked={on.has(c.key)} onChange={(e) => {
                    const next = e.target.checked ? [...on, c.key] : [...on].filter((k) => k !== c.key)
                    // 열 차례는 원본 차례 그대로
                    set({ columns: cols.map((x) => x.key).filter((k) => next.includes(k)) })
                  }} />{c.label}
                </label>
              ))}
            </div>
          </li>
        )}
      </ul>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
