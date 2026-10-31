/** 숫자 표시 — npm run test:unit. 몸통마다 0 · 음수 · 소수 · 빈 문자열이 어떻게 찍히는지 못 박는다. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fmtAmount, fmtAmountBlank, fmtAmountNz, fmtAmountOf, fmtAmountOrDash, fmtDecimal4, fmtNumber, fmtNumberBlank, fmtNumberOf, fmtNumberOrBlank,
  fmtTrunc, fmtTruncBlankOf,
  fmtNumberNz, fmtNumberBlankOf, fmtNumberOrZero, fmtNumberNullZeroBlank, fmtNumberText, fmtAmountOrBlank, fmtAmountHalfAway, fmtTruncNz,
  parseNum, parseNumPlain,
} from './format.ts'

// 서버 값이 타입과 달리 문자열 · null 로 오는 경우까지 — 지역 won 이 그때 찍던 그대로여야 한다.
const odd = (v: unknown) => v as number

test('fmtNumber — 그대로, 소수 셋째 자리, 0 은 0', () => {
  assert.equal(fmtNumber(0), '0')
  assert.equal(fmtNumber(-1234.5), '-1,234.5')
  assert.equal(fmtNumber(1234.5678), '1,234.568')
  assert.equal(fmtNumber(odd('')), '')
  assert.equal(fmtNumber(odd('1234.5')), '1234.5')   // 문자열은 바꾸지 않는다(Number 로 안 바꾼 몸통)
})

test('fmtNumberOf — Number 로 바꿔서', () => {
  assert.equal(fmtNumberOf(0), '0')
  assert.equal(fmtNumberOf(-1234.5), '-1,234.5')
  assert.equal(fmtNumberOf(0.4), '0.4')
  assert.equal(fmtNumberOf(odd('')), '0')
  assert.equal(fmtNumberOf(odd('1234.5')), '1,234.5')
})

test('fmtNumberBlank — 0 · 빈 값은 빈칸', () => {
  assert.equal(fmtNumberBlank(0), '')
  assert.equal(fmtNumberBlank(-1.5), '-1.5')
  assert.equal(fmtNumberBlank(1234.5678), '1,234.568')
  assert.equal(fmtNumberBlank(odd('')), '')
  assert.equal(fmtNumberBlank(odd(null)), '')
})

test('fmtNumberOrBlank — null 만 빈칸, 0 은 0', () => {
  assert.equal(fmtNumberOrBlank(0), '0')
  assert.equal(fmtNumberOrBlank(-1234.5), '-1,234.5')
  assert.equal(fmtNumberOrBlank(odd('')), '0')
  assert.equal(fmtNumberOrBlank(null), '')
  assert.equal(fmtNumberOrBlank(undefined), '')
})

test('fmtAmount — 반올림, 0 은 0', () => {
  assert.equal(fmtAmount(0), '0')
  assert.equal(fmtAmount(-1234.5), '-1,234')   // Math.round 는 .5 를 +쪽으로
  assert.equal(fmtAmount(-1.5), '-1')
  assert.equal(fmtAmount(1234.5678), '1,235')
  assert.equal(fmtAmount(0.4), '0')
  assert.equal(fmtAmount(odd('')), '0')
})

test('fmtAmountOf — 반올림, Number 로 바꿔서', () => {
  assert.equal(fmtAmountOf(0), '0')
  assert.equal(fmtAmountOf(-1.5), '-1')
  assert.equal(fmtAmountOf(odd('1234.5')), '1,235')
  assert.equal(fmtAmountOf(odd('')), '0')
})

test('fmtAmountBlank — 반올림, 0 만 빈칸(0.4 는 0)', () => {
  assert.equal(fmtAmountBlank(0), '')
  assert.equal(fmtAmountBlank(-1234.5), '-1,234')
  assert.equal(fmtAmountBlank(1234.5678), '1,235')
  assert.equal(fmtAmountBlank(0.4), '0')            // 반올림해서 0 이 돼도 빈칸이 아니다
  assert.equal(fmtAmountBlank(odd('')), '0')        // '' === 0 이 아니므로
})

test('fmtAmountNz — 반올림, 0 · null · NaN 은 빈칸', () => {
  assert.equal(fmtAmountNz(0), '')
  assert.equal(fmtAmountNz(null), '')
  assert.equal(fmtAmountNz(undefined), '')
  assert.equal(fmtAmountNz(NaN), '')
  assert.equal(fmtAmountNz(-1234.5), '-1,234')
  assert.equal(fmtAmountNz(0.4), '0')            // 0 이 아니면 반올림해 0 이 돼도 찍는다
})

test('fmtAmountOrDash — null 은 -, 0 은 0', () => {
  assert.equal(fmtAmountOrDash(null), '-')
  assert.equal(fmtAmountOrDash(0), '0')
  assert.equal(fmtAmountOrDash(1234.5), '1,235')
})

test('fmtTrunc — 버림, 0 은 0', () => {
  assert.equal(fmtTrunc(0), '0')
  assert.equal(fmtTrunc(1234.9), '1,234')
  assert.equal(fmtTrunc(-1234.9), '-1,234')
})

test('fmtTruncBlankOf — Number 로 바꿔 버림, 0 · 빈 값은 빈칸', () => {
  assert.equal(fmtTruncBlankOf(0), '')
  assert.equal(fmtTruncBlankOf(null), '')
  assert.equal(fmtTruncBlankOf(odd('')), '')
  assert.equal(fmtTruncBlankOf(odd('0')), '')
  assert.equal(fmtTruncBlankOf(odd('1234.9')), '1,234')
  assert.equal(fmtTruncBlankOf(0.4), '0')
})

test('fmtDecimal4 — 소수 넷째 자리, NaN 은 빈칸', () => {
  assert.equal(fmtDecimal4(0), '0')
  assert.equal(fmtDecimal4(1234.56789), '1,234.5679')
  assert.equal(fmtDecimal4(NaN), '')
  assert.equal(fmtDecimal4(Infinity), '')
})

test('fmtNumberNz — 그대로, 0 · 빈 값은 빈칸', () => {
  assert.equal(fmtNumberNz(0), '')
  assert.equal(fmtNumberNz(null), '')
  assert.equal(fmtNumberNz(NaN), '')
  assert.equal(fmtNumberNz(-1234.5), '-1,234.5')
  assert.equal(fmtNumberNz(1234.5678), '1,234.568')
  assert.equal(fmtNumberNz(odd('')), '')
  assert.equal(fmtNumberNz(odd('1234')), '1234')   // Number 로 안 바꾼 몸통
})

test('fmtNumberBlankOf — Number 로 바꿔서 0 · NaN 은 빈칸', () => {
  assert.equal(fmtNumberBlankOf(0), '')
  assert.equal(fmtNumberBlankOf(null), '')
  assert.equal(fmtNumberBlankOf(odd('')), '')
  assert.equal(fmtNumberBlankOf(odd('0')), '')
  assert.equal(fmtNumberBlankOf(odd('abc')), '')
  assert.equal(fmtNumberBlankOf(-1234.5), '-1,234.5')
  assert.equal(fmtNumberBlankOf(odd('1234.5')), '1,234.5')
})

test('fmtNumberOrZero — null 은 0', () => {
  assert.equal(fmtNumberOrZero(0), '0')
  assert.equal(fmtNumberOrZero(null), '0')
  assert.equal(fmtNumberOrZero(undefined), '0')
  assert.equal(fmtNumberOrZero(-1234.5), '-1,234.5')
  assert.equal(fmtNumberOrZero(odd('')), '0')
  assert.equal(fmtNumberOrZero(odd('1234.5')), '1,234.5')
})

test('fmtNumberNullZeroBlank — null · 0 은 빈칸, NaN 은 NaN', () => {
  assert.equal(fmtNumberNullZeroBlank(0), '')
  assert.equal(fmtNumberNullZeroBlank(null), '')
  assert.equal(fmtNumberNullZeroBlank(undefined), '')
  assert.equal(fmtNumberNullZeroBlank(odd('')), '')
  assert.equal(fmtNumberNullZeroBlank(odd('0')), '')
  assert.equal(fmtNumberNullZeroBlank(NaN), 'NaN')
  assert.equal(fmtNumberNullZeroBlank(-1234.5), '-1,234.5')
  assert.equal(fmtNumberNullZeroBlank(0.25), '0.25')
})

test('fmtNumberText — 입력 글자, 빈 글자는 빈칸', () => {
  assert.equal(fmtNumberText(''), '')
  assert.equal(fmtNumberText('0'), '0')
  assert.equal(fmtNumberText('-1234.5'), '-1,234.5')
  assert.equal(fmtNumberText('1234567'), '1,234,567')
  assert.equal(fmtNumberText('1,000'), 'NaN')
})

test('fmtAmountOrBlank — 반올림, null 만 빈칸', () => {
  assert.equal(fmtAmountOrBlank(0), '0')
  assert.equal(fmtAmountOrBlank(null), '')
  assert.equal(fmtAmountOrBlank(undefined), '')
  assert.equal(fmtAmountOrBlank(-1234.5), '-1,234')
  assert.equal(fmtAmountOrBlank(1234.5), '1,235')
  assert.equal(fmtAmountOrBlank(odd('')), '0')
  assert.equal(fmtAmountOrBlank(odd('1234.6')), '1,235')
})

test('fmtAmountHalfAway — .5 는 0 에서 먼 쪽', () => {
  assert.equal(fmtAmountHalfAway(0), '0')
  assert.equal(fmtAmountHalfAway(-2.5), '-3')
  assert.equal(fmtAmountHalfAway(2.5), '3')
  assert.equal(fmtAmountHalfAway(-1234.4), '-1,234')
  assert.equal(fmtAmountHalfAway(-0.4), '-0')       // 지역 won 그대로(-0 을 찍는다)
  assert.equal(fmtAmountHalfAway(odd(null)), '0')
  assert.equal(fmtAmountHalfAway(odd('')), '0')
})

test('fmtTruncNz — 버림, 0 · 빈 값은 빈칸', () => {
  assert.equal(fmtTruncNz(0), '')
  assert.equal(fmtTruncNz(odd(null)), '')
  assert.equal(fmtTruncNz(NaN), '')
  assert.equal(fmtTruncNz(-1234.9), '-1,234')
  assert.equal(fmtTruncNz(1234.9), '1,234')
  assert.equal(fmtTruncNz(0.4), '0')
  assert.equal(fmtTruncNz(odd('')), '')
})

test('parseNum — 콤마를 지우고, 숫자가 아니면 0', () => {
  assert.equal(parseNum('1,234,567'), 1234567)
  assert.equal(parseNum('-1,234.5'), -1234.5)
  assert.equal(parseNum('0.25'), 0.25)
  assert.equal(parseNum('0'), 0)
  assert.equal(parseNum(''), 0)
  assert.equal(parseNum('abc'), 0)
  assert.equal(parseNum(null), 0)
  assert.equal(parseNum(undefined), 0)
  assert.equal(parseNum(' 12 '), 12)
  assert.equal(parseNum(1234.5), 1234.5)
  assert.ok(Object.is(parseNum('-0'), 0))
  // 옛 지역 num 과 모든 입력에서 같다
  const old = (s: unknown) => Number(String(s).replace(/,/g, '')) || 0
  for (const v of ['1,000', '', ' ', 'x', '-0', '1e3', 'Infinity', null, undefined, 0, -3.5]) assert.equal(parseNum(v as string), old(v))
})

test('parseNumPlain — 콤마를 안 지운다, 숫자가 아니면 0', () => {
  assert.equal(parseNumPlain('1234.5'), 1234.5)
  assert.equal(parseNumPlain('-12'), -12)
  assert.equal(parseNumPlain('1,000'), 0)
  assert.equal(parseNumPlain('0'), 0)
  assert.equal(parseNumPlain(''), 0)
  assert.equal(parseNumPlain('abc'), 0)
  assert.equal(parseNumPlain(null), 0)
  assert.equal(parseNumPlain(undefined), 0)
})
