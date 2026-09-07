/**
 * 오류 문구 추출 테스트.
 *
 *   npm run test:unit
 *
 * 거의 모든 화면이 extractErrorMessage 로 오류를 보여 준다. 여기가 뭉개지면
 * 쓰는 사람은 <b>자기 입력이 잘못된 건지 서버가 죽은 건지</b> 알 수 없고,
 * 같은 버튼만 계속 누르게 된다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AxiosError, AxiosHeaders } from 'axios'
import { extractErrorMessage } from './client.ts'

/** 백엔드가 보낸 오류 응답을 흉내 낸다. */
const withResponse = (status: number, data: unknown) => {
  const e = new AxiosError('Request failed')
  e.response = {
    status,
    statusText: '',
    data,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return e
}

/** 응답이 아예 없는 경우 — 서버가 안 떴거나 네트워크가 끊겼다. */
const noResponse = (code?: string) => {
  const e = new AxiosError('Network Error')
  e.code = code
  return e
}

test('백엔드 message 를 그대로 보여 준다', () => {
  assert.equal(
    extractErrorMessage(withResponse(409, { message: '재고이동 내역에서 쓰고 있어 지울 수 없습니다.' })),
    '재고이동 내역에서 쓰고 있어 지울 수 없습니다.')
})

test('서버가 안 떴을 때는 그렇다고 말한다', () => {
  const msg = extractErrorMessage(noResponse())
  assert.match(msg, /서버에 연결할 수 없습니다/)
  assert.notEqual(msg, '오류가 발생했습니다.')
})

test('시간 초과는 연결 실패와 구분한다', () => {
  assert.match(extractErrorMessage(noResponse('ECONNABORTED')), /너무 늦습니다/)
})

test('응답은 왔는데 message 가 없으면 상태코드라도 알려 준다', () => {
  assert.match(extractErrorMessage(withResponse(500, {})), /HTTP 500/)
  assert.match(extractErrorMessage(withResponse(502, '')), /HTTP 502/)
})

test('message 가 문자열이 아니면 그대로 쓰지 않는다 — [object Object] 방지', () => {
  const msg = extractErrorMessage(withResponse(400, { message: { field: '품목' } }))
  assert.doesNotMatch(msg, /object Object/)
  assert.match(msg, /HTTP 400/)
})

test('message 가 빈 문자열이면 없는 것으로 본다', () => {
  assert.match(extractErrorMessage(withResponse(400, { message: '   ' })), /HTTP 400/)
})

test('화면 코드가 던진 Error 는 그 메시지를 살린다', () => {
  assert.equal(extractErrorMessage(new Error('출하수량이 잔량을 초과합니다.')),
    '출하수량이 잔량을 초과합니다.')
})

test('아무것도 아닌 값은 기본 문구', () => {
  assert.equal(extractErrorMessage(null), '오류가 발생했습니다.')
  assert.equal(extractErrorMessage(undefined), '오류가 발생했습니다.')
  assert.equal(extractErrorMessage('그냥 문자열'), '오류가 발생했습니다.')
  assert.equal(extractErrorMessage(new Error('')), '오류가 발생했습니다.')
})

test('기본 문구는 호출부가 바꿀 수 있다', () => {
  assert.equal(extractErrorMessage(null, '불러오지 못했습니다.'), '불러오지 못했습니다.')
})
