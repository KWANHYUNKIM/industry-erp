import { useCallback, useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import NumCheck from '../../../components/NumCheck'
import { ecConfirm, requireSelection } from '../../../components/EcDialog'
import { api, extractErrorMessage } from '../../../api/client'

/** 계산식리스트 한 줄 — 서버 DailyPayItemDtos.FormulaResponse. id 가 null 이면 기본 '2010/01 ~' 줄(자동 계산식). */
export interface FormulaRow { id: number | null; applyMonth: string; formula: string }
export interface FormulaItem { id: number; code: string; name: string; builtin: boolean }

/** 원본 계산식등록 [계산도구](2026-10-21 실측) — 누르면 계산식 끝에 붙는다. */
const TOOLS: [string, string][] = [
  ['( 괄호열기', '('], [') 괄호닫기', ')'], ['+ 더하기', '+'],
  ['- 빼기', '-'], ['* 곱하기', '*'], ['/ 나누기', '/'],
  ['R( 반올림', 'R('], ['C( 절상', 'C('], ['F( 절사', 'F('],
  [', [ , ]', ','], ['Min( 최소값', 'Min('], ['Max( 최대값', 'Max('],
]
const YEARS = Array.from({ length: 2100 - 2010 + 1 }, (_, i) => String(2010 + i))
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const slash = (ym: string) => ym.replace('-', '/')

interface Draft { id: number | null; base: boolean; year: string; month: string; formula: string }

/**
 * 일용근로 수당 · 공제 [설정] → '계산식리스트' 창 · 그 안의 '계산식등록' 창(원본 E020136, 2026-10-21 loginaa 실측).
 *
 * <ul>
 *   <li>계산식리스트: [번호] · 적용시점('2010/01 ~' 링크) · 계산식, 늦은 적용시점이 위. 아래 [신규(F2)] [사용중단/재사용] [닫기].
 *       기본 '2010/01 ~' 줄은 이름 · 지급유형으로 만든 자동 계산식.</li>
 *   <li>계산식등록: 수당항목코드 · 수당항목명 · 적용시점(연 / 월, 처음은 이번 달) · 계산식예시 · [불러오기] · 계산식 | 조건 ·
 *       계산도구 · 오른쪽 항목 목록. 신규는 [저장(F8)] [다시 작성] [닫기], 수정은 [저장(F8)] [다시 작성] [사용중단/재사용 ▾] [리스트] [닫기].</li>
 *   <li>[저장(F8)] 하면 두 창이 다 닫히고 격자 계산식 칸이 가장 늦은 적용시점 식이 된다. 삭제는 확인 창 없이 지우고 닫힌다.</li>
 * </ul>
 * 원본 계산식 칸은 계산도구 · 항목을 눌러 조각(칩)으로 쌓고 손으로 친 글자는 받지 않는다 — 우리는 글칸이라 손으로도 고칠 수 있다.
 */
export default function DailyPayFormulaDialogs({ item, kindLabel, allowanceNames, onClose, onChanged }: {
  item: FormulaItem
  /** '수당' | '공제' — 칸 이름 '수당항목코드' 등 */
  kindLabel: string
  /** 오른쪽 항목 목록에 놓을 수당 이름(표시순서대로) */
  allowanceNames: string[]
  onClose: () => void
  onChanged: () => void
}) {
  const [rows, setRows] = useState<FormulaRow[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<'list' | 'edit' | null>(null)

  const load = useCallback(async () => {
    const { data } = await api.get<FormulaRow[]>(`/hr/daily-pay-items/${item.id}/formulas`)
    setRows(data)
    setChecked(new Set())
  }, [item.id])
  useEffect(() => { load().catch((e) => setError(extractErrorMessage(e))) }, [load])

  const now = new Date()
  const blankDraft = (): Draft => ({ id: null, base: false, year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, '0'), formula: '' })
  const open = (r: FormulaRow): Draft => ({ id: r.id, base: r.id == null, year: r.applyMonth.slice(0, 4), month: r.applyMonth.slice(5, 7), formula: r.formula })
  const original = draft && draft.id != null ? rows.find((r) => r.id === draft.id) : draft?.base ? rows.find((r) => r.id == null) : undefined

  function closeAll() { setDraft(null); onClose() }

  async function save() {
    if (!draft) return
    const body = { applyMonth: `${draft.year}-${draft.month}`, formula: draft.formula }
    try {
      if (draft.id != null) await api.put(`/hr/daily-pay-items/${item.id}/formulas/${draft.id}`, body)
      else await api.post(`/hr/daily-pay-items/${item.id}/formulas`, body)
      setError('')
      onChanged()
      closeAll()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove(ids: number[], ask: boolean) {
    setMenu(null)
    if (ask && !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const id of ids) await api.delete(`/hr/daily-pay-items/${item.id}/formulas/${id}`)
      setError('')
      onChanged()
      closeAll()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const append = (t: string) => setDraft((d) => (d ? { ...d, formula: `${d.formula.trimEnd()}${d.formula.trim() ? ' ' : ''}${t}` } : d))
  const effective = rows[0]?.formula ?? ''
  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const vars = (scope: string, names: string[]) => names.map((n) => `${n}(${scope})`)

  return (
    <>
      <Modal open={!draft} title="계산식리스트" width={720} error={draft ? null : error} onClose={onClose}>
        <table className="w-full text-left" aria-label="계산식리스트">
          <thead>
            <tr><th className="w-[34px]"></th><th className="w-[160px]">적용시점</th><th>계산식</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? 'base'}>
                <td className="pad text-center">
                  {r.id != null ? <NumCheck tone="plain" hover={false} no={i + 1} on={checked.has(r.id)} onChange={() => toggle(r.id!)} label={`${i + 1}행 고르기`} />
                    : <span className="text-ec-icon">{i + 1}</span>}
                </td>
                <td className="pad"><button type="button" className="ec-link" onClick={() => { setError(''); setDraft(open(r)) }}>{slash(r.applyMonth)}  ~</button></td>
                <td className="pad whitespace-nowrap">{r.formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[12px] relative">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => { setError(''); setDraft(blankDraft()) }}>신규(F2)</button>
          <button type="button" className="ec-btn" onClick={() => { if (requireSelection(checked.size)) setMenu(menu === 'list' ? null : 'list') }}>사용중단/재사용</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          {menu === 'list' && (
            <div className="ec-menu absolute bottom-[30px] left-[80px]">
              <button type="button" onClick={() => void remove([...checked], true)}>삭제</button>
            </div>
          )}
        </div>
      </Modal>

      {draft && (
        <Modal open title="계산식등록" width={1000} error={error} onClose={() => setDraft(null)}>
          <div className="flex gap-[12px] mobile:flex-col">
            <div className="flex-1 min-w-0">
              <ul className="ec-form">
                <li className="wide"><span className="title">{kindLabel}항목코드</span><div className="form">{item.code}</div></li>
                <li className="wide"><span className="title">{kindLabel}항목명</span><div className="form">{item.name}</div></li>
                <li className="wide">
                  <span className="title">적용시점</span>
                  <div className="form flex items-center gap-[4px]">
                    <select className="ec-input w-[80px]" aria-label="적용시점 연" value={draft.year} disabled={draft.base} onChange={(e) => setDraft({ ...draft, year: e.target.value })}>
                      {YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                    /
                    <select className="ec-input w-[60px]" aria-label="적용시점 월" value={draft.month} disabled={draft.base} onChange={(e) => setDraft({ ...draft, month: e.target.value })}>
                      {MONTHS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </li>
                <li className="wide">
                  <span className="title">계산식예시</span>
                  <div className="form text-ec-hint">
                    소수 첫째 자리에서 반올림 : R(계산식, 0)<br />
                    정수 첫째 자리에서 반올림 : R(계산식, -1)<br />
                    * 절상(C)절사(F)로 대체 가능하며, -5~2 범위값만 허용됩니다.
                  </div>
                </li>
              </ul>
              <div className="my-[6px]"><button type="button" className="ec-btn ec-btn-sm" onClick={() => setDraft({ ...draft, formula: effective })}>불러오기</button></div>
              <table className="w-full text-left">
                <thead><tr><th>계산식</th><th className="w-[48px] text-center">조건</th></tr></thead>
                <tbody>
                  <tr>
                    <td className="pad"><input className="ec-input w-full" aria-label="계산식" value={draft.formula}
                                               onChange={(e) => setDraft({ ...draft, formula: e.target.value })}
                                               onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }} /></td>
                    <td className="pad text-center"><input type="checkbox" aria-label="조건" disabled /></td>
                  </tr>
                </tbody>
              </table>
              <p className="font-bold mt-[10px] mb-[4px]">▾ 계산도구</p>
              <div className="grid grid-cols-3 gap-[4px]">
                {TOOLS.map(([label, t]) => <button key={label} type="button" className="ec-link text-left" onClick={() => append(t)}>{label}</button>)}
              </div>
            </div>
            <div className="w-[280px] mobile:w-full">
              <p className="font-bold mb-[4px]">사원</p>
              <p className="text-ec-hint mb-[2px]">▾ 급여지급사항</p>
              {vars('급여지급사항', ['일급', '비과세총액', ...allowanceNames]).map((v) => <button key={v} type="button" className="ec-link block" onClick={() => append(v)}>{v}</button>)}
              <p className="font-bold mt-[8px] mb-[4px]">수당항목</p>
              {['배율(수당항목)', '숫자형추가항목2(수당항목)', '숫자형추가항목3(수당항목)'].map((v) => <button key={v} type="button" className="ec-link block" onClick={() => append(v)}>{v}</button>)}
              <p className="font-bold mt-[8px] mb-[4px]">급여</p>
              <p className="text-ec-hint mb-[2px]">▾ 근무기록확정</p>
              {[...vars('근무기록확정', ['일급', ...allowanceNames]), '근무기록확정(금액)'].map((v) => <button key={v} type="button" className="ec-link block" onClick={() => append(v)}>{v}</button>)}
            </div>
          </div>
          <div className="flex gap-[6px] mt-[12px] relative">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setDraft(original ? open(original) : blankDraft())}>다시 작성</button>
            {(draft.id != null || draft.base) && (
              <>
                <button type="button" className="ec-btn" onClick={() => setMenu(menu === 'edit' ? null : 'edit')}>사용중단/재사용 ▾</button>
                <button type="button" className="ec-btn" onClick={() => setDraft(null)}>리스트</button>
              </>
            )}
            <button type="button" className="ec-btn" onClick={closeAll}>닫기</button>
            {menu === 'edit' && (
              <div className="ec-menu absolute bottom-[30px] left-[160px]">
                <button type="button" disabled={draft.id == null} onClick={() => { if (draft.id != null) void remove([draft.id], false) }}>삭제</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
