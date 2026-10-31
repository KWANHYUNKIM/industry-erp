// 백엔드 응답과 매칭되는 타입 — 공통(페이지 응답). types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

// Spring Data Page 응답
export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}
