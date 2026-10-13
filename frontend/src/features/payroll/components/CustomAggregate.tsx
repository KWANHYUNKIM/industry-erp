import { useRef, type ReactNode } from 'react'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'

/**
 * 집계조건 하나 — 원본 '집계조건검색' 창의 갈래(귀속연월 · 급여정보 · 사원정보 …) 아래 항목.
 * codeLabel 은 [코드포함] 일 때 코드 열 머리(기본 '<이름>코드'), null 이면 코드 열이 없다
 * (2026-10-13 일용근로 급여현황 실측: 급여대장 → '귀속연월-NO' 2026/10-1, 월별 → 코드 열 없음).
 */
export interface AggDim { key: string; label: string; group: string; codeLabel?: string | null }
/** 집계대상 하나 — cols 가 있으면 그 열들로 펼친다(수당금액(전체) → 기본급 · 식대 …). format 은 그 열의 숫자 꼴(기본 쉼표 원). */
export interface AggTarget {
  key: string; label: string; cols?: string[]; format?: (n: number) => string
  /** 더하지 않고 묶음의 다른 합계로 셈하는 열(이익율 = 이익 ÷ 판매액). v(열이름) 은 그 묶음의 합계 — 고르지 않은 열도 읽는다. */
  calc?: (v: (col: string) => number) => number
}
/** 집계할 한 건 — 조건마다 코드 · 이름, 열마다 금액. */
export interface AggRecord { dims: Record<string, { code: string; name: string }>; values: Record<string, number> }
export interface AggState { conds: string[]; targets: string[]; ratio: boolean; withCode: boolean }
export const EMPTY_AGG: AggState = { conds: [], targets: [], ratio: false, withCode: false }

const MAX_CONDS = 5
const won = (n: number) => (n ? Number(n).toLocaleString('ko-KR') : '')
const codeHead = (d: AggDim | undefined, key: string) => (d?.codeLabel === undefined ? `${d?.label ?? key}코드` : d.codeLabel)
const byCode = (a: string, b: string) => a.localeCompare(b, 'ko', { numeric: true })

/**
 * 원본 현황 화면 [구분] <b>사용자지정집계</b> 의 조건 줄(2026-10-12 loginaa 급여현황 E090115 실측).
 *
 * <p>처음엔 집계조건1 · 2 두 칸, 고를 때마다 한 칸씩 더 열려 5 까지(2026-10-13 일용근로 급여현황 실측: 0개 → 1 · 2, 1개 → 1~3, 3개 → 1~5). 이미 고른 조건은 다음 칸 목록에서 빠진다. 집계대상은 여러 개
 * (수당금액(전체) · 지급총액 · 공제금액(전체) · 공제총액 · 실지급액). 기타 □가로보기 □비율표시 □코드포함.
 * 원본은 조건 · 대상을 코드도움 창에서 고르고 조건마다 [코드순▾] 정렬을 둔다 — 우리는 고름칸 · 체크칸이고 늘 코드순이다.
 * 가로보기는 아직 없다.
 */
export function CustomAggregateConds({ dims, targets, value, onChange }: {
  dims: AggDim[]; targets: AggTarget[]; value: AggState; onChange: (v: AggState) => void
}) {
  const shown = Math.min(MAX_CONDS, value.conds.length + 2)
  const groups = [...new Set(dims.map((d) => d.group))]
  const setCond = (i: number, key: string) => {
    const next = value.conds.slice(0, i)
    if (key) next.push(key, ...value.conds.slice(i + 1).filter((k) => k !== key))
    onChange({ ...value, conds: key ? next : value.conds.slice(0, i) })
  }
  return (
    <div className="flex flex-col gap-[4px] mt-[6px]">
      {Array.from({ length: shown }, (_, i) => (
        <label key={i} className="flex items-center gap-[6px]">
          <span className="inline-block w-[70px] rounded-ec bg-ec-disabled px-[6px] text-ec-label">집계조건{i + 1}</span>
          <select className="ec-input w-[220px]" aria-label={`집계조건${i + 1}`} value={value.conds[i] ?? ''} onChange={(e) => setCond(i, e.target.value)}>
            <option value="">{`집계조건${i + 1}`}</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {dims.filter((d) => d.group === g && (d.key === value.conds[i] || !value.conds.includes(d.key))).map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-[6px]">
        <span className="inline-block w-[70px] rounded-ec bg-ec-disabled px-[6px] text-ec-label">집계대상</span>
        {targets.map((t) => (
          <label key={t.key} className="inline-flex items-center gap-[3px] mr-[6px]">
            <input type="checkbox" checked={value.targets.includes(t.key)}
                   onChange={(e) => onChange({ ...value, targets: e.target.checked ? [...value.targets, t.key] : value.targets.filter((k) => k !== t.key) })} /> {t.label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-[6px]">
        <span className="inline-block w-[70px] rounded-ec bg-ec-disabled px-[6px] text-ec-label">기타</span>
        <label className="inline-flex items-center gap-[3px] mr-[6px] text-ec-hint" title="원본의 가로보기 — 아직 없다">
          <input type="checkbox" disabled /> 가로보기
        </label>
        <label className="inline-flex items-center gap-[3px] mr-[6px]">
          <input type="checkbox" checked={value.ratio} onChange={(e) => onChange({ ...value, ratio: e.target.checked })} /> 비율표시
        </label>
        <label className="inline-flex items-center gap-[3px]">
          <input type="checkbox" checked={value.withCode} onChange={(e) => onChange({ ...value, withCode: e.target.checked })} /> 코드포함
        </label>
      </div>
    </div>
  )
}

type Out =
  | { kind: 'leaf'; key: string; heads: ({ code: string; name: string; span: number } | null)[]; values: number[] }
  | { kind: 'sub'; key: string; level: number; label: string; values: number[] }
type Leaf = Extract<Out, { kind: 'leaf' }>

/**
 * 사용자지정집계 결과(2026-10-12 원본 실측): 열은 조건마다 [코드 ·] 이름, 대상마다 금액[ · 비율].
 * 마지막 조건마다 한 줄, 그 위 조건이 바뀔 때마다 '부서명 계' 소계(조건 칸을 가로질러), 끝에 '합계'.
 * 같은 상위 조건의 줄은 그 칸을 세로로 합친다. 비율은 합계에 대한 % 를 반올림한 정수, 소계 줄은 비우고 합계는 100.
 * (부서 · 사원 / 지급총액 · 실지급액: 인사팀 신문섭 6,660,000 · 15 … 인사팀 계 6,660,000 … 합계 43,338,000 · 100)
 */
/**
 * {@code compare} — 원본 [비교기간](2026-10-13 일별이익현황 실측): 조건 열은 한 번만(머리 두 줄을 세로로 합침), 그 옆에
 * 기간마다 '2026/10/01 ~ 2026/10/13' 머리 아래 고른 대상 열을 한 벌씩. 줄은 두 기간 어느 쪽에든 있는 묶음, 끝에 합계.
 */
export function CustomAggregateTable({ dims, targets, records, agg: value, name, compare }: {
  dims: AggDim[]; targets: AggTarget[]; records: AggRecord[]; agg: AggState; name: string
  compare?: { records: AggRecord[]; labels: [string, string] }
}) {
  const ref = useRef<HTMLTableElement>(null)
  const conds = value.conds.filter((k) => dims.some((d) => d.key === k))
  const picked = targets.filter((t) => value.targets.includes(t.key))
  const base = picked.flatMap((t) => t.cols ?? [t.label])
  /* 비교 구간의 값은 열 이름 앞에 CMP 를 붙여 같은 기록에 싣는다 — 묶기 · 소계 · 합계를 한 번에 돈다. */
  const CMP = '\u241f'
  const cols = compare ? [...base, ...base.map((c) => CMP + c)] : base
  const baseFmts = picked.flatMap((t) => (t.cols ?? [t.label]).map(() => t.format ?? won))
  const fmts = compare ? [...baseFmts, ...baseFmts] : baseFmts
  useTableColumnCheck(ref, `${name} 사용자지정집계`, [conds.join(), cols.join(), value.ratio, value.withCode, !!compare])

  const baseCalcs = picked.flatMap((t) => (t.cols ?? [t.label]).map(() => t.calc))
  const calcs = compare ? [...baseCalcs, ...baseCalcs] : baseCalcs
  const sumOf = (rs: AggRecord[], c: string) => rs.reduce((s, r) => s + (r.values[c] ?? 0), 0)
  const sum = (rs: AggRecord[]) => cols.map((c, i) => {
    const f = calcs[i]
    const pre = compare && i >= base.length ? CMP : ''
    return f ? f((k) => sumOf(rs, pre + k)) : sumOf(rs, c)
  })
  const all: AggRecord[] = compare ? [...records, ...compare.records.map((r) => ({
    dims: r.dims, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [CMP + k, v])),
  }))] : records
  const total = sum(all)
  const out: Out[] = []
  /** 한 갈래를 펼친다 — 마지막 조건마다 한 줄, 그 위 조건이 끝날 때마다 소계 줄. */
  const walk = (rs: AggRecord[], level: number, prefix: { code: string; name: string }[], path: string): void => {
    const key = conds[level]
    const groups = new Map<string, AggRecord[]>()
    for (const r of [...rs].sort((a, b) => byCode(a.dims[key]?.code ?? '', b.dims[key]?.code ?? ''))) {
      const k = r.dims[key]?.code ?? ''
      groups.set(k, [...(groups.get(k) ?? []), r])
    }
    for (const [code, g] of groups) {
      const head = { code, name: g[0].dims[key]?.name ?? '' }
      if (level === conds.length - 1) {
        out.push({ kind: 'leaf', key: `${path}|${code}`, heads: [...prefix, head].map((h) => ({ ...h, span: 1 })), values: sum(g) })
        continue
      }
      walk(g, level + 1, [...prefix, head], `${path}|${code}`)
      out.push({ kind: 'sub', key: `s${path}|${code}`, level, label: `${head.name} 계`, values: sum(g) })
    }
  }
  if (conds.length > 0 && cols.length > 0) walk(all, 0, [], '')
  // 소계 줄 사이에 붙은 줄끼리만 같은 상위 조건 칸을 세로로 합친다 — 소계 줄은 조건 칸 전체를 가로지른다
  // (2026-10-13 일용근로 실측: 사원 · 급여대장 · 지급구분 · 월별 · 부서면 '2026/10 계' · '1차수 계' … 가 모두 조건 칸 9개를 덮는다).
  const owner: (number | null)[] = conds.map(() => null)
  for (let i = 0; i < out.length; i++) {
    const cur = out[i]
    if (cur.kind !== 'leaf') { owner.fill(null); continue }
    let merging = true
    for (let lv = 0; lv < conds.length - 1; lv++) {
      const o = owner[lv]
      const above = o === null ? null : (out[o] as Leaf).heads[lv]
      if (merging && above && above.code === cur.heads[lv]?.code) { above.span++; cur.heads[lv] = null } else { merging = false; owner[lv] = i }
    }
  }

  const perCol = value.ratio ? 2 : 1
  const dimOf = (k: string) => dims.find((d) => d.key === k)
  const label = (k: string) => dimOf(k)?.label ?? k
  const hasCode = (k: string) => value.withCode && codeHead(dimOf(k), k) !== null
  const headWidth = conds.reduce((n, k) => n + (hasCode(k) ? 2 : 1), 0)
  const width = headWidth + cols.length * perCol
  const pct = (v: number, i: number) => (total[i] ? String(Math.round((v / total[i]) * 100)) : '')
  const valueCells = (vs: number[], ratio: 'row' | 'sub' | 'total'): ReactNode[] => vs.flatMap((v, i) => {
    const cells: ReactNode[] = [<td key={`v${i}`} className="text-right">{v ? fmts[i](v) : ''}</td>]
    if (value.ratio) cells.push(<td key={`r${i}`} className="text-right">{ratio === 'row' ? pct(v, i) : ratio === 'total' ? (total[i] ? '100' : '') : ''}</td>)
    return cells
  })

  return (
    <div className="overflow-x-auto">
      <table ref={ref} className="ec-report w-full text-left whitespace-nowrap">
        <thead>
          <tr>
            {conds.flatMap((k) => (hasCode(k)
              ? [<th key={`c${k}`} rowSpan={compare ? 2 : undefined}>{codeHead(dimOf(k), k)}</th>, <th key={k} rowSpan={compare ? 2 : undefined}>{label(k)}</th>]
              : [<th key={k} rowSpan={compare ? 2 : undefined}>{label(k)}</th>]))}
            {compare
              ? compare.labels.map((p) => <th key={p} colSpan={base.length * perCol} className="text-center">{p}</th>)
              : cols.flatMap((c) => (value.ratio ? [<th key={c} className="text-right">{c}</th>, <th key={`r${c}`} className="text-right">{c}비율</th>] : [<th key={c} className="text-right">{c}</th>]))}
          </tr>
          {compare && (
            <tr>
              {cols.flatMap((c) => { const n = c.replace(CMP, ''); return value.ratio ? [<th key={c} className="text-right">{n}</th>, <th key={`r${c}`} className="text-right">{n}비율</th>] : [<th key={c} className="text-right">{n}</th>] })}
            </tr>
          )}
        </thead>
        <tbody>
          {out.length === 0 ? (
            <tr><td colSpan={Math.max(width, 1)} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {out.map((o) => (o.kind === 'leaf' ? (
                <tr key={o.key}>
                  {o.heads.flatMap((h, i) => (h === null ? [] : hasCode(conds[i])
                    ? [<td key={`c${i}`} rowSpan={h.span > 1 ? h.span : undefined}>{h.code}</td>, <td key={`n${i}`} rowSpan={h.span > 1 ? h.span : undefined}>{h.name}</td>]
                    : [<td key={`n${i}`} rowSpan={h.span > 1 ? h.span : undefined}>{h.name}</td>]))}
                  {valueCells(o.values, 'row')}
                </tr>
              ) : (
                <tr key={o.key} className="ec-total">
                  <td colSpan={headWidth} className="text-center">{o.label}</td>
                  {valueCells(o.values, 'sub')}
                </tr>
              )))}
              <tr className="ec-total">
                <td colSpan={headWidth} className="text-center">합계</td>
                {valueCells(total, 'total')}
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
