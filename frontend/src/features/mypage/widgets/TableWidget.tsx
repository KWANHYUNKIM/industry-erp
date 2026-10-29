import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_ROWS, filterRows, groupRows, kindOf, rangeOf, sortRows, visibleColumns } from './store'
import type { Cell, Row, WidgetDef, WidgetSettings } from './types'

const show = (v: Cell, n?: boolean) =>
  v == null || v === '' ? '' : n ? (Number(v) || 0).toLocaleString('ko-KR') : String(v)

/**
 * 표 위젯 — 원본 홈 위젯 표: 열 머리 + 줄수만큼 줄, 합계줄 없음. 자료가 없으면 '등록된 데이터가 없습니다.'
 * [설정]의 기준일자로 받아 오고(fetch), 검색조건으로 거르고, 종류로 묶고, 정렬해 줄수만큼 자른다.
 */
export default function TableWidget({ def, settings, tick }: { def: WidgetDef; settings: WidgetSettings; tick: number }) {
  const spec = def.table!
  const f = def.fields
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const { from, to } = rangeOf(settings, f)
  const kind = kindOf(settings, f)
  const extraKey = JSON.stringify(settings.extra ?? {})

  useEffect(() => {
    let live = true
    setError('')
    spec.fetch({ from, to, kind, settings })
      .then((r) => { if (live) setRows(r) })
      .catch(() => { if (live) { setRows([]); setError('자료를 불러오지 못했습니다.') } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, kind, extraKey, tick])

  const cols = visibleColumns(spec.columns, settings)
  const cond = settings.condition ? spec.filterKey?.[settings.condition] : undefined
  let view = filterRows(rows ?? [], cond, settings.conditionValue)
  view = groupRows(view, spec.columns, spec.kindKey?.[kind], kind)
  view = sortRows(view, spec.columns, settings.sortKey ?? f?.defaultSort, settings.sortDesc)
  if (!f?.noRows) view = view.slice(0, settings.rows ?? f?.defaultRows ?? DEFAULT_ROWS)

  const caption = spec.caption?.(settings)
  return (
    <>
    {caption && <div className="ec-widget-caption">{caption}</div>}
    <table className="ec-grid">
      <thead>
        <tr>{cols.map((c) => <th key={c.key} className={c.num ? 'text-right' : undefined}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows === null ? (
          <tr><td colSpan={cols.length} className="text-center text-ec-hint">불러오는 중…</td></tr>
        ) : view.length === 0 ? (
          <tr><td colSpan={cols.length} className="text-center text-ec-hint">{error || '등록된 데이터가 없습니다.'}</td></tr>
        ) : view.map((r, i) => (
          <tr key={i} className={spec.rowClass?.(r)}>
            {cols.map((c) => {
              if (c.cell) return <td key={c.key}>{c.cell(r)}</td>
              const href = c.link?.(r)
              const text = show(r[c.key], c.num)
              return (
                <td key={c.key} className={c.num ? 'text-right' : undefined}>
                  {href && text ? <Link to={href}>{text}</Link> : text}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
    </>
  )
}
