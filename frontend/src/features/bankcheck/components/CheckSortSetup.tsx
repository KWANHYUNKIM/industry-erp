import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import { requireSelection } from '../../../components/EcDialog'
import { compareValues, type SortValue } from '../../../utils/useTableSort'
import NumCheck from './NumCheck'

/**
 * 수표관리 현황 출력물(수령 · 발행수표현황 E060604 · E060608, 증가 · 감소현황 E060609~12)의 <b>정렬/소계기준 [설정]</b> 과
 * 머리 정렬 — 2026-10-14 loginaa 실측.
 *
 * <p>[설정] → '정렬/소계/합계 설정' 창(960): ① 기본설정 — [올림] [내림] [선택삭제] 와 세 줄
 * (번호 체크칸 · 순서 · 정렬/소계기준 고르기 · 정렬방법(오름 · 내림 단추) · 소계/합계라인 표시 · 표시안함 · 상세설정),
 * 끝에 '합계영역' 줄(표시 · 표시안함). ② 소계/합계 표시항목 — 기본설정(켜짐) · 직접설정, 금액의 소계 · 합계(켜짐 · 막힘).
 * 버튼 적용(F8) · 닫기. 기본값: 현황 = 1 거래처명(표시) · 2 수령(발행)일자(표시안함) · 3 없음, 감소현황 = 1 거래처명(표시) · 2 · 3 없음.
 * 고르기 목록은 열 이름 + 맨 앞 '없음'(현황: 없음 · 수령일자 · 수표번호 · 거래처명 · 계정명 · 적요 · 금액).
 * 상세설정 [설정] · ② 직접설정 은 회사 양식을 바꾸는 창이라 열지 않았다(못 잼 — 우리는 두지 않음).
 *
 * <p>머리: 열 이름이 링크(ec-navy) + ▼(fa-caret 14px — 이것 때문에 머리 높이가 27.6, 정렬 없는 거래내역은 27.1).
 * 우리 ▾ 글자는 아래로 2.64px 내려야 원본 글꼴(FontAwesome) 상자처럼 줄을 0.5px 키운다(27.63).
 * 누르면 그 열로 줄을 다시 세운다 — 처음 내림(▲ 로 바뀜), 다시 누르면 오름(▼). 묶음(소계)은 그대로 두고
 * 묶음끼리는 다시 세운 첫 줄 차례(2026-10-14 실측: 금액 내림 → (주)구로 150,000,000 · 구로조명유통 · Bisket World · 휴대폰매장아울렛).
 */
export interface SortLevel { key: string; desc: boolean; sub: boolean }
export interface SortSetup { levels: SortLevel[]; total: boolean }
export const NO_KEY = '없음'

export function sortSetup(...keys: [string, boolean][]): SortSetup {
  const levels = keys.map(([key, sub]) => ({ key, desc: false, sub }))
  while (levels.length < 3) levels.push({ key: NO_KEY, desc: false, sub: false })
  return { levels, total: true }
}

/** 머리 정렬 — 처음 누르면 내림, 다음은 오름, 그다음 다시 내림. */
export function useHeadSort() {
  const [col, setCol] = useState<string | null>(null)
  const [desc, setDesc] = useState(false)
  const toggle = (k: string) => {
    if (col !== k) { setCol(k); setDesc(true); return }
    setDesc((d) => !d)
  }
  return { col, desc, toggle, reset: () => setCol(null) }
}

/** 열 머리 — 링크 글자 + ▼(정렬 중이면 내림 ▲ · 오름 ▼). */
export function SortHead({ label, col, sort, className = '' }: {
  label: string; col?: string; sort: ReturnType<typeof useHeadSort>; className?: string
}) {
  const k = col ?? label
  const up = sort.col === k && sort.desc
  return (
    <th className={className}>
      <a href="#" className="text-ec-navy" onClick={(e) => { e.preventDefault(); sort.toggle(k) }}>{label}</a>
      <span aria-hidden className="inline-block text-[14px] leading-[14px] align-[-2.64px] ml-[2px] cursor-pointer text-ec-navy" onClick={() => sort.toggle(k)}>{up ? '▴' : '▾'}</span>
    </th>
  )
}

export interface Group<T> { key: string; rows: T[]; sum: number }

/**
 * 설정대로 줄을 세우고 묶는다. 묶음은 '표시' 로 둔 첫 기준이다(소계 줄은 그 기준 하나).
 * 머리 정렬이 있으면 줄을 그 열로 다시 세우고, 묶음끼리는 첫 줄 차례로 선다.
 */
export function arrange<T>(rows: T[], setup: SortSetup, get: Record<string, (r: T) => SortValue>,
  amount: (r: T) => number, head: ReturnType<typeof useHeadSort>): { groups: Group<T>[]; subKey: string | null } {
  const levels = setup.levels.filter((l) => l.key !== NO_KEY && get[l.key])
  const subKey = levels.find((l) => l.sub)?.key ?? null
  const cmp = (a: T, b: T) => {
    for (const l of levels) {
      const c = compareValues(get[l.key](a), get[l.key](b))
      if (c) return l.desc ? -c : c
    }
    return 0
  }
  let sorted = rows.map((r, i) => [r, i] as const).sort((x, y) => cmp(x[0], y[0]) || x[1] - y[1]).map(([r]) => r)
  if (head.col && get[head.col]) {
    const g = get[head.col]
    sorted = sorted.map((r, i) => [r, i] as const).sort((x, y) => {
      const c = compareValues(g(x[0]), g(y[0]))
      return (head.desc ? -c : c) || x[1] - y[1]
    }).map(([r]) => r)
  }
  if (!subKey) return { groups: sorted.length ? [{ key: '', rows: sorted, sum: sorted.reduce((a, r) => a + amount(r), 0) }] : [], subKey }
  const by = new Map<string, T[]>()
  for (const r of sorted) {
    const k = String(get[subKey](r) ?? '')
    by.set(k, [...(by.get(k) ?? []), r])
  }
  return { groups: [...by.entries()].map(([key, rs]) => ({ key, rows: rs, sum: rs.reduce((a, r) => a + amount(r), 0) })), subKey }
}

/** '정렬/소계/합계 설정' 창. */
export function CheckSortModal({ open, options, value, onApply, onClose }: {
  open: boolean; options: string[]; value: SortSetup; onApply: (s: SortSetup) => void; onClose: () => void
}) {
  const [levels, setLevels] = useState<SortLevel[]>(value.levels)
  const [total, setTotal] = useState(value.total)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  useEffect(() => { if (open) { setLevels(value.levels); setTotal(value.total); setPicked(new Set()) } }, [open, value])
  const set = (i: number, p: Partial<SortLevel>) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  /* [올림] · [내림] — 고른 줄을 한 칸 옮긴다. */
  const move = (up: boolean) => {
    if (!requireSelection(picked.size)) return
    const ls = [...levels]
    const order = [...picked].sort((a, b) => (up ? a - b : b - a))
    const next = new Set<number>()
    for (const i of order) {
      const j = up ? i - 1 : i + 1
      if (j < 0 || j >= ls.length || next.has(j)) { next.add(i); continue }
      ;[ls[i], ls[j]] = [ls[j], ls[i]]
      next.add(j)
    }
    setLevels(ls)
    setPicked(next)
  }
  const radio = (name: string, on: boolean, set1: (v: boolean) => void, disabled = false) => (
    <span className="inline-flex gap-[10px]">
      <label className="inline-flex items-center gap-[3px]"><input type="radio" name={name} checked={on} disabled={disabled} onChange={() => set1(true)} />표시</label>
      <label className="inline-flex items-center gap-[3px]"><input type="radio" name={name} checked={!on} disabled={disabled} onChange={() => set1(false)} />표시안함</label>
    </span>
  )
  return (
    <Modal open={open} title="정렬/소계/합계 설정" width={960} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); onApply({ levels, total }) } }}>
        <h3 className="text-[14px] font-bold mb-[8px]">정렬/소계/합계 설정</h3>
        <p className="mb-[6px]">① 기본설정</p>
        <div className="flex gap-[5px] mb-[4px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => move(true)}>올림</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => move(false)}>내림</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => {
            if (!requireSelection(picked.size)) return
            setLevels((ls) => ls.map((l, i) => (picked.has(i) ? { key: NO_KEY, desc: false, sub: false } : l)))
            setPicked(new Set())
          }}>선택삭제</button>
        </div>
        <table className="w-full mb-[12px]">
          <thead>
            <tr>
              <th className="w-[24px] text-center">
                <NumCheck no="" head label="전체 선택" on={picked.size === levels.length}
                          onChange={(v) => setPicked(v ? new Set(levels.map((_, i) => i)) : new Set())} />
              </th>
              <th className="w-[50px] text-center">순서</th>
              <th className="text-center">정렬/소계기준</th>
              <th className="w-[60px] text-center">정렬방법</th>
              <th className="w-[180px] text-center">소계/합계라인</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l, i) => (
              <tr key={i}>
                <td className="text-center">
                  <NumCheck no={i + 1} label={`${i + 1}줄 선택`} on={picked.has(i)}
                            onChange={(v) => setPicked((p) => { const n = new Set(p); if (v) n.add(i); else n.delete(i); return n })} />
                </td>
                <td className="text-center">{i + 1}</td>
                <td>
                  <select className="ec-input w-full" aria-label={`${i + 1} 정렬/소계기준`} value={l.key}
                          onChange={(e) => set(i, { key: e.target.value, ...(e.target.value === NO_KEY ? { sub: false } : {}) })}>
                    {[NO_KEY, ...options].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="text-center">
                  <button type="button" className="ec-btn ec-btn-sm" aria-label={`${i + 1} 정렬방법`} disabled={l.key === NO_KEY}
                          onClick={() => set(i, { desc: !l.desc })}>{l.desc ? '내림' : '오름'}</button>
                </td>
                <td className="text-center">{radio(`sub-${i}`, l.sub, (v) => set(i, { sub: v }), l.key === NO_KEY)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} className="text-center">합계영역</td>
              <td className="text-center">{radio('total', total, setTotal)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mb-[6px]">② 소계/합계 표시항목</p>
        <p className="mb-[6px]">
          <label className="inline-flex items-center gap-[3px] mr-[10px]"><input type="radio" checked readOnly />기본설정</label>
          <label className="inline-flex items-center gap-[3px]"><input type="radio" disabled />직접설정</label>
        </p>
        <table className="w-full mb-[12px]">
          <thead><tr><th /><th className="text-center">금액</th></tr></thead>
          <tbody>
            <tr><td className="text-center">소계</td><td className="text-center"><input type="checkbox" checked disabled aria-label="소계 금액" /></td></tr>
            <tr><td className="text-center">합계</td><td className="text-center"><input type="checkbox" checked disabled aria-label="합계 금액" /></td></tr>
          </tbody>
        </table>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => onApply({ levels, total })}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}
