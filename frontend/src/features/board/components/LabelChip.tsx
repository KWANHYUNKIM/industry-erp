/**
 * 원본 게시판 라벨 칩 — 제목 앞(여백 3.6 4.5 2.7 · 둥글기 10 · 흰 글자, 실측). 색은 라벨마다 회사가 고른 값이라
 * 클래스로 못 박지 못한다 — 자료에서 온 색만 그려 넣는다(색이 없으면 .ec-label-chip 기본색).
 */
export default function LabelChip({ name, color, className = '' }: { name: string; color?: string | null; className?: string }) {
  return (
    <span className={`ec-label-chip ${className}`}
          ref={(el) => { if (el) el.style.backgroundColor = color ?? '' }}>
      {name}
    </span>
  )
}
