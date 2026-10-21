import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText, isBlankHtml, isHtml, textToHtml } from './richText.ts'

test('글자 본문은 문단으로, 태그 본문은 그대로', () => {
  assert.equal(isHtml('a\nb'), false)
  assert.equal(textToHtml('a\n\nb'), '<p>a</p><p><br></p><p>b</p>')
  assert.equal(textToHtml('<p>x</p>'), '<p>x</p>')
})

test('HTML → 글자, 빈 본문 판정', () => {
  assert.equal(htmlToText('<p><b>굵은글</b> 보통</p><p>둘째</p>'), '굵은글 보통\n둘째')
  assert.equal(isBlankHtml('<p></p><p><br></p>'), true)
  assert.equal(isBlankHtml('<p>x</p>'), false)
})
