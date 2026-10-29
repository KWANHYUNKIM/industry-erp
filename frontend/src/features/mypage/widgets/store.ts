import { periodOf, ymd } from '../../../utils/periods.ts'
import type { ColumnDef, Row, SettingFields, WidgetSettings } from './types.ts'

/**
 * 위젯 [설정] 값 — 위젯 id 마다 하나. 배치(mypage-grid-v1)와 나란히 이 브라우저에 둔다.
 * JSX 가 없는 순수 로직이라 store.test.ts 가 못 박는다.
 */
export const SETTINGS_KEY = 'mypage-widget-settings-v1'

/** 원본 줄수 고르기 5~30, 기본 5 */
export const ROW_CHOICES = [5, 10, 15, 20, 25, 30]
export const DEFAULT_ROWS = 5

export function loadAllSettings(): Record<string, WidgetSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const v = raw ? JSON.parse(raw) : {}
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function saveAllSettings(all: Record<string, WidgetSettings>) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(all))
}

/** 종류 처음 값 — 정해 둔 것, 없으면 라인별(열이 일자-No. 부터라 줄마다 보는 모양), 그것도 없으면 첫 값 */
export function kindOf(s: WidgetSettings, f: SettingFields | undefined): string {
  return s.kind ?? f?.defaultKind ?? (f?.kinds?.includes('라인별') ? '라인별' : f?.kinds?.[0]) ?? '라인별'
}

/** 기준일자 → 기간. 직접설정은 저장한 from~to, 모르는 이름은 금월(~오늘) */
export function rangeOf(s: WidgetSettings, f: SettingFields | undefined, today = new Date()): { from: string; to: string } {
  const label = s.period ?? f?.defaultPeriod ?? '금월(~오늘)'
  if (label === '직접설정') {
    const t = ymd(today)
    return { from: s.from || t, to: s.to || t }
  }
  return periodOf(label, today) ?? periodOf('금월(~오늘)', today)!
}

/** 보일 열 — 저장한 것이 없으면 기본으로 켠 열 전부. 저장된 key 중 없어진 열은 버린다 */
export function visibleColumns(cols: ColumnDef[], s: WidgetSettings): ColumnDef[] {
  if (!s.columns) return cols.filter((c) => !c.off)
  const on = new Set(s.columns)
  const v = cols.filter((c) => on.has(c.key))
  return v.length ? v : cols.filter((c) => !c.off)
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

/**
 * 종류(품목별 · 거래처별 · 월별 …)로 묶는다 — 같은 값끼리 한 줄, 숫자 열은 더하고 그 밖의 글자 열은
 * 모든 줄이 같을 때만 남긴다(품목별이면 품목명은 남고 일자 · 거래처는 비는 원본 모양).
 * 월별 · 일별은 그 열의 날짜를 'YYYY-MM' · 'YYYY-MM-DD' 로 잘라 묶는다.
 */
export function groupRows(rows: Row[], cols: ColumnDef[], key: string | undefined, kind: string): Row[] {
  if (!key) return rows
  const cut = kind === '월별' ? 7 : kind === '일별' ? 10 : 0
  const keyOf = (r: Row) => {
    const v = String(r[key] ?? '')
    return cut ? v.slice(0, cut) : v
  }
  const out = new Map<string, Row>()
  for (const r of rows) {
    const k = keyOf(r)
    const g = out.get(k)
    if (!g) {
      out.set(k, { ...r, [key]: k })
      continue
    }
    for (const c of cols) {
      if (c.key === key) continue
      if (c.num) g[c.key] = num(g[c.key]) + num(r[c.key])
      else if (g[c.key] !== r[c.key]) g[c.key] = ''
    }
  }
  return [...out.values()]
}

/** 검색조건 값으로 거른다(그 열에 글자가 들어 있으면 남긴다) */
export function filterRows(rows: Row[], key: string | undefined, value: string | undefined): Row[] {
  const v = value?.trim()
  if (!key || !v) return rows
  return rows.filter((r) => String(r[key] ?? '').includes(v))
}

/** 정렬기준 — 숫자 열은 크기, 글자 열은 가나다 */
export function sortRows(rows: Row[], cols: ColumnDef[], key: string | undefined, desc: boolean | undefined): Row[] {
  if (!key) return rows
  const isNum = cols.find((c) => c.key === key)?.num
  const dir = desc ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = a[key]
    const y = b[key]
    const c = isNum ? num(x) - num(y) : String(x ?? '').localeCompare(String(y ?? ''), 'ko')
    return c * dir
  })
}
