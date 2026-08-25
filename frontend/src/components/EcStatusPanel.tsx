import { useState, type ReactNode } from 'react'
import EcPeriodPicks, {
  COMPARE_PERIODS, INQUIRY_PICKS, comparePeriodOf, type ComparePeriod, type PeriodRange,
} from './EcPeriodPicks'

/**
 * 현황 화면의 조회 조건 패널 — 이카운트 현황류가 공통으로 쓰는 그 판이다.
 *
 * <p>원본(주문서현황 E040209 실측)은 조건을 <b>한 열로 세로로 쌓고</b> 라벨 칸이 134px,
 * 행 간격 38px 이다. 맨 위가 [메뉴 현황|집계], 그 아래 [비교기간], [기준일자] + 기간 빠른선택,
 * 그다음 화면마다 다른 조건들이 오고, 코드도움으로 고르는 조건(창고·프로젝트·거래처·품목)은
 * <b>라벨이 파랗다</b>.
 *
 * <p>화면마다 이 판을 따로 만들면 조건 하나 다듬을 때마다 스무 화면을 고쳐야 한다.
 * 판매현황·구매현황·주문서현황·근태현황이 이미 제각각이었다.
 *
 * <p>검색·다시작성 버튼은 여기 두지 않는다 — 원본에서도 그건 <b>화면 맨 아래 버튼줄</b>이고,
 * 우리는 EcListShell 의 actions 가 그 자리다.
 */

/** 조건 한 줄. `pick` 이면 코드도움 조건이라 라벨이 파랗다(원본 규칙). */
export function EcCond({ label, pick, children }: { label: string; pick?: boolean; children: ReactNode }) {
  return (
    <li className={pick ? 'pick' : undefined}>
      <div className="title">{label}</div>
      <div className="form">{children}</div>
    </li>
  )
}

export default function EcStatusPanel({
  mode, onModeChange,
  compare, onCompareChange,
  from, to, onPeriod,
  picks = INQUIRY_PICKS,
  fiscalStart,
  children,
}: {
  /** [메뉴] 현황·집계 토글. 안 주면 그 줄을 그리지 않는다. */
  mode?: '현황' | '집계'
  onModeChange?: (m: '현황' | '집계') => void
  /** [비교기간]. 안 주면 그 줄을 그리지 않는다. */
  compare?: ComparePeriod
  onCompareChange?: (c: ComparePeriod) => void
  from: string
  to: string
  onPeriod: (r: PeriodRange) => void
  picks?: readonly string[]
  /** 회계연도 시작월(1~12). '이번기수'·'직전기수' 를 쓰는 화면만 준다. */
  fiscalStart?: number
  /** 화면마다 다른 조건들 — `EcCond` 로 감싼다. */
  children?: ReactNode
}) {
  const prev = compare ? comparePeriodOf(from, to, compare) : null
  /** 원본은 기준일자 옆에 마지막으로 누른 빠른선택 이름을 적어 둔다(예: '금월(~오늘)'). */
  const [pickedLabel, setPickedLabel] = useState('')

  return (
    <ul className="ec-cond" style={{ marginBottom: 8 }}>
      {mode && onModeChange && (
        <EcCond label="메뉴">
          <div className="ec-pills">
            {(['현황', '집계'] as const).map((m) => (
              <button
                key={m} type="button"
                className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                onClick={() => onModeChange(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </EcCond>
      )}

      {compare && onCompareChange && (
        <EcCond label="비교기간">
          <select
            className="ec-input"
            value={compare}
            onChange={(e) => onCompareChange(e.target.value as ComparePeriod)}
            style={{ width: 150 }}
          >
            {COMPARE_PERIODS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {prev && (
            <span style={{ fontSize: 11.5, color: 'var(--ec-label)' }}>
              비교 대상 {prev.from.replace(/-/g, '/')} ~ {prev.to.replace(/-/g, '/')}
            </span>
          )}
        </EcCond>
      )}

      <EcCond label="기준일자">
        {pickedLabel && (
          <span style={{ fontSize: 12, color: 'var(--ec-blue)', marginRight: 6 }}>{pickedLabel}</span>
        )}
        <input type="date" className="ec-input" value={from}
               onChange={(e) => { setPickedLabel(''); onPeriod({ from: e.target.value, to }) }} style={{ width: 140 }} />
        <span style={{ color: 'var(--ec-label)' }}>~</span>
        <input type="date" className="ec-input" value={to}
               onChange={(e) => { setPickedLabel(''); onPeriod({ from, to: e.target.value }) }} style={{ width: 140 }} />
      </EcCond>

      <EcCond label="">
        <EcPeriodPicks
          labels={picks} currentFrom={from} fiscalStart={fiscalStart}
          onPick={onPeriod} onPickLabel={setPickedLabel}
        />
      </EcCond>

      {children}
    </ul>
  )
}
