/**
 * 기간 계산 테스트.
 *
 *   node --experimental-strip-types --test frontend/src/components/periods.test.ts
 *   (또는 프로젝트 루트에서 `npm run test:unit`)
 *
 * <p>Node 22 내장 러너를 쓴다 — <b>의존성을 하나도 안 늘린다.</b> vitest·jsdom 을 넣으면
 * 컴포넌트까지 테스트할 수 있지만 그건 따로 결정할 일이고, 이 계산만은 지금 못 박아야 한다.
 * 화면 50여 곳이 이 함수들로 조회 기간을 정하는데, 여기가 하루씩 밀리면
 * <b>모든 현황 화면이 조용히 틀린 기간을 본다.</b>
 *
 * <p>여기 있는 사례들은 대부분 <b>실제로 겪은 버그</b>다:
 *   - toISOString() 이 UTC 로 바꿔서 오전 9시 이전이면 어제가 나오던 것
 *   - 비교기간이 월말에서 길이가 달라지던 것
 *   - '종료일' 이 시작일을 지우던 것
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comparePeriodOf, periodOf, shiftMonths, ymd } from './periods.ts'

/** 로컬 시각으로 Date 를 만든다. new Date('2026-08-26') 은 UTC 로 읽혀서 하루 밀린다. */
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h)

test('ymd 는 로컬 날짜를 쓴다 — UTC 로 바꾸지 않는다', () => {
  // 한국에서 오전 3시. toISOString().slice(0,10) 이면 전날이 나온다.
  const d = at(2026, 8, 26, 3)
  assert.equal(ymd(d), '2026-08-26')
  assert.notEqual(ymd(d), d.toISOString().slice(0, 10) === '2026-08-26' ? 'x' : ymd(d) + '!')
})

test('ymd 는 한 자리 월·일을 0 으로 채운다', () => {
  assert.equal(ymd(at(2026, 1, 5)), '2026-01-05')
})

test('금일·전일', () => {
  const today = at(2026, 8, 26)
  assert.deepEqual(periodOf('금일', today), { from: '2026-08-26', to: '2026-08-26' })
  assert.deepEqual(periodOf('전일', today), { from: '2026-08-25', to: '2026-08-25' })
})

test('금월(~오늘) 은 1일부터 오늘까지', () => {
  assert.deepEqual(periodOf('금월(~오늘)', at(2026, 8, 26)),
    { from: '2026-08-01', to: '2026-08-26' })
})

test('전월은 그 달의 1일부터 말일까지', () => {
  assert.deepEqual(periodOf('전월', at(2026, 8, 26)),
    { from: '2026-07-01', to: '2026-07-31' })
  // 2월 말일은 28/29 로 갈린다
  assert.deepEqual(periodOf('전월', at(2026, 3, 10)),
    { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(periodOf('전월', at(2024, 3, 10)),
    { from: '2024-02-01', to: '2024-02-29' })
})

test('금주는 월요일부터 오늘까지 — 일요일에도 그 주 월요일을 가리킨다', () => {
  // 2026-08-26 은 수요일, 그 주 월요일은 08-24
  assert.deepEqual(periodOf('금주(~오늘)', at(2026, 8, 26)),
    { from: '2026-08-24', to: '2026-08-26' })
  // 2026-08-30 은 일요일. getDay()===0 을 안 다루면 다음 주 월요일로 튄다.
  assert.deepEqual(periodOf('금주(~오늘)', at(2026, 8, 30)),
    { from: '2026-08-24', to: '2026-08-30' })
})

test('전월+금월은 두 달 통째 — 오늘까지가 아니다', () => {
  // 처음엔 '~오늘'로 잘못 알고 테스트를 짰다가 구현이 맞다는 걸 확인했다.
  // 형제 버튼은 '금월(~오늘)'이라고 단서를 달지만 이 버튼은 안 단다 —
  // 라벨이 이미 두 달 전체라고 말하고 있다.
  assert.deepEqual(periodOf('전월+금월', at(2026, 8, 26)),
    { from: '2026-07-01', to: '2026-08-31' })
  // 2월이 끼면 말일이 28/29 로 갈린다
  assert.deepEqual(periodOf('전월+금월', at(2026, 2, 10)),
    { from: '2026-01-01', to: '2026-02-28' })
})

test('기수는 fiscalStart 를 줘야 계산한다 — 없으면 1월로 넘겨짚지 않는다', () => {
  assert.equal(periodOf('이번기수', at(2026, 8, 26)), null)
  // 4월 시작 기수면 2026-04-01 ~ 2027-03-31
  assert.deepEqual(periodOf('이번기수', at(2026, 8, 26), 4),
    { from: '2026-04-01', to: '2027-03-31' })
  // 8월은 아직 그 기수 안이므로 직전기수는 2025-04-01 ~ 2026-03-31
  assert.deepEqual(periodOf('직전기수', at(2026, 8, 26), 4),
    { from: '2025-04-01', to: '2026-03-31' })
  // 기수 시작 전(3월)이면 이번기수는 작년 4월부터다
  assert.deepEqual(periodOf('이번기수', at(2026, 3, 10), 4),
    { from: '2025-04-01', to: '2026-03-31' })
})

test('모르는 라벨은 null', () => {
  assert.equal(periodOf('없는버튼', at(2026, 8, 26)), null)
})

test('비교기간은 구간 길이를 지킨다 — 월말에서도', () => {
  // 1/31~2/28 (29일). 전월동일기간은 시작만 옮기고 같은 일수를 더해야 한다.
  // 시작·끝을 각각 한 달 밀면 12/31~1/28 이 되어 길이가 달라진다.
  const r = comparePeriodOf('2026-01-31', '2026-02-28', '전월동일기간')
  assert.ok(r)
  const days = (a: string, b: string) =>
    Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
  assert.equal(days(r.from, r.to), days('2026-01-31', '2026-02-28'))
})

test('비교기간 — 전년·전주·전일', () => {
  assert.deepEqual(comparePeriodOf('2026-08-01', '2026-08-31', '전년동일기간'),
    { from: '2025-08-01', to: '2025-08-31' })
  assert.deepEqual(comparePeriodOf('2026-08-24', '2026-08-26', '전주동일기간'),
    { from: '2026-08-17', to: '2026-08-19' })
  assert.deepEqual(comparePeriodOf('2026-08-26', '2026-08-26', '전일동일기간'),
    { from: '2026-08-25', to: '2026-08-25' })
})

test('비교기간 — 사용안함이거나 날짜가 비면 null', () => {
  assert.equal(comparePeriodOf('2026-08-01', '2026-08-31', '사용안함'), null)
  assert.equal(comparePeriodOf('', '2026-08-31', '전년동일기간'), null)
  assert.equal(comparePeriodOf('2026-08-01', '', '전년동일기간'), null)
  assert.equal(comparePeriodOf('말도안됨', '2026-08-31', '전년동일기간'), null)
})

test('달을 옮길 때 없는 날짜는 말일로 당긴다', () => {
  // Date.setMonth 를 그냥 쓰면 2월 31일이 3월 3일로 넘어간다. 그러면 '전월동일기간'을
  // 골랐는데 비교 대상이 <b>지금 보는 달</b>로 돌아와 구간이 겹친다. 실제로 그랬다.
  assert.equal(ymd(shiftMonths(new Date(2026, 2, 31), -1)), '2026-02-28')   // 3/31 → 2/28
  assert.equal(ymd(shiftMonths(new Date(2026, 4, 31), -1)), '2026-04-30')   // 5/31 → 4/30
  assert.equal(ymd(shiftMonths(new Date(2028, 1, 29), -12)), '2027-02-28')  // 윤년 2/29 → 2/28
  assert.equal(ymd(shiftMonths(new Date(2026, 0, 31), -1)), '2025-12-31')   // 넘침이 없으면 그대로
  assert.equal(ymd(shiftMonths(new Date(2026, 4, 31), -3)), '2026-02-28')   // 3개월 전
  assert.equal(ymd(shiftMonths(new Date(2026, 7, 26), 1)), '2026-09-26')    // 앞으로도 같다
})

test('비교기간이 월말에서 같은 달로 돌아오지 않는다', () => {
  assert.deepEqual(comparePeriodOf('2026-03-31', '2026-03-31', '전월동일기간'),
    { from: '2026-02-28', to: '2026-02-28' })
  assert.deepEqual(comparePeriodOf('2026-05-31', '2026-05-31', '전월동일기간'),
    { from: '2026-04-30', to: '2026-04-30' })
  assert.deepEqual(comparePeriodOf('2028-02-29', '2028-02-29', '전년동일기간'),
    { from: '2027-02-28', to: '2027-02-28' })
  // 구간 길이는 그대로 지킨다 — 시작만 옮기고 같은 일수를 더한다
  assert.deepEqual(comparePeriodOf('2026-03-29', '2026-03-31', '전월동일기간'),
    { from: '2026-02-28', to: '2026-03-02' })
})

test("'이번기수(~전월)' 은 기수 시작부터 지난달 말일까지", () => {
  // 회계연도 4월 시작. 오늘이 2026-08-26 이면 이번 기수는 2026-04-01 부터고,
  // 대사는 마감된 구간만 보므로 끝은 지난달 말일(7/31)이다.
  assert.deepEqual(periodOf('이번기수(~전월)', at(2026, 8, 26), 4),
    { from: '2026-04-01', to: '2026-07-31' })
  // 기수 시작 전(1월)이면 아직 지난해 4월에 시작한 기수 안에 있다.
  assert.deepEqual(periodOf('이번기수(~전월)', at(2026, 1, 15), 4),
    { from: '2025-04-01', to: '2025-12-31' })
  // 기수가 이번 달에 막 시작했으면 볼 구간이 없다 — 시작일 하루로 접는다.
  assert.deepEqual(periodOf('이번기수(~전월)', at(2026, 4, 3), 4),
    { from: '2026-04-01', to: '2026-04-01' })
  // 회계연도 설정을 모르면 계산하지 않는다(1월이라고 넘겨짚지 않는다).
  assert.equal(periodOf('이번기수(~전월)', at(2026, 8, 26)), null)
})
