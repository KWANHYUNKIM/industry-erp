/**
 * 현황 화면을 다른 창 안에 띄울 때 넘기는 것 — 전자결재 기안서 [결재문서] › '전표 출력물'(판매현황 · 미판매현황 창).
 * 화면은 그대로 쓰고, 처음 조건과 조건이 바뀔 때 알릴 곳만 받는다(조건 판 · 결과 표를 베끼지 않는다).
 */
export interface ReportEmbedProps {
  /** 처음 조건 — [자동갱신] 으로 붙인 출력물을 다시 열 때 그때 조건으로 연다. */
  conditions?: Record<string, unknown>
  /** 조건이 바뀔 때마다 알린다 — [자동갱신] 이 이 조건을 저장한다. */
  onConditions?: (c: Record<string, unknown>) => void
  /** 열자마자 [검색] 한다(검색 전에 격자를 안 그리는 화면). */
  autoSearch?: boolean
}

/** 받은 조건에서 글자 값 하나 — 없으면 처음 값. */
export function condStr(c: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const v = c?.[key]
  return typeof v === 'string' ? v : fallback
}
