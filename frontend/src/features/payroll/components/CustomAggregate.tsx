import { useRef, type ReactNode } from 'react'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'

/** 집계조건 하나 — 원본 '집계조건검색' 창의 갈래(귀속연월 · 급여정보 · 사원정보 …) 아래 항목. */
export interface AggDim { key: string; label: string; group: string }
/** 집계대상 하나 — cols 가 있으면 그 열들로 펼친다(수당금액(전체) → 기본급 · 식대 …). */
export interface AggTarget { key: string; label: string; cols?: string[] }
/** 집계할 한 건 — 조건마다 코드 · 이름, 열마다 금액. */
export interface AggRecord { dims: Record<string, { code: string; name: string }>; values: Record<string, number> }
export interface AggState { conds: string[]; targets: string[]; ratio: boolean; withCode: boolean }
export const EMPTY_AGG: AggState = { conds: [], targets: [], ratio: false, withCode: false }

const MAX_CONDS = 5
const won = (n: number) => (n ? Number(n).toLocaleString('ko-KR') : '')
const byCode = (a: string, b: string) => a.localeCompare(b, 'ko', { numeric: true })

/**
 * 원본 현황 화면 [구분] <b>사용자지정집계</b> 의 조건 줄(2026-10-12 loginaa 급여현황 E090115 실측).
 *
 * <p>집계조건1 을 고르면 2 가 열리고 … 5 까지. 이미 고른 조건은 다음 칸 목록에서 빠진다. 집계대상은 여러 개
 * (수당금액(전체) · 지급총액 · 공제금액(전체) · 공제총액 · 실지급액). 기타 □가로보기 □비율표시 □코드포함.
 * 원본은 조건 · 대상을 코드도움 창에서 고르고 조건마다 [코드순▾] 정렬을 둔다 — 우리는 고름칸 · 체크칸이고 늘 코드순이다.
 * 가로보기는 아직 없다.
 */
export function CustomAggregateConds({ dims, targets, value, onChange }: {
  dims: AggDim[]; targets: AggTarget[]; value: AggState; onChange: (v: AggState) => void
}) {
  const shown = Math.min(MAX_CONDS, value.conds.length + 1)
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

/**
 * 사용자지정집계 결과(2026-10-12 원본 실측): 열은 조건마다 [코드 ·] 이름, 대상마다 금액[ · 비율].
 * 마지막 조건마다 한 줄, 그 위 조건이 바뀔 때마다 '부서명 계' 소계(조건 칸을 가로질러), 끝에 '합계'.
 * 같은 상위 조건의 줄은 그 칸을 세로로 합친다. 비율은 합계에 대한 % 를 반올림한 정수, 소계 줄은 비우고 합계는 100.
 * (부서 · 사원 / 지급총액 · 실지급액: 인사팀 신문섭 6,660,000 · 15 … 인사팀 계 6,660,000 … 합계 43,338,000 · 100)
 */
export function CustomAggregateTable({ dims, targets, records, agg: value, name }: {
  dims: AggDim[]; targets: AggTarget[]; records: AggRecord[]; agg: AggState; name: string
}) {
  const ref = useRef<HTMLTableElement>(null)
  const conds = value.conds.filter((k) => dims.some((d) => d.key === k))
  const cols = targets.filter((t) => value.targets.includes(t.key)).flatMap((t) => t.cols ?? [t.label])
  useTableColumnCheck(ref, `${name} 사용자지정집계`, [conds.join(), cols.join(), value.ratio, value.withCode])

  const sum = (rs: AggRecord[]) => cols.map((c) => rs.reduce((s, r) => s + (r.values[c] ?? 0), 0))
  const total = sum(records)
  const out: Out[] = []
  /** 한 갈래를 펼치고 그 갈래가 차지한 줄 수(하위 소계 포함)를 돌려준다. */
  const walk = (rs: AggRecord[], level: number, prefix: { code: string; name: string }[], path: string): number => {
    const key = conds[level]
    const groups = new Map<string, AggRecord[]>()
    for (const r of [...rs].sort((a, b) => byCode(a.dims[key]?.code ?? '', b.dims[key]?.code ?? ''))) {
      const k = r.dims[key]?.code ?? ''
      groups.set(k, [...(groups.get(k) ?? []), r])
    }
    let count = 0
    for (const [code, g] of groups) {
      const head = { code, name: g[0].dims[key]?.name ?? '' }
      if (level === conds.length - 1) {
        out.push({ kind: 'leaf', key: `${path}|${code}`, heads: [...prefix, head].map((h) => ({ ...h, span: 1 })), values: sum(g) })
        count++
        continue
      }
      const at = out.length
      const n = walk(g, level + 1, [...prefix, head], `${path}|${code}`)
      // 첫 줄의 이 단계 칸이 아래 줄들을 세로로 덮는다
      const first = out[at]
      if (first.kind === 'leaf') first.heads[level] = { ...head, span: n }
      for (let i = at + 1; i < at + n; i++) { const o = out[i]; if (o.kind === 'leaf') o.heads[level] = null }
      out.push({ kind: 'sub', key: `s${path}|${code}`, level, label: `${head.name} 계`, values: sum(g) })
      count += n + 1
    }
    return count
  }
  if (conds.length > 0 && cols.length > 0) walk(records, 0, [], '')

  const perDim = value.withCode ? 2 : 1
  const headWidth = conds.length * perDim
  const perCol = value.ratio ? 2 : 1
  const width = headWidth + cols.length * perCol
  const label = (k: string) => dims.find((d) => d.key === k)?.label ?? k
  const pct = (v: number, i: number) => (total[i] ? String(Math.round((v / total[i]) * 100)) : '')
  const valueCells = (vs: number[], ratio: 'row' | 'sub' | 'total'): ReactNode[] => vs.flatMap((v, i) => {
    const cells: ReactNode[] = [<td key={`v${i}`} className="text-right">{won(v)}</td>]
    if (value.ratio) cells.push(<td key={`r${i}`} className="text-right">{ratio === 'row' ? pct(v, i) : ratio === 'total' ? (total[i] ? '100' : '') : ''}</td>)
    return cells
  })

  return (
    <div className="overflow-x-auto">
      <table ref={ref} className="w-full text-left whitespace-nowrap">
        <thead>
          <tr>
            {conds.flatMap((k) => (value.withCode ? [<th key={`c${k}`}>{label(k)}코드</th>, <th key={k}>{label(k)}</th>] : [<th key={k}>{label(k)}</th>]))}
            {cols.flatMap((c) => (value.ratio ? [<th key={c} className="text-right">{c}</th>, <th key={`r${c}`} className="text-right">{c}비율</th>] : [<th key={c} className="text-right">{c}</th>]))}
          </tr>
        </thead>
        <tbody>
          {out.length === 0 ? (
            <tr><td colSpan={Math.max(width, 1)} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {out.map((o) => (o.kind === 'leaf' ? (
                <tr key={o.key}>
                  {o.heads.flatMap((h, i) => (h === null ? [] : value.withCode
                    ? [<td key={`c${i}`} rowSpan={h.span > 1 ? h.span : undefined}>{h.code}</td>, <td key={`n${i}`} rowSpan={h.span > 1 ? h.span : undefined}>{h.name}</td>]
                    : [<td key={`n${i}`} rowSpan={h.span > 1 ? h.span : undefined}>{h.name}</td>]))}
                  {valueCells(o.values, 'row')}
                </tr>
              ) : (
                <tr key={o.key} className="font-bold">
                  <td colSpan={headWidth - o.level * perDim}>{o.label}</td>
                  {valueCells(o.values, 'sub')}
                </tr>
              )))}
              <tr className="font-bold">
                <td colSpan={headWidth}>합계</td>
                {valueCells(total, 'total')}
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
