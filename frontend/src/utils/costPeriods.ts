import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../api/client'

/**
 * 원가생성/수정(E040802)에서 만든 <b>원가 기간</b> — 원본 이익관리 현황 화면들의 [기준월] 코드도움('재고월별원가' 창)이 고르는 값.
 * (2026-10-13 실측: 월별이익현황 · 표준원가현황 둘 다 '2026/10  ~ 2026/10  (총평균법)' 을 기본으로 든다 — 맨 위(최근) 기간.)
 */
export interface CostPeriod { id: number; startMonth: string; endMonth: string; methodName: string; latest: boolean }

const ymSlash = (ym: string) => ym.replace('-', '/')
/** 표 위 기간 글자 — '2026/09 ~ 2026/09'. */
export const costPeriodRange = (p: CostPeriod) => `${ymSlash(p.startMonth)} ~ ${ymSlash(p.endMonth)}`
/** 코드도움 칸 글자 — '2026/09 ~ 2026/09 (총평균법)'. */
export const costPeriodText = (p: CostPeriod) => `${costPeriodRange(p)} (${p.methodName})`
/** 'YYYY-MM' 이 그 기간 안인가. */
export const inCostPeriod = (p: CostPeriod, ym: string) => ym >= p.startMonth && ym <= p.endMonth

/** 원가 기간 목록과 기본값(최근 기간). onReady 는 처음 받았을 때 기본 기간으로 한 번 부른다. */
export function useCostPeriods(onReady?: (first: CostPeriod | null, list: CostPeriod[]) => void) {
  const [periods, setPeriods] = useState<CostPeriod[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<CostPeriod[]>('/cost-periods')
      .then((r) => { setPeriods(r.data); onReady?.(r.data.find((p) => p.latest) ?? r.data[0] ?? null, r.data) })
      .catch((err) => setError(extractErrorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const first = periods.find((p) => p.latest) ?? periods[0] ?? null
  return { periods, first, error }
}
