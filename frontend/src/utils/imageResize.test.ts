import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin, isResizableImage, needsRecode, outputType, renameFor } from './imageResize.ts'

test('긴 변이 기준 안이면 크기 그대로', () => {
  assert.deepEqual(fitWithin(1200, 800, 1600), { width: 1200, height: 800 })
  assert.deepEqual(fitWithin(1600, 1600, 1600), { width: 1600, height: 1600 })
})

test('긴 변을 기준에 맞추고 비율을 지킨다(가로 · 세로)', () => {
  assert.deepEqual(fitWithin(4032, 3024, 1600), { width: 1600, height: 1200 })
  assert.deepEqual(fitWithin(3024, 4032, 1600), { width: 1200, height: 1600 })
})

test('아주 가는 그림도 0px 이 되지 않는다', () => {
  assert.deepEqual(fitWithin(10000, 1, 1600), { width: 1600, height: 1 })
})

test('JPEG · PNG · WebP 만 줄인다 — GIF · SVG · PDF 는 그대로', () => {
  assert.ok(isResizableImage('image/jpeg'))
  assert.ok(isResizableImage('image/PNG'))
  assert.ok(isResizableImage('image/webp'))
  assert.ok(!isResizableImage('image/gif'))
  assert.ok(!isResizableImage('image/svg+xml'))
  assert.ok(!isResizableImage('application/pdf'))
  assert.ok(!isResizableImage(''))
})

test('투명한 PNG · WebP 는 형식을 지키고, 나머지는 JPEG', () => {
  assert.equal(outputType('image/png', true), 'image/png')
  assert.equal(outputType('image/webp', true), 'image/webp')
  assert.equal(outputType('image/png', false), 'image/jpeg')
  assert.equal(outputType('image/jpeg', false), 'image/jpeg')
})

test('형식이 바뀌면 확장자만 바꾼다', () => {
  assert.equal(renameFor('견적 사진.PNG', 'image/png', 'image/jpeg'), '견적 사진.jpg')
  assert.equal(renameFor('logo.png', 'image/png', 'image/png'), 'logo.png')
  assert.equal(renameFor('IMG_0001.jpeg', 'image/jpeg', 'image/jpeg'), 'IMG_0001.jpeg')
  assert.equal(renameFor('확장자없음', 'image/webp', 'image/jpeg'), '확장자없음.jpg')
  assert.equal(renameFor('a.b.webp', 'image/webp', 'image/jpeg'), 'a.b.jpg')
})

test('작고 기준 안인 그림은 다시 그리지 않는다', () => {
  assert.equal(needsRecode(100 * 1024, 800, 600, 1600), false)
  assert.equal(needsRecode(100 * 1024, 2000, 600, 1600), true)
  assert.equal(needsRecode(3 * 1024 * 1024, 1200, 900, 1600), true)
})
