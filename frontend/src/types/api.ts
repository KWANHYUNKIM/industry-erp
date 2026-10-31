// 백엔드 응답과 매칭되는 타입 정의 — 모듈별 파일(types/api/<모듈>.ts)에 있고 여기서 다시 내보낸다.
// 새 타입은 그 모듈 파일에 넣는다. 화면은 지금처럼 '../../types/api' 에서 가져와도 된다.
export type * from './api/common'
export type * from './api/auth'
export type * from './api/settings'
export type * from './api/inventory'
export type * from './api/trade'
export type * from './api/production'
export type * from './api/accounting'
export type * from './api/hr'
export type * from './api/quality'
export type * from './api/groupware'
