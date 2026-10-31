/**
 * 숫자 표시 — 화면마다 지역 `won` 으로 복사해 두던 것을 몸통별로 모았다.
 *
 * <p><b>몸통마다 이름이 따로다.</b> 0 을 빈칸으로 찍느냐, 반올림하느냐, 문자열로 온 값을 Number 로 바꾸느냐가
 * 화면마다 달랐고, 원본 이카운트도 칸마다 0 을 찍는 곳 · 비우는 곳이 다르다. 하나로 '통일'하면 화면이 바뀌므로
 * 지역 정의를 지울 때는 <b>몸통이 글자까지 같은 것</b>만 그 이름으로 바꾼다(docs/프론트-코드-정리.md 2.1).
 *
 * <p>새 화면에서 지역 `won` 을 새로 만들지 마세요 — 여기서 고르고, 맞는 것이 없으면 여기에 이름을 붙여 더합니다.
 */

/** 그대로 · 소수 셋째 자리까지 · 0 은 '0' — `n.toLocaleString('ko-KR')` */
export const fmtNumber = (n: number) => n.toLocaleString('ko-KR')

/** Number 로 바꿔서 · 소수 셋째 자리까지 · 0 은 '0' — 서버가 문자열로 줄 수 있는 값 */
export const fmtNumberOf = (n: number) => Number(n).toLocaleString('ko-KR')

/** Number 로 바꿔서 · 0 · 빈 값은 빈칸 */
export const fmtNumberBlank = (n: number | null | undefined) => (n ? Number(n).toLocaleString('ko-KR') : '')

/** Number 로 바꿔서 · null/undefined 만 빈칸(0 은 '0') */
export const fmtNumberOrBlank = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))

/** 원 단위 반올림 · 0 은 '0' */
export const fmtAmount = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 원 단위 반올림 · Number 로 바꿔서(문자열 값) · 0 은 '0' */
export const fmtAmountOf = (n: number) => Math.round(Number(n)).toLocaleString('ko-KR')

/** 원 단위 반올림 · 0 은 빈칸 */
export const fmtAmountBlank = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

/** 원 단위 반올림 · 0 · 빈 값(null · undefined · NaN)은 빈칸 — `n ? Math.round(n)… : ''` (전표 인쇄 · 집계표) */
export const fmtAmountNz = (n: number | null | undefined) => (n ? Math.round(n).toLocaleString('ko-KR') : '')

/** 원 단위 반올림 · null 은 '-' · 0 은 '0' (원가 · 생산출고 현황의 단가 없음) */
export const fmtAmountOrDash = (n: number | null) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'))

/** 원 미만 버림 · 0 은 '0' (원천징수 — 세액은 버린다) */
export const fmtTrunc = (n: number) => Math.trunc(n).toLocaleString('ko-KR')

/** Number 로 바꿔서 원 미만 버림 · 0 · 빈 값은 빈칸 (원천징수 서식) */
export const fmtTruncBlankOf = (n: number | null | undefined) => (Number(n) ? Math.trunc(Number(n)).toLocaleString('ko-KR') : '')

/** 소수 넷째 자리까지 · 숫자가 아니면(NaN · Infinity) 빈칸 (생산 수량) */
export const fmtDecimal4 = (n: number) => (Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '')

/** Number 로 바꿔서 · 소수 넷째 자리까지 · NaN 은 'NaN' 그대로 (소요량 계산 — fmtDecimal4 와 달리 거르지 않는다) */
export const fmtDecimal4Of = (n: number) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 4 })

/** 그대로 · 0 · 빈 값(null · undefined · NaN)은 빈칸 — `n ? n.toLocaleString('ko-KR') : ''` (급여대장). Number 로 바꾸지 않는다 */
export const fmtNumberNz = (n: number | null | undefined) => (n ? n.toLocaleString('ko-KR') : '')

/** Number 로 바꿔서 · 바꾼 값이 0 · NaN 이면 빈칸 — 문자열 '0' 도 빈칸 (지급명세서 제출) */
export const fmtNumberBlankOf = (n: number | null | undefined) => (Number(n) ? Number(n).toLocaleString('ko-KR') : '')

/** Number 로 바꿔서 · null · undefined 는 '0' (연말정산 공제자료) */
export const fmtNumberOrZero = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('ko-KR')

/** Number 로 바꿔서 · null · undefined · 0(문자열 '0' 포함)은 빈칸 — NaN 은 'NaN' 그대로 (원천징수 비교 · 연말정산 검토) */
export const fmtNumberNullZeroBlank = (n: number | null | undefined) => (n == null || Number(n) === 0 ? '' : Number(n).toLocaleString('ko-KR'))

/** 입력칸 글자 → 콤마 찍은 글자 · 빈 글자는 빈칸 · 콤마가 이미 있으면 'NaN' (일용직 입력칸 — 값은 콤마 없는 글자로 들고 있다) */
export const fmtNumberText = (s: string) => (s === '' ? '' : Number(s).toLocaleString('ko-KR'))

/** 원 단위 반올림 · Number 로 바꿔서 · null · undefined 만 빈칸(0 은 '0') (기초잔액 조정) */
export const fmtAmountOrBlank = (n: number | null | undefined) => (n == null ? '' : Math.round(Number(n)).toLocaleString('ko-KR'))

/** 원 단위 반올림 · .5 는 0 에서 먼 쪽으로(-2.5 → -3, Math.round 는 -2) · 0 은 '0' (프로젝트 계획대비) */
export const fmtAmountHalfAway = (n: number) => (n < 0 ? -Math.round(-n) : Math.round(n)).toLocaleString('ko-KR')

/** 원 미만 버림 · 0 · 빈 값은 빈칸 — Number 로 바꾸지 않는다 (기타원천세 입력) */
export const fmtTruncNz = (n: number) => (n ? Math.trunc(n).toLocaleString('ko-KR') : '')

/**
 * 입력 글자 → 숫자 — 지역 `num` 의 파서 쪽을 모았다(같은 이름이 화면마다 '표시'와 '읽기' 두 일을 하던 것).
 *
 * <p><b>parseNum</b>: 콤마를 지우고 Number 로 바꾼다. 숫자가 아니면(NaN) · 빈 글자 · null · undefined 는 0, -0 도 0.
 * 'Infinity' 는 Infinity, ' 12 ' 처럼 앞뒤 빈칸은 Number 가 하듯 12. 숫자를 넣어도 그대로 숫자.
 * `Number(String(s).replace(/,/g, '')) || 0` 와 모든 입력에서 같다.
 */
export const parseNum = (s: string | number | null | undefined) => Number(String(s ?? '').replace(/,/g, '')) || 0

/**
 * <b>parseNumPlain</b>: 콤마를 <b>지우지 않는</b> `Number(s) || 0` — '1,000' 은 0 이 된다. NaN · 빈 글자 · null · undefined 는 0.
 * 입력칸이 type=number 라 콤마가 올 일이 없던 화면들의 몸통이다. parseNum 과 결과가 달라서 이름을 나눴다.
 */
export const parseNumPlain = (s: string | number | null | undefined) => Number(s) || 0
