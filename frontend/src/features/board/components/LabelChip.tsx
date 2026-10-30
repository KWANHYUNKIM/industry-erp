import { labelIsLight } from '../labels'

/**
 * 원본 게시판 라벨 칩 — 제목 앞(여백 3.6 4.5 2.7 · 둥글기 10, 실측). 글자는 흰색, 밝은 칸 색이면 검정(원본 label-light — labelIsLight). 색은 라벨마다 회사가 고른 값이라
 * 클래스로 못 박지 못한다 — 자료에서 온 색만 그려 넣는다(색이 없으면 .ec-label-chip 기본색).
 */
export default function LabelChip({ name, color, className = '', light }: {
  name: string; color?: string | null; className?: string
  /** 글자색을 정해 준다 — 일정관리 달력 칸은 칸 색과 상관없이 늘 흰 글자다(원본 'label mr-5', 2026-10-30 실측). 안 주면 labelIsLight. */
  light?: boolean
}) {
  return (
    <span className={`ec-label-chip${(light ?? labelIsLight(color)) ? ' ec-label-light' : ''} ${className}`}
          ref={(el) => { if (el) el.style.backgroundColor = color ?? '' }}>
      {name}
    </span>
  )
}
