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
  modes, mode, onModeChange,
  compare, onCompareChange,
  from, to, onPeriod,
  view, onViewChange,
  subtotal, subtotals, onSubtotalChange,
  picks = INQUIRY_PICKS,
  fiscalStart,
  single,
  dateLabel = '기준일자',
  children,
}: {
  /**
   * [구분] 토글. 안 주면 그 줄을 그리지 않는다.
   *
   * <p>원본 사본 7종(판매현황·구매현황·출하현황·생산입고현황·미출하현황·일별이익현황·
   * 월별이익현황)에서 이 줄의 라벨은 모두 <b>구분</b>이었다. 선택지는 화면마다 다르다 —
   * 판매·구매·출하·생산입고는 [내역 | 집계 | 라인별], 미출하는 [품목별 | 라인별],
   * 이익현황은 [라인별 | 품목별 | 거래처별 | …]. 그래서 목록을 받는다.
   */
  modes?: readonly string[]
  mode?: string
  onModeChange?: (m: string) => void
  /** [비교기간]. 안 주면 그 줄을 그리지 않는다. */
  compare?: ComparePeriod
  onCompareChange?: (c: ComparePeriod) => void
  from: string
  to: string
  onPeriod: (r: PeriodRange) => void
  picks?: readonly string[]
  /** 회계연도 시작월(1~12). '이번기수'·'직전기수' 를 쓰는 화면만 준다. */
  fiscalStart?: number
  /**
   * 기준일자가 <b>한 날짜</b>인 화면(재고현황처럼 시점을 보는 것). 구간이 아니라 칸이 하나다.
   * 이때 onPeriod 는 from·to 가 같은 값으로 온다 — 호출부가 둘 중 아무거나 써도 된다.
   */
  single?: boolean
  /** 라벨을 바꿔야 하는 화면(예: '기준일(영업주기)'). */
  dateLabel?: string
  /**
   * [데이터 보기형식] — 표 · 그래프. 원본 현황 17종에 공통으로 있는 줄이다.
   * 안 주면 그 줄을 그리지 않는다(그래프로 보여 줄 집계가 없는 화면).
   */
  view?: '표' | '그래프'
  onViewChange?: (v: '표' | '그래프') => void
  /**
   * [정렬/소계기준] — 목록을 무엇으로 묶어 소계를 낼지. 원본 현황 여섯에 있는 줄이다.
   *
   * <p>안 주면 그 줄을 그리지 않는다. 화면마다 묶을 수 있는 축이 다르므로
   * 이름만 받고, 실제로 묶는 일은 화면이 <code>subtotalBy</code> 로 한다.
   */
  subtotal?: string
  subtotals?: readonly string[]
  onSubtotalChange?: (v: string) => void
  /** 화면마다 다른 조건들 — `EcCond` 로 감싼다. */
  children?: ReactNode
}) {
  const prev = compare ? comparePeriodOf(from, to, compare) : null
  /** 원본은 기준일자 옆에 마지막으로 누른 빠른선택 이름을 적어 둔다(예: '금월(~오늘)'). */
  const [pickedLabel, setPickedLabel] = useState('')

  return (
    <ul className="ec-cond" style={{ marginBottom: 8 }}>
      {mode && onModeChange && (
        <EcCond label="구분">
          <div className="ec-pills">
            {(modes ?? ['내역', '집계', '라인별']).map((m) => (
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

      <EcCond label={dateLabel}>
        {pickedLabel && (
          <span style={{ fontSize: 12, color: 'var(--ec-blue)', marginRight: 6 }}>{pickedLabel}</span>
        )}
        <input type="date" className="ec-input" value={from}
               onChange={(e) => {
                 setPickedLabel('')
                 onPeriod(single ? { from: e.target.value, to: e.target.value } : { from: e.target.value, to })
               }} style={{ width: 140 }} />
        {!single && (
          <>
            <span style={{ color: 'var(--ec-label)' }}>~</span>
            <input type="date" className="ec-input" value={to}
                   onChange={(e) => { setPickedLabel(''); onPeriod({ from, to: e.target.value }) }} style={{ width: 140 }} />
          </>
        )}
      </EcCond>

      <EcCond label="">
        <EcPeriodPicks
          labels={picks} currentFrom={from} fiscalStart={fiscalStart}
          // 한 날짜짜리 화면은 구간을 받아도 시작일만 쓴다 — 끝을 같이 맞춰 돌려준다.
          onPick={(r) => onPeriod(single ? { from: r.to, to: r.to } : r)}
          onPickLabel={setPickedLabel}
        />
      </EcCond>

      {children}

      {/* 원본 차례: … 정렬/소계기준 · 데이터 보기형식 (사본 실측). */}
      {subtotal && subtotals && onSubtotalChange && (
        <EcCond label="정렬/소계기준">
          <div className="ec-pills">
            {subtotals.map((v) => (
              <button
                key={v} type="button"
                className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                onClick={() => onSubtotalChange(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </EcCond>
      )}

      {/* 원본 [데이터 보기형식] — 조건 판의 맨 아래줄이다(사본 실측). */}
      {view && onViewChange && (
        <EcCond label="데이터 보기형식">
          <div className="ec-pills">
            {(['표', '그래프'] as const).map((v) => (
              <button
                key={v} type="button"
                className={`ec-pill no-ec${view === v ? ' active' : ''}`}
                onClick={() => onViewChange(v)}
              >
                {v === '그래프' ? '그래프로 보기' : '표'}
              </button>
            ))}
          </div>
        </EcCond>
      )}
    </ul>
  )
}
