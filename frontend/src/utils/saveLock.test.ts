/**
 * 저장 중복 잠금 — 저장 두 번 = 전표 두 장 · 재고 두 번 출고를 막는다(docs/백엔드-API-설계.md P6).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSaveLock } from './saveLock.ts'

/** 손으로 돌리는 setTimeout(0) · 도는 요청 수 */
function harness() {
  const queue: Array<() => void> = []
  let n = 0
  let waiters: Array<() => void> = []
  const lock = createSaveLock({
    inFlight: () => n,
    onIdle: (fn) => { if (n === 0) { fn(); return () => {} } waiters.push(fn); return () => { waiters = waiters.filter((w) => w !== fn) } },
    later: (fn) => { queue.push(fn) },
  })
  const tick = () => { const q = queue.splice(0); q.forEach((f) => f()) }
  const start = () => { n++ }
  const finish = () => { n--; if (n === 0) { const w = waiters; waiters = []; w.forEach((f) => f()) } }
  return { lock, tick, start, finish }
}

test('같은 작업 안(click → submit)은 한 번의 누름으로 통과', () => {
  const h = harness()
  assert.equal(h.lock.tryLock(), true)
  assert.equal(h.lock.tryLock(), true)
})

test('요청이 도는 동안 두 번째 저장은 버린다 · 끝나면 다시 받는다', () => {
  const h = harness()
  assert.equal(h.lock.tryLock(), true)
  h.start()              // 화면이 저장 요청을 냈다
  h.tick()               // 다음 작업 — 사용자가 한 번 더 누른다
  assert.equal(h.lock.tryLock(), false)
  h.finish()             // 응답
  assert.equal(h.lock.isLocked(), true)   // 바로 풀지 않는다(다음 요청이 이어질 수 있다)
  h.tick()
  assert.equal(h.lock.isLocked(), false)
  assert.equal(h.lock.tryLock(), true)
})

test('조회 → 저장으로 이어지는 사이에 풀리지 않는다', () => {
  const h = harness()
  h.lock.tryLock()
  h.start(); h.tick()    // 통제 확인(조회)
  h.finish(); h.start()  // 응답 직후 같은 작업에서 저장 요청
  h.tick()
  assert.equal(h.lock.tryLock(), false)
  h.finish(); h.tick()
  assert.equal(h.lock.isLocked(), false)
})

test('요청을 안 낸 저장(입력 오류)은 바로 다음 작업에서 풀린다', () => {
  const h = harness()
  h.lock.tryLock()
  h.tick()
  assert.equal(h.lock.isLocked(), false)
})
