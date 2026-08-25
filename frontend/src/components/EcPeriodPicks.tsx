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
export function periodOf(label: string, today = new Date()): PeriodRange | null {
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
    default:
      return null
  }
}

/**
 * 화면마다 쓰는 항목이 다르다 — 원본에서 실제로 확인한 두 묶음이다.
 *   업무일지 : 금일·전일·금주(~오늘)·전주·금월·전월·금년·전년·종료일·최근3일+7일
 *   판매현황 : 금일·전일·금주(~오늘)·전주·**금월(~오늘)**·전월·**전월+금월**
 * 그래서 목록을 받는다. 기본값은 업무일지 묶음.
 */
export const JOURNAL_PICKS = [
  '금일', '전일', '금주(~오늘)', '전주', '금월', '전월', '금년', '전년', '최근3일+7일',
] as const

export const STATUS_PICKS = [
  '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '전월+금월',
] as const

export default function EcPeriodPicks({
  onPick,
  labels = JOURNAL_PICKS,
}: {
  onPick: (r: PeriodRange) => void
  labels?: readonly string[]
}) {
  return (
    <>
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          className="ec-btn"
          onClick={() => {
            const r = periodOf(label)
            if (r) onPick(r)
          }}
        >
          {label}
        </button>
      ))}
    </>
  )
}
