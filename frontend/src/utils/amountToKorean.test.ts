/**
 * 금액 한글 표기 테스트.
 *
 *   npm run test:unit
 *
 * 거래명세서·견적서·발주서 하단의 "일금 …원정" 칸이다. 이 칸은 <b>금액 위조를 막으려고</b>
 * 있다 — 숫자 앞에 글자를 덧붙여 금액을 키우지 못하게 하는 수표·어음 표기법을 따른다.
 * 그래서 여기가 비거나 잘리면 칸을 두는 이유가 통째로 무너진다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amountToKorean } from './amountToKorean.ts'

test('자릿수의 1 도 적는다 — 수표 표기법', () => {
  // 일상 표기라면 '십일'이지만, 앞에 글자를 덧붙일 틈을 주지 않으려고 '일십일'로 적는다.
  assert.equal(amountToKorean(10), '일십')
  assert.equal(amountToKorean(11), '일십일')
  assert.equal(amountToKorean(100), '일백')
  assert.equal(amountToKorean(1000), '일천')
  assert.equal(amountToKorean(10000), '일만')
})

test('만·억·조 경계', () => {
  assert.equal(amountToKorean(1_230_000), '일백이십삼만')
  assert.equal(amountToKorean(100_000_000), '일억')
  assert.equal(amountToKorean(1_000_000_000_000), '일조')
  // 중간 자리가 0 이면 그 묶음은 통째로 건너뛴다 — '일억영만일'처럼 적지 않는다
  assert.equal(amountToKorean(100_010_000), '일억일만')
  assert.equal(amountToKorean(10_001), '일만일')
})

test('0 과 소수', () => {
  assert.equal(amountToKorean(0), '영')
  // 원 단위 아래는 버린다(전표 금액은 원 단위다)
  assert.equal(amountToKorean(1234.9), '일천이백삼십사')
})

test('음수는 마이너스를 앞에 붙인다', () => {
  assert.equal(amountToKorean(-50_000), '마이너스 오만')
})

test('숫자가 아니면 빈칸으로 두지 않는다', () => {
  // 예전에는 NaN 이 오면 빈 문자열이 나왔다. 위조 방지 칸이 비면 뒤에 아무 글자나
  // 채워 넣을 수 있어서, 잘못된 값을 드러내는 편이 낫다.
  for (const bad of [NaN, Infinity, -Infinity, Number(undefined)]) {
    const out = amountToKorean(bad)
    assert.notEqual(out.trim(), '', `${bad} 가 빈칸이 됐다`)
    assert.match(out, /금액 없음/)
  }
})

test('표기할 수 없는 큰 금액은 조용히 자르지 않는다', () => {
  // 경(10^16)까지만 이름이 있다. 그 위를 그냥 두면 윗자리가 잘려
  // 실제보다 작은 금액이 찍힌다 — 위조 방지 칸에서 제일 나쁜 실패다.
  assert.equal(amountToKorean(1e16), '일경')
  const out = amountToKorean(1e20)
  assert.notEqual(out.trim(), '')
  assert.match(out, /범위 초과/)
})
