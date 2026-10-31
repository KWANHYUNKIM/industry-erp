/** 숫자 표시 — npm run test:unit. 몸통마다 0 · 음수 · 소수 · 빈 문자열이 어떻게 찍히는지 못 박는다. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fmtAmount, fmtAmountBlank, fmtAmountNz, fmtAmountOf, fmtAmountOrDash, fmtDecimal4, fmtNumber, fmtNumberBlank, fmtNumberOf, fmtNumberOrBlank,
  fmtTrunc, fmtTruncBlankOf,
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
