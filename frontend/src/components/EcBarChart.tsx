import { toBars, topRows, type ChartRow } from '../utils/chartBars'

/**
 * 현황 화면의 <b>[그래프로 보기]</b>.
 *
 * <p>원본 현황 17종에 [데이터 보기형식]과 [그래프로 보기]가 있다. 표만 있으면
 * "어디가 큰가" 를 숫자 스무 줄에서 눈으로 찾아야 한다 — 현황 화면을 여는 이유가 대개 그것이다.
 *
 * <p>그림 라이브러리를 쓰지 않는다. 막대 하나가 div 하나다 — 이 정도에 의존성을 늘리면
 * 번들만 커지고, 우리 표 스타일과 글꼴도 안 맞는다.
 */
export default function EcBarChart({
  rows,
  unit = '',
  limit = 15,
  emptyText = '그릴 자료가 없습니다.',
}: {
  rows: ChartRow[]
  /** 값 뒤에 붙는 단위(원·개 등). */
  unit?: string
  limit?: number
  emptyText?: string
}) {
  const bars = toBars(topRows(rows, limit))
  if (bars.length === 0) {
    return <p className="text-center text-ec-hint p-[24px] text-[12.5px]">{emptyText}</p>
  }
  const allZero = bars.every((b) => b.percent === 0)

  return (
    <div className="border border-ec-line border-solid bg-white py-[12px] px-[14px]">
      {allZero && (
        <p className="mt-0 mx-0 mb-[8px] text-[11.5px] text-ec-warn">
          값이 모두 0이라 막대를 그리지 않았습니다.
        </p>
      )}
      {bars.map((b, i) => (
        <div key={`${b.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 22 }}>
          <div className="w-[170px] shrink-0 text-[11.5px] text-ec-text overflow-hidden text-ellipsis whitespace-nowrap" title={b.label}>{b.label}</div>
          <div className="flex-1 bg-ec-page h-[12px] relative">
            <div style={{
              width: `${b.percent}%`, height: '100%',
              background: b.negative ? 'var(--ec-danger)' : 'var(--ec-blue)',
            }} />
          </div>
          <div style={{
            width: 130, flexShrink: 0, textAlign: 'right', fontSize: 11.5,
            fontWeight: 600, color: b.negative ? 'var(--ec-danger)' : 'var(--ec-text)',
          }}>
            {b.value.toLocaleString('ko-KR')}{unit}
          </div>
        </div>
      ))}
    </div>
  )
}
