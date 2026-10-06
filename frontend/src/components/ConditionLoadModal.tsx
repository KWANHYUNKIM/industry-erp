import { useState } from 'react'
import Modal from './Modal'
import CodePickerField from './CodePickerField'
import { ymd } from '../utils/periods'

export interface LoadOption { value: string; code: string; name: string }
export interface LoadedLine { workDate: string; who: string; item: string; quantity: string }

/**
 * 입력 격자 [조건별 불러오기](원본 근무입력 · 일용근로 근무입력, 2026-10-04 실측).
 * ① 조건: 구분 일별(처음) · 사원별, 근무기간(처음 오늘 ~ 오늘), 사원(꼭 — 비우고 검색하면 원본처럼 안내 없이 칸 테두리만 빨갛게), 수당항목 → [검색(F8)] · [다시 작성]
 * ② 결과 격자: 근무일자 · 사원 · 수당항목마다 한 칸(일별은 날짜 먼저, 사원별은 사원 먼저), [일괄적용] 체크 → 한 칸에 넣으면 그 열 전부, [적용] · [닫기]
 * [적용]은 값을 넣은 칸마다 입력 격자에 한 줄(근무일자 · 사원 · 수당항목 · 근무기록)을 더한다. 수당항목을 비우면 후보 전부를 열로 둔다.
 */
export default function ConditionLoadModal({ open, people, items, onApply, onClose }: {
  open: boolean
  people: LoadOption[]
  items: LoadOption[]
  onApply: (lines: LoadedLine[]) => void
  onClose: () => void
}) {
  const today = ymd(new Date())
  const [step, setStep] = useState<'cond' | 'grid'>('cond')
  const [byPerson, setByPerson] = useState(false)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [who, setWho] = useState<string[]>([])
  const [itemSel, setItemSel] = useState<string[]>([])
  const [error, setError] = useState('')
  const [whoMissing, setWhoMissing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [bulk, setBulk] = useState(false)

  const cols = items.filter((i) => itemSel.length === 0 || itemSel.includes(i.value))
  const days: string[] = []
  for (let d = new Date(`${from}T00:00:00`); ymd(d) <= to && days.length < 62; d.setDate(d.getDate() + 1)) days.push(ymd(d))
  const rows = byPerson ? who.flatMap((p) => days.map((d) => ({ d, p }))) : days.flatMap((d) => who.map((p) => ({ d, p })))
  const keyOf = (d: string, p: string, it: string) => `${d}|${p}|${it}`

  function reset() { setByPerson(false); setFrom(today); setTo(today); setWho([]); setItemSel([]); setError(''); setWhoMissing(false) }
  function search() {
    if (who.length === 0) { setWhoMissing(true); return }
    if (to < from) { setError('근무기간의 끝이 시작보다 앞섭니다.'); return }
    setError(''); setWhoMissing(false); setValues({}); setBulk(false); setStep('grid')
  }
  function close() { setStep('cond'); onClose() }
  function set(d: string, p: string, it: string, v: string) {
    setValues((vs) => (bulk ? { ...vs, ...Object.fromEntries(rows.map((r) => [keyOf(r.d, r.p, it), v])) } : { ...vs, [keyOf(d, p, it)]: v }))
  }
  function apply() {
    const lines = rows.flatMap((r) => cols.map((c) => ({ workDate: r.d, who: r.p, item: c.value, quantity: values[keyOf(r.d, r.p, c.value)] ?? '' })))
      .filter((l) => l.quantity !== '' && Number(l.quantity) !== 0)
    onApply(lines)
    setStep('cond')
  }

  if (step === 'cond') {
    return (
      <Modal error={error} open={open} title="조건별 불러오기" width={640} onClose={close}>
        <ul className="ec-form">
          <li className="wide">
            <span className="title">구분</span>
            <div className="form flex gap-[12px]">
              {([[false, '일별'], [true, '사원별']] as const).map(([v, l]) => (
                <label key={l} className="inline-flex items-center gap-[4px]">
                  <input type="radio" name="cond-load-kind" checked={byPerson === v} onChange={() => setByPerson(v)} /> {l}
                </label>
              ))}
            </div>
          </li>
          <li className="wide">
            <span className="title">근무기간</span>
            <div className="form flex items-center gap-[6px]">
              <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
              ~
              <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </li>
          <li className="wide">
            <span className="title">사원</span>
            <div className={`form${whoMissing ? ' rounded-ec outline outline-1 outline-ec-danger' : ''}`} data-invalid={whoMissing || undefined}>
              <CodePickerField label="불러올 사원" hideLabel fill multiple placeholder="사원" values={who} onChangeMulti={(v) => { setWho(v); if (v.length) setWhoMissing(false) }} items={people} />
            </div>
          </li>
          {items.length > 1 && (
            <li className="wide">
              <span className="title">수당항목</span>
              <div className="form">
                <CodePickerField label="불러올 수당항목" hideLabel fill multiple placeholder="수당항목" values={itemSel} onChangeMulti={setItemSel} items={items} />
              </div>
            </li>
          )}
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
          <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={close}>닫기</button>
        </div>
      </Modal>
    )
  }

  const nameOf = (p: string) => people.find((x) => x.value === p)?.name ?? ''
  return (
    <Modal error={error} open={open} title="조건별 불러오기" width={Math.min(1100, 420 + cols.length * 120)} onClose={close}>
      <label className="inline-flex items-center gap-[4px] mb-[6px]">
        <input type="checkbox" checked={bulk} onChange={(e) => setBulk(e.target.checked)} /> 일괄적용
      </label>
      <div className="overflow-x-auto max-h-[420px]">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[120px] text-center">근무일자</th>
              <th>사원</th>
              {cols.map((c) => <th key={c.value} className="w-[110px] text-right">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.d}-${r.p}`}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td className="text-center">{r.d.replace(/-/g, '/')}</td>
                <td>{nameOf(r.p)}</td>
                {cols.map((c) => (
                  <td key={c.value}>
                    <input className="ec-input w-full text-right" inputMode="decimal" aria-label={`${r.d} ${nameOf(r.p)} ${c.name}`}
                           value={values[keyOf(r.d, r.p, c.value)] ?? ''}
                           onChange={(e) => set(r.d, r.p, c.value, e.target.value.replace(/[^0-9.]/g, ''))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용</button>
        <button type="button" className="ec-btn" onClick={close}>닫기</button>
      </div>
    </Modal>
  )
}
