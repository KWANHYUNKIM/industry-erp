import { useState, type InputHTMLAttributes } from 'react'
import { flushSync } from 'react-dom'
import { withCommas } from '../utils/lineSupply'

/**
 * 천 단위 쉼표를 찍는 숫자 입력칸 — 원본 전표 격자의 수량 · 단가 · 공급가액 · 부가세 칸 모양.
 *
 * <p>2026-10-06 loginaa 판매입력: 공급가액 칸은 1,009 처럼 쉼표로 보이고 단가 333.5 는 소수를 그대로 둔다.
 * {@code type="number"} 칸은 쉼표를 찍을 수 없어 1009 로 보였다. 고치는 동안에는 맨 숫자를 보여
 * 쉼표가 끼어들며 커서가 튀지 않게 하고, 칸을 떠나면 쉼표를 찍는다. 값(문자열)에는 쉼표를 넣지 않는다.
 *
 * <p>2026-10-29(데이터이관 QA 루프 77, 잔액실사 실잔액): 부모가 값을 숫자로 들고 있으면 치는 중인 '-' · '1.' 이 ''/1 로 돌아와
 * '-' 를 먼저 치면 칸이 비워졌다. 고치는 동안은 친 글자(draft)를 들고 있다가, 부모 값이 같은 수를 뜻하면 친 글자를 보인다
 * (부모가 값을 다르게 바꾸면 부모 값을 보인다).
 */
const same = (a: string, b: string) => {
  const n = (s: string) => (s === '' || s === '-' || s === '.' || s === '-.' ? '' : String(Number(s)))
  return n(a) === n(b)
}
export default function EcNumInput({ value, onValue, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValue: (raw: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={focused ? (same(draft, value) ? draft : value) : withCommas(value)}
      // 원본 격자(2026-10-27 loginaa 주문서입력 단가 1,700,000 칸을 눌러 5 → 5): 칸에 들어가면 값 전체가 골라져 치는 값이 바꾼다.
      // 쉼표를 뗀 값으로 다시 그린 뒤에 골라야 선택이 풀리지 않는다.
      // 2026-10-29: rAF 로 미루면 Tab 직후 바로 치는 글자가 선택 전에 붙었다(30,000 → 3,000,030,000) — 동기로 다시 그린 뒤 바로 고른다.
      onFocus={(e) => { const t = e.currentTarget; flushSync(() => { setDraft(value); setFocused(true) }); t.select(); rest.onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
      onChange={(e) => { const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.\-]/g, ''); setDraft(raw); onValue(raw) }}
    />
  )
}
