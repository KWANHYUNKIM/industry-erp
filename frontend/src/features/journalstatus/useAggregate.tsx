import { useState } from 'react'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { ecAlert } from '../../components/EcDialog'
import { COMPARES, isDateKey, shiftPeriod, type AggCond, type AggGroupDef, type Compare, type Target } from '../../utils/journalAggregate'

/** 지금 그려 놓은 집계 판의 조건 한 벌 — 검색(F8) 때 얼려 두고 표를 그린다. */
export interface AggSnapshot {
  conds: AggCond[]; targets: Target[]; compare: Compare; horizontal: boolean; ratio: boolean; withCode: boolean
  /** 기간 머리 글자(비교기간이면 둘) */
  periods: string[]
}

/**
 * 회계거래현황 · 지출결의서이체리스트 공통 ○집계 조건 판의 상태(2026-10-22 실측).
 * 집계조건 칸은 '정한 수 + 2' 개까지(최대 4), 집계대상은 여러 개, 비교기간 · 기타(가로보기 · 비율표시 · 코드포함).
 */
export function useAggState() {
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  const [keys, setKeys] = useState<string[]>(['', '', '', ''])
  const [sort, setSort] = useState<string[]>(['', '', '', ''])
  const [desc, setDesc] = useState<boolean[]>([false, false, false, false])
  const [targets, setTargets] = useState<Target[]>([])
  const [compare, setCompare] = useState<Compare>('사용안함')
  const [horizontal, setHorizontal] = useState(false)
  const [ratio, setRatio] = useState(false)
  const [withCode, setWithCode] = useState(false)

  const conds = (): AggCond[] => keys.map((k, i) => ({ key: k, sort: sort[i] || (isDateKey(k) ? '시간순' : '코드순'), desc: desc[i] })).filter((c) => c.key)
  /** 검색해도 되나 — 원본: 조건 · 대상을 안 정한 채 검색하면 표가 안 바뀐다 · 기준일자(시간순) 축이면 비교기간을 못 쓴다. */
  const check = (): boolean => {
    const c = conds()
    if (c.length === 0 || targets.length === 0) return false
    if (compare !== '사용안함' && isDateKey(c[0].key)) { void ecAlert('집계조건 기준일자, 시간순정렬시 비교기간은 사용할 수 없습니다.'); return false }
    return true
  }
  const snapshot = (from: string, to: string): AggSnapshot => {
    const slash = (d: string) => d.replace(/-/g, '/')
    const c = compare !== '사용안함' ? shiftPeriod(from, to, compare) : null
    return {
      conds: conds(), targets, compare, horizontal, ratio, withCode,
      periods: [`${slash(from)} ~ ${slash(to)}`, ...(c ? [`${slash(c.from)} ~ ${slash(c.to)}`] : [])],
    }
  }
  const reset = () => {
    setMode('내역'); setKeys(['', '', '', '']); setSort(['', '', '', '']); setDesc([false, false, false, false]); setTargets([])
    setCompare('사용안함'); setHorizontal(false); setRatio(false); setWithCode(false)
  }
  return { mode, setMode, keys, setKeys, sort, setSort, desc, setDesc, targets, setTargets, compare, setCompare, horizontal, setHorizontal, ratio, setRatio, withCode, setWithCode, conds, check, snapshot, reset }
}
export type AggState = ReturnType<typeof useAggState>

interface Props {
  st: AggState
  groups: AggGroupDef[]
  /** 고를 수 있는 집계대상(화면마다 다르다) */
  targetList: readonly string[]
  /** 집계조건 칸 이름 넷 */
  label: string[]
  targetLabel: string
  compareLabel: string
  etcLabel: string
}

/** ○집계 일 때 조건 판에 끼우는 줄들(집계조건1~4 · 집계대상 · 비교기간 · 기타). */
export function AggregateConditions({ st, groups, targetList, label, targetLabel, compareLabel, etcLabel }: Props) {
  const filled = st.keys.filter(Boolean).length
  const checkbox = (name: string, on: boolean, set: (v: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]"><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {name}</label>
  )
  return (
    <>
      {[0, 1, 2, 3].slice(0, Math.min(4, filled + 2)).map((i) => (
        <EcCond key={i} label={label[i]} pick>
          <CodePickerField label={label[i]} hideLabel width={220} emptyLabel="" value={st.keys[i]}
            onChange={(v) => { st.setKeys(st.keys.map((x, k) => (k === i ? v : x))); st.setSort(st.sort.map((x, k) => (k === i ? '' : x))) }}
            items={groups.flatMap((g) => g.items.filter((it) => it === st.keys[i] || !st.keys.includes(it)).map((it) => ({ value: it, name: it, sub: g.group || null })))} />
          {st.keys[i] && (
            <>
              <select className="ec-input ml-[6px]" value={st.sort[i] || (isDateKey(st.keys[i]) ? '시간순' : '코드순')} onChange={(e) => st.setSort(st.sort.map((x, k) => (k === i ? e.target.value : x)))}>
                {(isDateKey(st.keys[i]) ? ['시간순', '시간역순'] : ['코드순', '코드역순', ...st.targets]).map((o) => <option key={o}>{o}</option>)}
              </select>
              <button type="button" className="ec-btn ec-btn-sm ml-[4px]" title={st.desc[i] ? '내림차순' : '오름차순'} onClick={() => st.setDesc(st.desc.map((x, k) => (k === i ? !x : x)))}>{st.desc[i] ? '↓' : '↑'}</button>
            </>
          )}
        </EcCond>
      ))}
      <EcCond label={targetLabel}>
        {targetList.map((t) => (
          <label key={t} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="checkbox" checked={st.targets.includes(t)} onChange={(e) => st.setTargets(targetList.filter((x) => (x === t ? e.target.checked : st.targets.includes(x))))} /> {t}
          </label>
        ))}
      </EcCond>
      <EcCond label={compareLabel}>
        {COMPARES.map((c) => (
          <label key={c} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="radio" name="agg-compare" checked={st.compare === c} onChange={() => st.setCompare(c)} /> {c}
          </label>
        ))}
      </EcCond>
      <EcCond label={etcLabel}>
        {checkbox('가로보기', st.horizontal, st.setHorizontal)}
        {checkbox('비율표시', st.ratio, st.setRatio)}
        {checkbox('코드포함', st.withCode, st.setWithCode)}
      </EcCond>
    </>
  )
}
