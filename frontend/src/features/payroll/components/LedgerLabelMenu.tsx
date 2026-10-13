/**
 * 급여계산/대장 목록의 <b>확정된 대장</b> 칸(원본 E090106, 2026-10-13 실측).
 *
 * <p>미확정 대장은 칸마다 링크를 세로로 늘어놓지만, 확정하면 칸이 알약 하나(원본 label-group-hover)로 바뀌고
 * 마우스를 올리면 아래로 메뉴가 펼쳐진다:
 * 사전작업(회색) ▸ 근무기록확정[n] · 금액직접입력 / 계산/수정(회색, 메뉴 없음) / 급여대장(파랑) ▸ 조회 · 확정취소 · 전표생성 /
 * 명세서(파랑) ▸ 조회 · Email.
 * 알약: 12px 흰 글자 · 여백 3.6 4.5 2.7 · 둥글기 10(.ec-label-chip) · 투명 머리카락 테두리 · 높이 19.3 · 칸 폭을 채움. 파랑 --ec-blue · 회색 --ec-text-hint.
 * 메뉴: 흰 바탕 · 머리카락 선 --ec-line · 아래 모서리 10 · 줄 글자 --ec-text-sub · 여백 2.7 1.8 1.8.
 */
export default function LedgerLabelMenu({ label, tone, onClick, items = [] }: {
  label: string
  tone: 'primary' | 'default'
  /** 알약 자체를 눌렀을 때(원본 [계산/수정] → '확정처리된 급여입니다.' 알림) */
  onClick?: () => void
  items?: { label: string; onClick: () => void }[]
}) {
  return (
    <div className="group relative w-full">
      <a href="#" onClick={(e) => { e.preventDefault(); onClick?.() }}
         className={`ec-label-chip block w-full text-center no-underline border-[length:var(--ec-hair)] border-solid border-transparent ${tone === 'primary' ? 'bg-ec-blue' : 'bg-ec-hint'}`}>
        {label}
      </a>
      {items.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-10 m-0 hidden list-none p-0 bg-ec-panel border-[length:var(--ec-hair)] border-solid border-ec-line rounded-b-ec group-hover:block">
          {items.map((it) => (
            <li key={it.label}>
              <a href="#" className="block pt-[2.7px] px-[1.8px] pb-[1.8px] text-center text-ec-text-sub no-underline"
                 onClick={(e) => { e.preventDefault(); it.onClick() }}>{it.label}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
