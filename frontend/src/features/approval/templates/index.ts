/**
 * 원본 이카운트 공통양식 9종의 [기안내용] 본문 서식 — loginaa 공통양식등록(E070107) 2026-10-30 실측.
 * 근거: `.claude/skills/ecount-diff/plans/데이터이관/원본-전자결재.md` ('본문 서식' · '양식 모양 실측')
 * 와 캡처 `전자결재-양식/01~09-*.jpg`. 캡처가 아래에서 잘린 양식은 md 의 본문 서식 글로 나머지 줄을 채웠다.
 *
 * <p>공통양식등록 양식 창의 [원본 양식 불러오기](개발 서버에서만)가 이것으로 [기안내용] 을 채운다.
 * 회사 자료(field_schema `__body`)에 들어가는 것은 QA 가 눌러 저장할 때뿐이다 — 여기는 견본일 뿐이다.
 */
import leave from './01-휴가신청서.html?raw'
import cardExpense from './02-법인카드사용지출결의서.html?raw'
import tripReport from './03-출장보고서.html?raw'
import absence from './04-휴직원.html?raw'
import supplies from './05-비품신청서.html?raw'
import condolence from './06-경조금신청서.html?raw'
import vehicleLog from './07-법인차량운행일지.html?raw'
import overtime from './08-시간외근무신청서.html?raw'
import resignation from './09-사직서.html?raw'

export interface OriginalForm {
  /** 원본 공통양식리스트의 정렬순서 */
  sortOrder: number
  /** 원본 양식명 그대로(띄어쓰기 포함) */
  name: string
  html: string
  /** 원본 공통양식리스트 [결재문서] — 휴가신청서만 '근태관리' */
  approvalDoc?: string
}

export const ORIGINAL_FORMS: OriginalForm[] = [
  { sortOrder: 1, name: '휴가신청서', html: leave, approvalDoc: '근태관리' },
  { sortOrder: 2, name: '법인카드 사용지출결의서', html: cardExpense },
  { sortOrder: 3, name: '출장보고서', html: tripReport },
  { sortOrder: 4, name: '휴직원', html: absence },
  { sortOrder: 5, name: '비품신청서', html: supplies },
  { sortOrder: 6, name: '경조금 신청서', html: condolence },
  { sortOrder: 7, name: '법인차량 운행일지', html: vehicleLog },
  { sortOrder: 8, name: '시간외근무 신청서', html: overtime },
  { sortOrder: 9, name: '사직서', html: resignation },
]

/** 양식명 → 본문 HTML */
export const ORIGINAL_FORM_HTML: Record<string, string> =
  Object.fromEntries(ORIGINAL_FORMS.map((f) => [f.name, f.html]))

const norm = (s: string) => s.replace(/\s+/g, '')

/** 양식명으로 원본 양식을 찾는다 — 띄어쓰기는 보지 않는다('경조금신청서' = '경조금 신청서'). */
export function originalFormFor(name: string | null | undefined): OriginalForm | null {
  if (!name) return null
  const n = norm(name)
  return ORIGINAL_FORMS.find((f) => norm(f.name) === n) ?? null
}
