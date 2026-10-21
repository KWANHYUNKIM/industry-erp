import { useEffect, type ReactNode } from 'react'

export const slash = (d: string) => d.replace(/-/g, '/')
/** 0 은 빈칸(원본 출력물). */
export const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 0 도 그대로 찍는 수량 · 단가(원본 구매현황 '0 | 0'). */
export const plain = (n: number) => Math.round(n).toLocaleString('ko-KR')

/** 경영요약보고서 표 한 묶음의 공통 인자 — 조회 구간 · 이어 붙일 번호 · 그릴 표 수를 알리는 함수. */
export interface SectionProps {
  from: string
  to: string
  startNo: number
  onCount: (n: number) => void
}

/** 자료를 다 받은 뒤 그릴 표가 몇 개인지 부모에게 알린다(부모가 번호를 이어 매긴다). */
export function useCount(onCount: (n: number) => void, n: number, ready: boolean) {
  useEffect(() => { if (ready) onCount(n) }, [ready, n, onCount])
}

/** 원본 표 제목 줄 — 왼쪽 'N. 이름', 오른쪽 조회 구간. */
export function SectionHead({ no, title, from, to }: { no: number; title: string; from: string; to: string }): ReactNode {
  return (
    <div data-ms-head className="flex justify-between text-[12.5px] font-bold mt-[14px] mx-0 mb-[4px]">
      <span>{no}. {title}</span>
      <span className="font-normal">{slash(from)} ~ {slash(to)}</span>
    </div>
  )
}

/** 합계 · 계 줄 바탕(원본 출력물 합계줄 토큰). */
export const SUB_ROW = 'font-bold bg-[var(--ec-report-stripe)]'

export const monthOf = (d: string) => d.slice(0, 7)
export const monthStart = (to: string) => `${to.slice(0, 7)}-01`
export function monthEnd(to: string): string {
  const y = Number(to.slice(0, 4)), m = Number(to.slice(5, 7))
  const d = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
