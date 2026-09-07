/**
 * 기간 빠른선택 — 이카운트 조회 조건 화면 하단의
 * [금일][전일][금주(~오늘)][전주][금월][전월][금년][전년][종료일][최근3일+7일] 버튼줄.
 *
 * <p>원본은 이 줄을 **여러 조회 화면이 공통으로** 쓴다(업무일지·현황류 등). 우리는 어디에도 없어서
 * 사용자가 기간을 매번 손으로 찍어야 했다. 화면마다 따로 만들지 않도록 컴포넌트로 둔다.
 *
 * <p>날짜 계산 자체는 `periods.ts` 에 있다 — 테스트로 못 박으려고 JSX 없는 파일로 뺐다.
 * 여기서 다시 내보내므로 `EcPeriodPicks` 에서 import 하던 곳은 그대로 두면 된다.
 */
export * from './periods'
import { periodOf, type PeriodRange } from './periods'
import { JOURNAL_PICKS } from './periods'

export default function EcPeriodPicks({
  onPick,
  labels = JOURNAL_PICKS,
  currentFrom,
  fiscalStart,
  onPickLabel,
}: {
  onPick: (r: PeriodRange) => void
  labels?: readonly string[]
  /** 지금 화면의 시작일. '종료일' 처럼 시작일을 건드리지 않는 버튼이 이 값을 그대로 돌려준다. */
  currentFrom?: string
  /** 회계연도 시작월(1~12). '이번기수'·'직전기수' 를 쓰는 화면만 준다. */
  fiscalStart?: number
  /** 어떤 버튼을 눌렀는지 — 원본은 기준일자 옆에 그 이름을 적어 둔다. */
  onPickLabel?: (label: string) => void
}) {
  return (
    <>
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          className="ec-btn"
          onClick={() => {
            const r = periodOf(label, new Date(), fiscalStart)
            // 시작일을 바꾸지 않는 버튼('종료일')은 빈 from 을 준다. 그대로 넣으면 시작일이 지워진다.
            if (!r) return
            onPick(r.from ? r : { ...r, from: currentFrom ?? r.to })
            onPickLabel?.(label)
          }}
        >
          {label}
        </button>
      ))}
    </>
  )
}
