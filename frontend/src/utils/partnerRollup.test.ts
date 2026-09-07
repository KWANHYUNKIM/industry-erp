import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rollupOf, toRollupMap } from './partnerRollup.ts'

const 본사 = { id: 1, name: '대신화물', parentId: null, parentName: null }
const 지점 = { id: 2, name: '대신화물 대전신일점', parentId: 1, parentName: '대신화물' }
const 독립 = { id: 3, name: '금호철망', parentId: null, parentName: null }
const map = toRollupMap([본사, 지점, 독립])

const E = (partnerId: number, partnerName: string) => ({ partnerId, partnerName })

test('개별거래처기준은 전표에 찍힌 거래처 그대로', () => {
  assert.deepEqual(rollupOf(E(2, '대신화물 대전신일점'), '개별거래처기준', map),
    { id: 2, name: '대신화물 대전신일점' })
})

test('거래처관계기준은 종속거래처를 대표 밑으로 올린다', () => {
  assert.deepEqual(rollupOf(E(2, '대신화물 대전신일점'), '거래처관계기준', map),
    { id: 1, name: '대신화물' })
})

test('대표가 없는 거래처는 자기가 곧 대표다', () => {
  assert.deepEqual(rollupOf(E(3, '금호철망'), '거래처관계기준', map),
    { id: 3, name: '금호철망' })
  assert.deepEqual(rollupOf(E(1, '대신화물'), '거래처관계기준', map),
    { id: 1, name: '대신화물' })
})

test('모르는 거래처는 올리지 않는다', () => {
  // 목록이 아직 안 왔거나 지워진 거래처. 임의의 키로 묶으면 남남인 전표가 한 덩어리가 된다.
  assert.deepEqual(rollupOf(E(99, '사라진거래처'), '거래처관계기준', map),
    { id: 99, name: '사라진거래처' })
})

test('대표 이름을 모르면 올리지 않는다', () => {
  // id 만으로는 사람이 못 읽는다 — '(미지정)' 한 덩어리가 생기는 것보다 그대로 두는 편이 낫다.
  const 반쪽 = toRollupMap([{ id: 5, name: '지점', parentId: 4, parentName: null }])
  assert.deepEqual(rollupOf(E(5, '지점'), '거래처관계기준', 반쪽), { id: 5, name: '지점' })
})
