import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actualConsume, materialDiff, standardConsume, stdVsActual, workTime } from './woEfficiency.ts'

const price = (m: Record<number, number | null>) => (id: number) => (id in m ? m[id] : null)

test('표준소모는 BOM 소요량 × 생산수량 × 단가', () => {
  const t = standardConsume([{ componentId: 1, quantity: 2 }, { componentId: 2, quantity: 0.5 }], 10,
    price({ 1: 100, 2: 400 }))
  assert.equal(t.amount, 4000)      // 2×10×100 + 0.5×10×400
  assert.equal(t.unknown, 0)
})

test('실제소모는 투입한 수량 그대로', () => {
  const t = actualConsume([{ componentId: 1, quantity: 25 }], price({ 1: 100 }))
  assert.equal(t.amount, 2500)
})

test('단가를 모르는 자재는 0으로 세지 않고 빼고 센다', () => {
  // 0으로 채우면 자재를 두 배 썼는데 차이가 0으로 보인다.
  const t = actualConsume([{ componentId: 1, quantity: 25 }, { componentId: 9, quantity: 5 }],
    price({ 1: 100 }))
  assert.equal(t.amount, 2500)
  assert.equal(t.unknown, 1)
})

test('수량이 0 인 자재는 단가를 몰라도 문제 삼지 않는다', () => {
  const t = actualConsume([{ componentId: 9, quantity: 0 }], price({}))
  assert.equal(t.unknown, 0)
})

test('생산수량이 0 이면 표준소모도 0', () => {
  assert.equal(standardConsume([{ componentId: 1, quantity: 3 }], 0, price({ 1: 100 })).amount, 0)
})

test('자재별 차이 — 더 쓴 것은 음수, 아낀 것은 양수', () => {
  const rows = materialDiff(
    [{ componentId: 1, componentName: 'A', quantity: 2 }],
    [{ componentId: 1, componentName: 'A', quantity: 25 }],
    10, price({ 1: 100 }),
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].stdQty, 20)
  assert.equal(rows[0].actualQty, 25)
  assert.equal(rows[0].diffAmount, -500)      // 5개 더 썼다
})

test('BOM 에 없는데 투입한 자재도 한 줄로 나온다', () => {
  const rows = materialDiff(
    [{ componentId: 1, componentName: 'A', quantity: 1 }],
    [{ componentId: 2, componentName: 'B', quantity: 3 }],
    5, price({ 1: 100, 2: 200 }),
  )
  assert.deepEqual(rows.map((r) => r.componentName), ['A', 'B'])
  assert.equal(rows[0].actualQty, 0)          // BOM 에 있는데 안 썼다
  assert.equal(rows[1].stdQty, 0)             // BOM 에 없는데 썼다
  assert.equal(rows[1].diffAmount, -600)
})

test('같은 자재가 여러 줄이면 합쳐 센다', () => {
  const rows = materialDiff(
    [{ componentId: 1, componentName: 'A', quantity: 1 }],
    [{ componentId: 1, quantity: 2 }, { componentId: 1, quantity: 3 }],
    4, price({ 1: 10 }),
  )
  assert.equal(rows[0].stdQty, 4)
  assert.equal(rows[0].actualQty, 5)
})

test('단가를 모르면 금액이 null 이다 — 0 이 아니다', () => {
  const rows = materialDiff([{ componentId: 7, componentName: 'X', quantity: 1 }], [], 3, price({}))
  assert.equal(rows[0].stdAmount, null)
  assert.equal(rows[0].diffAmount, null)
})

test('표준시간은 실제로 만든 수량에 비례한다', () => {
  // 계획수량으로 곱하면 절반만 만든 작업지시가 늘 "시간을 아꼈다"고 나온다.
  const t = workTime([{ qty: 10, minutes: 100, stdMinPerUnit: 12 }])
  assert.equal(t.standard, 120)
  assert.equal(t.actual, 100)
})

test('표준시간을 모르는 작업은 표준에서 빼고 센다', () => {
  const t = workTime([
    { qty: 10, minutes: 100, stdMinPerUnit: 12 },
    { qty: 5, minutes: 40, stdMinPerUnit: null },
  ])
  assert.equal(t.standard, 120)
  assert.equal(t.actual, 140)     // 실제시간은 다 더한다
  assert.equal(t.unknown, 1)
})

test('stdVsActual — 표준을 모르는 줄은 차이에 안 넣는다', () => {
  const t = stdVsActual([
    { standard: 60, actual: 50 },
    { standard: 30, actual: 45 },
    { standard: null, actual: 200 },   // 라우팅 없음
  ])
  assert.equal(t.standard, 90)
  assert.equal(t.actual, 295)          // 실제시간은 다 더한다
  assert.equal(t.diff, -5)             // (60-50) + (30-45). 200 은 안 들어간다
  assert.equal(t.unknown, 1)
})

test('stdVsActual — diff 는 합계끼리의 뺄셈이 아니다', () => {
  const t = stdVsActual([{ standard: null, actual: 100 }])
  assert.equal(t.diff, 0)              // standard-actual 로 계산했으면 -100 이 됐다
  assert.equal(t.actual, 100)
})

test('stdVsActual — 양수면 표준보다 빨리 끝냈다', () => {
  assert.equal(stdVsActual([{ standard: 100, actual: 70 }]).diff, 30)
})
