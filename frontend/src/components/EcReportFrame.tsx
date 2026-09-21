import { useAuth } from '../auth/AuthContext'

/**
 * 원본 <b>[출력물]</b>의 머리글과 꼬리 — 2026-09-21 getComputedStyle 실측(재고현황 E040701).
 *
 * <pre>
 *                        재고현황                         ← 24px · 700 · 표 너비에 가운데
 *   회사명 : 주식회사 팜인                     2026/09/21  ← 12px · 400 · 표 바로 위
 *   ┌──────────────────── 격자 ────────────────────┐
 *   [P.1]                        2026/09/21  오후 12:33:51 ← 표 바로 아래
 * </pre>
 *
 * 불량률파악보고서(기간 2024/01/01 ~ 2026/09/21)·월별채권증감내역(2025/10/01 ~ 2026/09/21)도
 * 같은 모양이다. 화면 왼쪽 위의 ☆ 제목(EcListShell)과는 <b>따로</b> 선다 — 원본도 둘 다 있다.
 *
 * <p>우리 출력물 화면에는 이 머리글·꼬리가 없어서 "어느 회사·어느 기간의 표인지" 가
 * 화면에서도, 인쇄한 종이에서도 안 보였다.
 */

/** 원본 날짜 모양 — 2026/09/21. 받은 값이 비어 있으면 빈 글자다. */
export const reportDate = (d: string | null | undefined) => (d ? d.slice(0, 10).replace(/-/g, '/') : '')

/** 원본 기간 모양 — 하루면 그 날 하나, 기간이면 '시작 ~ 끝'. */
export const reportPeriod = (from: string | null | undefined, to?: string | null) => {
  const a = reportDate(from)
  const b = reportDate(to)
  if (!b || a === b) return a
  if (!a) return b
  return `${a} ~ ${b}`
}

export function EcReportHead({ title, period }: { title: string; period: string }) {
  const { companyName } = useAuth()
  return (
    <div className="ec-report-head">
      <div className="ec-report-title">{title}</div>
      <div className="ec-report-meta">
        <span>회사명 : {companyName ?? ''}</span>
        <span>{period}</span>
      </div>
    </div>
  )
}

/**
 * 꼬리 — [P.1] 과 <b>출력한 때</b>. 원본 글자: "2026/09/21  오후 12:33:51"
 * (날짜와 오전·오후 사이가 <b>두 칸</b>이다). 화면에 그린 때를 적는다.
 */
export function EcReportFoot() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const time = now.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  return (
    <div className="ec-report-foot">
      <span>[P.1]</span>
      <span>{`${y}/${m}/${d}  ${time}`}</span>
    </div>
  )
}
