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
export const fmtNumberBlank = (n: number) => (n ? Number(n).toLocaleString('ko-KR') : '')

/** Number 로 바꿔서 · null/undefined 만 빈칸(0 은 '0') */
export const fmtNumberOrBlank = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('ko-KR'))

/** 원 단위 반올림 · 0 은 '0' */
export const fmtAmount = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 원 단위 반올림 · Number 로 바꿔서(문자열 값) · 0 은 '0' */
export const fmtAmountOf = (n: number) => Math.round(Number(n)).toLocaleString('ko-KR')

/** 원 단위 반올림 · 0 은 빈칸 */
export const fmtAmountBlank = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
