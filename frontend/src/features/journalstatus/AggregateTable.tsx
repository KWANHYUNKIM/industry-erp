import { Fragment, type ReactNode } from 'react'
import { isDateKey, percentOf, type AggCond, type AggNode, type Target } from '../../utils/journalAggregate'

const won = (n: number | undefined) => (!n ? '' : Math.round(n).toLocaleString('ko-KR'))

interface Props {
  tree: AggNode
  conds: AggCond[]
  targets: Target[]
  /** 기간 머리 글자(비교기간이면 둘 — '2026/09/22 ~ 2026/10/22') */
  periodLabels: string[]
  horizontal: boolean
  ratio: boolean
  withCode: boolean
}

/** 맨 아래 묶음까지 내려간 길(경로) 목록. */
function leafPaths(n: AggNode, depth: number, max: number, path: AggNode[] = []): AggNode[][] {
  if (depth === max) return [path]
  return n.children.flatMap((c) => leafPaths(c, depth + 1, max, [...path, c]))
}

/**
 * 회계거래현황 ○집계 결과 표(2026-10-22 실측). 세로: 묶음 칸(앞 칸 rowSpan) · 값 / 첫 묶음마다 [… 계] / 끝 [합계].
 * 가로보기: 마지막 집계조건이 열 묶음이 된다(코드순). 비율표시: 값 옆 '…비율' 열. 코드포함: 이름 앞 코드 칸.
 */
export default function AggregateTable({ tree, conds, targets, periodLabels, horizontal, ratio, withCode }: Props) {
  const n = conds.length
  const hz = horizontal && n >= 2
  const rowConds = hz ? conds.slice(0, n - 1) : conds
  const codeOf = (i: number) => withCode && !isDateKey(rowConds[i].key)
  const labelCols = rowConds.reduce((s, _c, i) => s + 1 + (codeOf(i) ? 1 : 0), 0)
  const paths = leafPaths(tree, 0, rowConds.length)
  const multi = periodLabels.length > 1 && !hz
  const showRatio = ratio && !multi

  const labelCells = (path: AggNode[], idx: number): ReactNode[] => path.flatMap((node, lvl) => {
    if (idx > 0 && paths[idx - 1][lvl] === node) return []
    const span = paths.filter((p) => p.slice(0, lvl + 1).every((x, k) => x === path[k])).length
    return [
      ...(codeOf(lvl) ? [<td key={`c${lvl}`} rowSpan={span}>{node.code}</td>] : []),
      <td key={`l${lvl}`} rowSpan={span} className={lvl === 0 ? 'text-center' : undefined}>{node.label}</td>,
    ]
  })

  const valueCells = (get: (t: Target, p: number) => number | undefined, leaf: boolean, pCount: number, keyPrefix: string): ReactNode[] => {
    const out: ReactNode[] = []
    for (let p = 0; p < pCount; p++) {
      for (const t of targets) {
        out.push(<td key={`${keyPrefix}${p}${t}`} className="text-right">{won(get(t, p))}</td>)
        if (showRatio && p === 0) out.push(<td key={`${keyPrefix}r${p}${t}`} className="text-right">{leaf ? percentOf(get(t, p) ?? 0, tree.sums[0][t] ?? 0) : ''}</td>)
      }
    }
    return out
  }

  if (hz) {
    const cols = [...new Map(tree.children.flatMap((a) => leafPaths(a, 1, n - 1).map((p) => p[p.length - 1])).map((x) => [x.label, x])).values()]
    cols.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    const lastCond = conds[n - 1]
    if (lastCond.desc) cols.reverse()
    const valueAt = (path: AggNode[], label: string, t: Target) => path[path.length - 1].children.find((c) => c.label === label)?.sums[0][t]
    return (
      <table className="ec-report w-full text-left">
        <thead>
          <tr>
            {rowConds.flatMap((c, i) => [...(codeOf(i) ? [<th key={`hc${i}`} rowSpan={2}>{c.key}코드</th>] : []), <th key={`h${i}`} rowSpan={2}>{c.key}</th>])}
            {cols.map((c) => <th key={c.label} colSpan={targets.length * (ratio ? 2 : 1)}>{c.label}</th>)}
          </tr>
          <tr>{cols.flatMap((c) => targets.flatMap((t) => [<th key={`${c.label}${t}`}>{t}</th>, ...(ratio ? [<th key={`${c.label}${t}r`}>{t}비율</th>] : [])]))}</tr>
        </thead>
        <tbody>
          {paths.map((path, idx) => {
            const g1 = path[0]
            const lastOfG1 = idx === paths.length - 1 || paths[idx + 1][0] !== g1
            const cell = (p: AggNode[], leaf: boolean, k: string) => cols.flatMap((c) => valueCells((t) => valueAt(p, c.label, t), leaf, 1, `${k}${c.label}`))
            return (
              <Fragment key={path.map((x) => x.label).join('/')}>
                <tr>{[...path.flatMap((node, lvl) => [...(codeOf(lvl) ? [<td key={`c${lvl}`}>{node.code}</td>] : []), <td key={`l${lvl}`}>{node.label}</td>]), ...cell(path, true, 'v')]}</tr>
                {lastOfG1 && (
                  <tr className="ec-total">
                    <td colSpan={labelCols}>{g1.label}  계</td>
                    {cols.flatMap((c) => valueCells((t) => (paths.filter((x) => x[0] === g1).reduce((s, x) => s + (valueAt(x, c.label, t) ?? 0), 0)), false, 1, `s${c.label}`))}
                  </tr>
                )}
              </Fragment>
            )
          })}
          <tr className="ec-total">
            <td colSpan={labelCols}>합계</td>
            {cols.flatMap((c) => valueCells((t) => paths.reduce((s, x) => s + (valueAt(x, c.label, t) ?? 0), 0), true, 1, `t${c.label}`))}
          </tr>
        </tbody>
      </table>
    )
  }

  const subtotal = n >= 2
  return (
    <table className="ec-report w-full text-left">
      <thead>
        <tr>
          {rowConds.flatMap((c, i) => [...(codeOf(i) ? [<th key={`hc${i}`} rowSpan={multi ? 2 : 1}>{c.key}코드</th>] : []), <th key={`h${i}`} rowSpan={multi ? 2 : 1}>{c.key}</th>])}
          {multi
            ? periodLabels.map((l) => <th key={l} colSpan={targets.length}>{l}</th>)
            : targets.flatMap((t) => [<th key={t}>{t}</th>, ...(showRatio ? [<th key={`${t}r`}>{t}비율</th>] : [])])}
        </tr>
        {multi && <tr>{periodLabels.flatMap((l) => targets.map((t) => <th key={`${l}${t}`}>{t}</th>))}</tr>}
      </thead>
      <tbody>
        {paths.map((path, idx) => {
          const g1 = path[0]
          const lastOfG1 = idx === paths.length - 1 || paths[idx + 1][0] !== g1
          const leaf = path[path.length - 1]
          return (
            <Fragment key={path.map((x) => x.label).join('/')}>
              <tr>
                {labelCells(path, idx)}
                {valueCells((t, p) => leaf.sums[p][t], true, multi ? periodLabels.length : 1, 'v')}
              </tr>
              {subtotal && lastOfG1 && (
                <tr className="ec-total">
                  <td colSpan={labelCols}>{g1.label}  계</td>
                  {valueCells((t, p) => g1.sums[p][t], false, multi ? periodLabels.length : 1, 's')}
                </tr>
              )}
            </Fragment>
          )
        })}
        <tr className="ec-total">
          <td colSpan={labelCols}>합계</td>
          {valueCells((t, p) => tree.sums[p][t], true, multi ? periodLabels.length : 1, 't')}
        </tr>
      </tbody>
    </table>
  )
}
