import { useState, type InputHTMLAttributes } from 'react'
import { withCommas } from '../utils/lineSupply'

/**
 * 천 단위 쉼표를 찍는 숫자 입력칸 — 원본 전표 격자의 수량 · 단가 · 공급가액 · 부가세 칸 모양.
 *
 * <p>2026-10-06 loginaa 판매입력: 공급가액 칸은 1,009 처럼 쉼표로 보이고 단가 333.5 는 소수를 그대로 둔다.
 * {@code type="number"} 칸은 쉼표를 찍을 수 없어 1009 로 보였다. 고치는 동안에는 맨 숫자를 보여
 * 쉼표가 끼어들며 커서가 튀지 않게 하고, 칸을 떠나면 쉼표를 찍는다. 값(문자열)에는 쉼표를 넣지 않는다.
 */
export default function EcNumInput({ value, onValue, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValue: (raw: string) => void
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={focused ? value : withCommas(value)}
      onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
      onChange={(e) => onValue(e.target.value.replace(/,/g, '').replace(/[^0-9.\-]/g, ''))}
    />
  )
}
