import { useEffect, useRef, useState } from 'react'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'
import { ymd } from '../../../utils/periods'

export interface PayItemFormula {
  id: number
  payItemId: number
  effectiveFrom: string   // YYYY-MM
  formula: string
  active: boolean
}

interface VariableGroup { group: string; names: string[] }

/** 원본 계산도구(2026-10-13 실측 차례 · 글자). 누르면 계산식 칸 커서 자리에 넣는다. */
const TOOLS: [string, string][] = [
  ['( ', '괄호열기'], [' )', '괄호닫기'], [' + ', '더하기'], [' - ', '빼기'], [' * ', '곱하기'], [' / ', '나누기'],
  ['R( ', '반올림'], ['C( ', '절상'], ['F( ', '절사'], [' , ', ''], ['Min( ', '최소값'], ['Max( ', '최대값'],
]

/** 원본 계산도구 (조건) — [조건] 을 켜면 붙는다(2026-10-13 공제항목등록 실측). */
const COND_TOOLS = ['AND', 'OR', '=', '>', '<', '>=', '<=', '<>']

/** '[조건1] a, [참1] b, [거짓1] c' → 세 칸. 안쪽 [조건2] … 는 [참1] · [거짓1] 칸에 글자 그대로 남는다. */
export function splitCondition(f: string): [string, string, string] | null {
  const m = /^\s*\[조건1\]\s*([\s\S]*?)\s*,\s*\[참1\]\s*([\s\S]*?)\s*,\s*\[거짓1\]\s*([\s\S]*)$/.exec(f)
  return m ? [m[1], m[2], m[3].trim()] : null
}

export const joinCondition = (c: string, t: string, e: string) =>
  `[조건1] ${c.trim()}, [참1] ${t.trim()}, [거짓1] ${e.trim()}`

const thisMonth = () => ymd(new Date()).slice(0, 7)
const showMonth = (m: string) => m.replace('-', '/')

/**
 * 원본 수당항목등록 [계산식] 칸을 누르면 뜨는 <b>계산식리스트</b>(적용시점 · 계산식, 신규(F2) · 사용중단/재사용 · 닫기)와
 * 그 줄 · [신규]로 여는 <b>계산식등록</b>(수당항목코드 · 수당항목명 · 적용시점 · 계산식예시 · 계산식 · 계산도구 · 찾기 목록,
 * 저장(F8) · 다시 작성 · 리스트 · 닫기). 2026-10-13 loginaa 실측(부양가족수당).
 *
 * <p>원본 계산식 칸은 계산도구 · 항목을 눌러 쌓는 칸이다. 우리는 글자로도 고칠 수 있게 두고 누르면 커서 자리에 넣는다.
 * 틀린 식을 저장하면 서버가 원본 문구 '계산식이 유효하지 않습니다. 확인후 다시 설정 바랍니다.' 로 막는다.
 * 신규의 적용시점 처음 값은 이번 달이다(원본 2026/10). [SUMIFS( 조건부 합계] 는 SumifsModal 로 글자를 만든다. [ ] 는 아직 없다.
 *
 * <p>공제항목등록도 같은 창이다(kind='DEDUCTION' — 공제항목코드 · 공제항목명, 찾기 목록에 공제 · 기타 · 계산항목 산출금액).
 * 계산식등록 줄 끝 [조건] 을 켜면 원본처럼 조건1 · [참1] · [거짓1] 세 줄과 계산도구 (조건) AND · OR · = · &gt; · &lt; · &gt;= · &lt;= · &lt;&gt; 가 붙고,
 * '[조건1] …, [참1] …, [거짓1] …' 로 저장된다(원본 건강보험 식과 같은 글자). 원본은 [참] · [거짓] 줄에도 [조건] 칸이 있어
 * 겹칠 수 있는데 우리 칸은 한 겹이다 — 안쪽 [조건2] … 는 칸에 글자로 적으면 서버가 푼다.
 */
export default function PayItemFormulaModal({ item, formulas, onClose, onChanged, kind = 'ALLOWANCE' }: {
  item: { id: number; code: string; name: string }
  kind?: 'ALLOWANCE' | 'DEDUCTION'
  formulas: PayItemFormula[]
  onClose: () => void
  onChanged: () => void
}) {
  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [editing, setEditing] = useState<PayItemFormula | null>(null)
  const [from, setFrom] = useState(thisMonth())
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [vars, setVars] = useState<VariableGroup[]>([])
  const [find, setFind] = useState('')
  const [sumifs, setSumifs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const word = kind === 'DEDUCTION' ? '공제' : '수당'
  /** 원본 계산식등록 줄 끝 [조건] — 켜면 조건1 · [참1] · [거짓1] 세 줄. 지금 커서가 있는 줄 */
  const [cond, setCond] = useState(false)
  const [parts, setParts] = useState<[string, string, string]>(['', '', ''])
  const [line, setLine] = useState(0)
  const partsRef = useRef<[string, string, string]>(['', '', ''])
  const partRefs = useRef<(HTMLTextAreaElement | null)[]>([])
  const changePart = (i: number, v: string, caret = v.length) => {
    const next = [...partsRef.current] as [string, string, string]
    next[i] = v
    partsRef.current = next
    caretRef.current = caret
    setParts(next)
  }
  const taRef = useRef<HTMLTextAreaElement>(null)
  /** 지금 칸의 글자 — 계산도구를 잇달아 누르면 state 가 아직 안 바뀐 채라 앞 글자를 덮었다. 이 ref 로 이어 붙인다. */
  const textRef = useRef('')
  const caretRef = useRef(0)
  const changeText = (v: string, caret = v.length) => { textRef.current = v; caretRef.current = caret; setText(v) }
  const rows = formulas.filter((f) => f.payItemId === item.id)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))

  useEffect(() => {
    api.get<VariableGroup[]>('/pay-settings/formula-variables', { params: { kind } }).then((r) => setVars(r.data)).catch(() => setVars([]))
  }, [])

  function open(f: PayItemFormula | null) {
    setEditing(f)
    setFrom(f ? f.effectiveFrom : thisMonth())
    const split = f ? splitCondition(f.formula) : null
    setCond(!!split)
    partsRef.current = split ?? ['', '', '']
    setParts(partsRef.current)
    setLine(0)
    changeText(f && !split ? f.formula : '')
    setError(null)
    setMode('edit')
  }

  function insert(token: string) {
    if (cond) {
      const cur = partsRef.current[line]
      const at = Math.min(caretRef.current, cur.length)
      changePart(line, cur.slice(0, at) + token + cur.slice(at), at + token.length)
      requestAnimationFrame(() => {
        const ta = partRefs.current[line]
        if (!ta) return
        ta.focus()
        ta.selectionStart = ta.selectionEnd = caretRef.current
      })
      return
    }
    const cur = textRef.current
    const at = Math.min(caretRef.current, cur.length)
    changeText(cur.slice(0, at) + token + cur.slice(at), at + token.length)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.selectionStart = ta.selectionEnd = caretRef.current
    })
  }

  async function save() {
    setError(null)
    const body = { effectiveFrom: from, formula: cond ? joinCondition(...parts) : text }
    try {
      if (editing) await api.put(`/pay-settings/formulas/${editing.id}`, body)
      else await api.post(`/pay-settings/items/${item.id}/formulas`, body)
      onChanged()
      setMode('list')
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function toggle() {
    setError(null)
    try {
      for (const id of checked) await api.post(`/pay-settings/formulas/${id}/toggle-active`)
      setChecked(new Set())
      onChanged()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const [year, month] = from.split('-')
  const years = Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() + 1 - i))

  if (mode === 'list') {
    return (
      <Modal open title="계산식리스트" onClose={onClose} width={720} error={error}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[34px]"></th>
              <th className="w-[120px]">적용시점</th>
              <th>계산식</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="ec-empty">등록된 계산식이 없습니다.</td></tr>}
            {rows.map((f, n) => (
              <tr key={f.id} className={f.active ? undefined : 'text-ec-hint'}>
                <td className="text-center text-ec-hint">{n + 1}</td>
                <td className="text-center">
                  <input type="checkbox" checked={checked.has(f.id)} onChange={() => {
                    const next = new Set(checked)
                    if (next.has(f.id)) next.delete(f.id); else next.add(f.id)
                    setChecked(next)
                  }} />
                </td>
                <td><button type="button" className="ec-link" onClick={() => open(f)}>{showMonth(f.effectiveFrom)} ~</button></td>
                <td><button type="button" className="ec-link text-left" onClick={() => open(f)}>{f.formula}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => open(null)}>신규(F2)</button>
          <button type="button" className="ec-btn" disabled={checked.size === 0} onClick={toggle}>사용중단/재사용</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
    )
  }

  const q = find.trim()
  return (
    <Modal open title="계산식등록" onClose={onClose} width={980} error={error}>
      <div className="flex gap-[12px] mobile:flex-col">
        <div className="flex-1 min-w-0">
          <ul className="ec-form">
            <li className="wide"><span className="title">{word}항목코드</span><div className="form">{item.code}</div></li>
            <li className="wide"><span className="title">{word}항목명</span><div className="form">{item.name}</div></li>
            <li className="wide">
              <span className="title">적용시점</span>
              <div className="form flex items-center gap-[6px]">
                <select className="ec-input w-[90px]" aria-label="적용시점 연도" value={year}
                        onChange={(e) => setFrom(`${e.target.value}-${month}`)}>
                  {(years.includes(year) ? years : [year, ...years]).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="ec-input w-[70px]" aria-label="적용시점 월" value={month}
                        onChange={(e) => setFrom(`${year}-${e.target.value}`)}>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </li>
            <li className="wide">
              <span className="title">계산식예시</span>
              <div className="form text-ec-hint">
                <div>소수 첫째 자리에서 반올림 : R(계산식, 0)</div>
                <div>정수 첫째 자리에서 반올림 : R(계산식, -1)</div>
                <div>* 절상(C)절사(F)로 대체 가능하며, -5~2 범위값만 허용됩니다.</div>
              </div>
            </li>
          </ul>
          <table className="w-full text-left mt-[8px]">
            <thead>
              <tr>
                {cond && <th className="w-[70px]">구분</th>}
                <th>계산식등록</th>
                <th className="w-[44px] text-center">조건</th>
              </tr>
            </thead>
            <tbody>
              {!cond && (
                <tr>
                  <td>
                    <textarea ref={taRef} className="ec-input w-full h-[72px]" aria-label="계산식" value={text}
                              onChange={(e) => changeText(e.target.value, e.target.selectionStart)}
                              onSelect={(e) => { caretRef.current = e.currentTarget.selectionStart }} />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" aria-label="조건" checked={false} onChange={() => {
                      partsRef.current = [textRef.current, '', '']
                      setParts(partsRef.current)
                      setLine(0)
                      setCond(true)
                    }} />
                  </td>
                </tr>
              )}
              {cond && (['조건1', '[참1]', '[거짓1]'] as const).map((label, i) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>
                    <textarea ref={(el) => { partRefs.current[i] = el }} className="ec-input w-full h-[40px]"
                              aria-label={`계산식 ${label}`} value={parts[i]}
                              onFocus={() => setLine(i)}
                              onChange={(e) => changePart(i, e.target.value, e.target.selectionStart)}
                              onSelect={(e) => { setLine(i); caretRef.current = e.currentTarget.selectionStart }} />
                  </td>
                  <td className="text-center">
                    {i === 0 && (
                      <input type="checkbox" aria-label="조건" checked onChange={() => {
                        changeText(partsRef.current[0])
                        setCond(false)
                      }} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px] mb-[4px] font-bold">계산도구</div>
          <div className="grid grid-cols-3 gap-[4px] mobile:grid-cols-2">
            {TOOLS.slice(0, 10).map(([token, label]) => (
              <button key={token + label} type="button" className="ec-btn ec-btn-sm justify-start"
                      onClick={() => insert(token)}>{token.trim()} {label}</button>
            ))}
            <button type="button" className="ec-btn ec-btn-sm justify-start" onClick={() => setSumifs(true)}>SUMIFS( 조건부 합계</button>
            {TOOLS.slice(10).map(([token, label]) => (
              <button key={token + label} type="button" className="ec-btn ec-btn-sm justify-start"
                      onClick={() => insert(token)}>{token.trim()} {label}</button>
            ))}
          </div>
          {cond && (
            <>
              <div className="mt-[8px] mb-[4px] font-bold">계산도구 (조건)</div>
              <div className="grid grid-cols-3 gap-[4px] mobile:grid-cols-2">
                {COND_TOOLS.map((t) => (
                  <button key={t} type="button" className="ec-btn ec-btn-sm justify-start"
                          onClick={() => insert(` ${t} `)}>{t}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="w-[320px] mobile:w-full">
          <input className="ec-input w-full mb-[6px]" placeholder="찾기(F3)" value={find} onChange={(e) => setFind(e.target.value)} />
          <div className="max-h-[360px] overflow-auto">
            {vars.map((g) => {
              const names = g.names.filter((n) => !q || n.includes(q))
              if (names.length === 0) return null
              return (
                <div key={g.group} className="mb-[6px]">
                  <div className="font-bold">{g.group}</div>
                  {names.map((n) => (
                    <button key={n} type="button" className="ec-link block text-left" onClick={() => insert(n)}>{n}</button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={() => open(editing)}>다시 작성</button>
        <button type="button" className="ec-btn" onClick={() => { setMode('list'); setError(null) }}>리스트</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
      {sumifs && <SumifsModal onClose={() => setSumifs(false)} onApply={(t) => { setSumifs(false); insert(t) }} />}
    </Modal>
  )
}

const SUMIFS_TARGETS = [['수당', '수당금액', '수당항목코드'], ['공제', '공제금액', '공제항목코드']] as const
const SUMIFS_BASES = [
  '귀속연도동일(이번 지급사항 제외)', '귀속연도 동일(~귀속연월)(이번지급사항제외)', '귀속연월동일(이번 지급사항 제외)',
]

/**
 * 원본 계산도구 [SUMIFS( 조건부 합계] 창 '조건부 합계검색'(2026-10-13 실측): 합산대상 · 합산기준 · 조건 1~5, 적용(F8) · 닫기.
 * 적용하면 SumIfs(공제,항목금액,합산기준 in (＂귀속연월동일(이번 지급사항 제외)＂),공제항목코드 in ("07","99")) 를 넣는다.
 * 원본 합산대상은 수당금액 · 비과세금액 · 감면금액 · 공제금액 · … · 실지급액, 합산기준에는 정산기간도, 조건에는 수당구분 · 비과세유형코드 ·
 * 월정급여여부 · 연결계정 · 항목금액도 있는데 우리는 우리 급여명세로 셀 수 있는 수당 · 공제 금액 × 귀속연도 · 연월 × 항목코드만 둔다.
 */
function SumifsModal({ onClose, onApply }: { onClose: () => void; onApply: (token: string) => void }) {
  const [target, setTarget] = useState(0)
  const [basis, setBasis] = useState(SUMIFS_BASES[0])
  const [items, setItems] = useState<{ code: string; name: string; kind: string }[]>([])
  const [codes, setCodes] = useState<Set<string>>(new Set())
  const [word, label, condName] = SUMIFS_TARGETS[target]
  useEffect(() => {
    api.get<{ code: string; name: string; kind: string }[]>('/pay-settings/items').then((r) => setItems(r.data)).catch(() => setItems([]))
  }, [])
  const mine = items.filter((i) => i.kind === (target === 0 ? 'ALLOWANCE' : 'DEDUCTION'))
  function apply() {
    const cond = codes.size ? `,${condName} in (${[...codes].map((c) => `"${c}"`).join(',')})` : ''
    onApply(`SumIfs(${word},항목금액,합산기준 in (＂${basis}＂)${cond}) `)
  }
  return (
    <Modal open title="조건부 합계검색" onClose={onClose} width={640}>
      <ul className="ec-form">
        <li className="wide">
          <span className="title">합산대상</span>
          <div className="form">
            <select className="ec-input w-full" aria-label="합산대상" value={target}
                    onChange={(e) => { setTarget(Number(e.target.value)); setCodes(new Set()) }}>
              {SUMIFS_TARGETS.map((t, i) => <option key={t[0]} value={i}>{t[1]}</option>)}
            </select>
          </div>
        </li>
        <li className="wide">
          <span className="title">합산기준</span>
          <div className="form">
            <select className="ec-input w-full" aria-label="합산기준" value={basis} onChange={(e) => setBasis(e.target.value)}>
              {SUMIFS_BASES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </li>
        <li className="wide">
          <span className="title">조건 1</span>
          <div className="form">
            <div className="mb-[4px]">{label === '수당금액' ? '수당항목코드' : '공제항목코드'}</div>
            {mine.map((i) => (
              <label key={i.code} className="inline-flex items-center gap-[4px] mr-[12px]">
                <input type="checkbox" checked={codes.has(i.code)} onChange={() => {
                  const next = new Set(codes)
                  if (next.has(i.code)) next.delete(i.code); else next.add(i.code)
                  setCodes(next)
                }} />
                {i.code} {i.name}
              </label>
            ))}
          </div>
        </li>
      </ul>
      <div className="flex flex-wrap gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
