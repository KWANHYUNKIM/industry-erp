/**
 * 인쇄 HTML 이스케이프 테스트.
 *
 *   npm run test:unit
 *
 * 인쇄 창은 우리가 문자열로 조립한 HTML 을 그대로 띄운다. 거래처명·적요·품목명에
 * 들어온 글자가 태그나 속성으로 읽히면 서식이 깨진다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml } from './escapeHtml.ts'

test('태그로 읽힐 글자를 막는다', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;')
  assert.equal(escapeHtml('a < b > c'), 'a &lt; b &gt; c')
})

test('따옴표도 막는다 — 속성 안에서 값이 밖으로 빠져나간다', () => {
  // class="${v}" 자리에 따옴표가 그대로 들어가면 그 뒤를 속성으로 읽는다.
  assert.equal(escapeHtml('"'), '&quot;')
  assert.equal(escapeHtml("'"), '&#39;')
  assert.equal(escapeHtml('a" onclick="x'), 'a&quot; onclick=&quot;x')
})

test('& 를 먼저 바꿔야 이중 이스케이프가 안 생긴다', () => {
  // '&' 를 나중에 바꾸면 앞서 만든 &lt; 가 &amp;lt; 로 두 번 바뀐다.
  assert.equal(escapeHtml('&'), '&amp;')
  assert.equal(escapeHtml('&<'), '&amp;&lt;')
  assert.equal(escapeHtml('AT&T <주>'), 'AT&amp;T &lt;주&gt;')
})

test('null·undefined 는 빈 문자열 — "null" 이 찍히면 안 된다', () => {
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})

test('숫자·불리언은 문자열로 바꿔서 낸다', () => {
  assert.equal(escapeHtml(0), '0')
  assert.equal(escapeHtml(1234), '1234')
  assert.equal(escapeHtml(false), 'false')
})

test('바꿀 게 없으면 그대로', () => {
  assert.equal(escapeHtml('주식회사 팜인'), '주식회사 팜인')
  assert.equal(escapeHtml(''), '')
})

test('여러 번 나와도 모두 바꾼다', () => {
  assert.equal(escapeHtml('<<>>'), '&lt;&lt;&gt;&gt;')
})
