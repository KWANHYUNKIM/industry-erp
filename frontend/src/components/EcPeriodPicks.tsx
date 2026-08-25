/**
 * 기간 빠른선택 — 이카운트 조회 조건 화면 하단의
 * [금일][전일][금주(~오늘)][전주][금월][전월][금년][전년][종료일][최근3일+7일] 버튼줄.
 *
 * <p>원본은 이 줄을 **여러 조회 화면이 공통으로** 쓴다(업무일지·현황류 등). 우리는 어디에도 없어서
 * 사용자가 기간을 매번 손으로 찍어야 했다. 화면마다 따로 만들지 않도록 컴포넌트로 둔다.
 *
 * <p>날짜 계산은 <b>로컬 기준</b>이다. `new Date().toISOString()` 은 UTC 로 바꾸므로
 * 한국(UTC+9)에서 오전 9시 이전이면 <b>어제 날짜</b>가 나온다 — 그 함정을 피하려고 직접 만든다.
 */

/** Date → 'YYYY-MM-DD' (로컬 기준) */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** 그 주의 월요일. 이카운트의 '주'는 월요일 시작이다. */
const mondayOf = (d: Date) => {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7   // 월=0 … 일=6
  return addDays(x, -dow)
}

export interface PeriodRange { from: string; to: string }

/** 라벨 → 기간. 오늘을 인자로 받아 순수 함수로 둔다(시험하기 쉽게). */
/**
 * @param fiscalStart 회계연도 시작월(1~12). '이번기수'·'직전기수' 를 계산할 때만 쓴다.
 *                    설정(Preference.fiscalStart)에서 온다 — 회사마다 다르므로 1월로 넘겨짚지 않는다.
 */
export function periodOf(label: string, today = new Date(), fiscalStart?: number): PeriodRange | null {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  switch (label) {
    case '금일':
      return { from: ymd(t), to: ymd(t) }
    case '전일': {
      const y = addDays(t, -1)
      return { from: ymd(y), to: ymd(y) }
    }
    case '금주(~오늘)':
      return { from: ymd(mondayOf(t)), to: ymd(t) }
    case '전주': {
      const mon = addDays(mondayOf(t), -7)
      return { from: ymd(mon), to: ymd(addDays(mon, 6)) }
    }
    case '금월':
      return {
        from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)),
        to: ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0)),
      }
    case '전월':
      return {
        from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        to: ymd(new Date(t.getFullYear(), t.getMonth(), 0)),
      }
    case '금년':
      return { from: ymd(new Date(t.getFullYear(), 0, 1)), to: ymd(new Date(t.getFullYear(), 11, 31)) }
    case '전년':
      return { from: ymd(new Date(t.getFullYear() - 1, 0, 1)), to: ymd(new Date(t.getFullYear() - 1, 11, 31)) }
    // 원본 그대로의 이름. 오늘 기준 사흘 전부터 이레 뒤까지 — 지난 일과 다가올 일을 함께 본다.
    case '최근3일+7일':
      return { from: ymd(addDays(t, -3)), to: ymd(addDays(t, 7)) }
    // 현황 화면에서 쓰는 것들. '금월' 과 달리 월말이 아니라 **오늘**까지다.
    case '금월(~오늘)':
      return { from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) }
    case '전월+금월':
      return {
        from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        to: ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0)),
      }
    // 이번 달 마지막 날 하루. 원본 건설예정공정표 버튼줄에 있다.
    case '말일': {
      const last = new Date(t.getFullYear(), t.getMonth() + 1, 0)
      return { from: ymd(last), to: ymd(last) }
    }
    // 이카운트의 '주'는 월요일 시작이다(mondayOf 와 같은 규칙).
    case '금주': {
      const mon = mondayOf(t)
      return { from: ymd(mon), to: ymd(addDays(mon, 6)) }
    }
    case '차주': {
      const mon = addDays(mondayOf(t), 7)
      return { from: ymd(mon), to: ymd(addDays(mon, 6)) }
    }
    case '차월':
      return {
        from: ymd(new Date(t.getFullYear(), t.getMonth() + 1, 1)),
        to: ymd(new Date(t.getFullYear(), t.getMonth() + 2, 0)),
      }
    /*
     * 회계 기수. 시작월이 4월이면 4/1~다음해 3/31 이 한 기수다.
     * 오늘이 시작월 전이면 아직 지난해에 시작한 기수 안에 있다.
     */
    case '이번기수':
    case '직전기수': {
      if (!fiscalStart) return null   // 설정을 모르면 계산하지 않는다(1월이라고 넘겨짚지 않는다)
      const m = fiscalStart - 1
      let y = t.getFullYear()
      if (t.getMonth() < m) y -= 1
      if (label === '직전기수') y -= 1
      return {
        from: ymd(new Date(y, m, 1)),
        to: ymd(new Date(y + 1, m, 0)),
      }
    }
    /**
     * 시작일은 그대로 두고 종료일만 오늘로 당긴다. 원본 버튼줄에 이 이름이 있다.
     * 시작일을 모르므로 빈 문자열을 돌려주는데, 이걸 그대로 넣으면 시작일이 지워진다 —
     * {@link EcPeriodPicks} 가 currentFrom 으로 채워서 넘긴다. 직접 부르는 곳은 주의할 것.
     */
    case '종료일':
      return { from: '', to: ymd(t) }
    default:
      return null
  }
}

/**
 * 화면마다 쓰는 항목이 다르다 — 원본에서 실제로 확인한 두 묶음이다.
 *   업무일지 : 금일·전일·금주(~오늘)·전주·금월·전월·금년·전년·종료일·최근3일+7일
 *   판매현황 : 금일·전일·금주(~오늘)·전주·**금월(~오늘)**·전월·**전월+금월**
 *   출퇴근현황 : 금일·전일·금주(~오늘)·전주·금월(~오늘)·전월·**종료일**
 *   건설예정공정표 : 금일·전일·**말일**·전주·**금주**·**차주**·전월·금월·**차월**
 * 그래서 목록을 받는다. 기본값은 업무일지 묶음.
 */
export const JOURNAL_PICKS = [
  '금일', '전일', '금주(~오늘)', '전주', '금월', '전월', '금년', '전년', '최근3일+7일',
] as const

/**
 * 조회·현황 화면 묶음들의 <b>공통 앞부분</b>. 원본에서 확인한 화면들이 이 여섯 개를 똑같이 쓰고
 * 뒤에 붙는 것만 다르다 — 그래서 뒤만 갈아 끼우도록 이어 붙인다.
 */
const BASE_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월'] as const

/** 판매현황·구매현황 */
export const STATUS_PICKS = [...BASE_PICKS, '전월+금월'] as const

/** 출/퇴근현황(ID)(E070306) · 주문서현황(E040209) */
export const INQUIRY_PICKS = [...BASE_PICKS, '종료일'] as const

/**
 * 재고현황(E040701) — <b>금일·전일 둘뿐</b>이다.
 * 재고는 구간이 아니라 시점을 보는 것이라 '금주'·'금월' 같은 구간 버튼이 뜻이 없다.
 */
export const STOCK_PICKS = ['금일', '전일'] as const

/** 수금현황(E040217) — 회계 기수 둘이 더 붙는다 */
export const SETTLE_PICKS = [...BASE_PICKS, '이번기수', '직전기수', '종료일'] as const

/** 미주문현황(E040211) — 둘 다 붙는다 */
export const INQUIRY_FULL_PICKS = [...BASE_PICKS, '종료일', '전월+금월'] as const

/**
 * 건설예정공정표(C000044) 묶음 — 앞으로의 일정을 보는 화면이라 '차주·차월' 처럼
 * 미래 구간이 들어 있다. 조회 화면들과 라인업이 꽤 다르다.
 */
export const PROJECT_PICKS = [
  '금일', '전일', '말일', '전주', '금주', '차주', '전월', '금월', '차월',
] as const

/**
 * 비교기간 — 원본 현황 화면의 [사용안함 / 전년동일기간 / 전월동일기간 / 전주동일기간 / 전일동일기간].
 * 지금 보는 구간을 통째로 한 해·한 달·한 주·하루 앞으로 옮긴 구간을 돌려준다.
 * 길이를 유지하려고 <b>시작일을 옮기고 같은 일수를 더한다</b> —
 * 월 단위로 두 끝을 각각 옮기면 말일(1/31 → 12/31 vs 2/28) 때문에 구간 길이가 달라진다.
 */
export type ComparePeriod = '사용안함' | '전년동일기간' | '전월동일기간' | '전주동일기간' | '전일동일기간'

export const COMPARE_PERIODS: readonly ComparePeriod[] = [
  '사용안함', '전년동일기간', '전월동일기간', '전주동일기간', '전일동일기간',
]

export function comparePeriodOf(from: string, to: string, kind: ComparePeriod): PeriodRange | null {
  if (kind === '사용안함' || !from || !to) return null
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to + 'T00:00:00')
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return null
  const days = Math.round((t.getTime() - f.getTime()) / 86400000)

  const start = new Date(f)
  switch (kind) {
    case '전년동일기간': start.setFullYear(start.getFullYear() - 1); break
    case '전월동일기간': start.setMonth(start.getMonth() - 1); break
    case '전주동일기간': start.setDate(start.getDate() - 7); break
    case '전일동일기간': start.setDate(start.getDate() - 1); break
    default: return null
  }
  const end = new Date(start)
  end.setDate(end.getDate() + days)
  return { from: ymd(start), to: ymd(end) }
}

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
