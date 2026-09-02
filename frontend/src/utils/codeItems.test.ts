import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partnerCodeItem, partnerSearchText } from './codeItems.ts'

const P = {
  id: 7, code: '7502101448', name: '(만카토)MANKATO',
  ceoName: '함승학', phone: '070-8839-0727', bizType: '도소매', bizItem: '전자부품',
  address: '인천광역시 동구 방축로83번길 23', searchKeyword: 'MKT',
  partnerGroupName: '수출', typeName: '매출',
}

test('사람이 기억하는 단서가 다 검색 대상에 들어간다', () => {
  const t = partnerSearchText(P)
  for (const w of ['함승학', '0727', '도소매', '전자부품', '인천광역시']) {
    assert.ok(t.includes(w), `${w} 가 빠졌다`)
  }
})

test('빈 값은 빼고 잇는다', () => {
  // 안 빼면 구분자만 남은 줄이 되어 아무 낱말에나 걸린다.
  const t = partnerSearchText({ id: 1, code: 'C', name: 'N', ceoName: '', phone: null })
  assert.equal(t, '')
  const t2 = partnerSearchText({ id: 1, code: 'C', name: 'N', ceoName: '  ', phone: '02-1' })
  assert.equal(t2, '02-1')
})

test('코드도움 한 줄의 모양', () => {
  const it = partnerCodeItem(P)
  assert.equal(it.value, '7')
  assert.equal(it.code, '7502101448')
  assert.equal(it.name, '(만카토)MANKATO')
  assert.equal(it.alias, 'MKT')            // 원본 [검색창내용]
  assert.equal(it.sub, '수출')              // 그룹이 있으면 그룹, 없으면 구분
})

test('그룹이 없으면 거래처구분을 보여 준다', () => {
  const it = partnerCodeItem({ id: 1, code: 'C', name: 'N', typeName: '매입' })
  assert.equal(it.sub, '매입')
})

test('검색창내용이 없으면 alias 는 null 이다', () => {
  // 빈 문자열로 두면 아무 검색어에나 걸린다.
  const it = partnerCodeItem({ id: 1, code: 'C', name: 'N' })
  assert.equal(it.alias, null)
})
