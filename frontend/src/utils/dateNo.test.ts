/** [일자-No.] — npm run test:unit */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateNo } from './dateNo.ts'

test('끝 일련번호만, 앞 0 은 지운다', () => {
  assert.equal(dateNo('2026-07-14', 'GL-20260714-0005'), '2026/07/14 -5')
  assert.equal(dateNo('2026-09-28', 'GL-20260928-0012'), '2026/09/28 -12')
})

test('끝이 숫자가 아니면 그대로', () => {
  assert.equal(dateNo('2026-07-14', 'ABC'), '2026/07/14 -ABC')
})
