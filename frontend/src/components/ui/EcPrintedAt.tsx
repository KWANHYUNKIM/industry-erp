import { useMemo } from 'react'

/**
 * 원본 출력물 결과 아래 줄 — `2026/10/20 오후 11:15:58` (재무제표 · 회계거래현황 실측, plans/회계1.md).
 * 조회한 때가 아니라 그려진 때의 시각이라 화면이 다시 그려져도 바뀌지 않게 한 번만 잡는다.
 */
export function printedAtText(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const h = d.getHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${h < 12 ? '오전' : '오후'} ${h12}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function EcPrintedAt() {
  const text = useMemo(() => printedAtText(), [])
  return <p className="text-[12px] mt-[6px] mb-0">{text}</p>
}
