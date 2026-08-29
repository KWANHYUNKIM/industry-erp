/**
 * 기간 계산 — 화면 50여 곳이 쓰는 순수 로직.
 *
 * <p>JSX 가 없는 .ts 로 따로 둔 이유: 이 계산은 <b>테스트로 못 박아야 하는데</b>
 * .tsx 안에 있으면 Node 내장 러너(--experimental-strip-types)가 JSX 때문에 못 읽는다.
 * 버튼줄 컴포넌트는 EcPeriodPicks.tsx 에 남아 있고, 거기서 이 파일을 다시 내보내므로
 * 기존 import 경로는 그대로 쓰면 된다.
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
    /*
     * 원본 작업지시서작업처리의 기본 기간. 지난 30일부터 <b>앞으로 한 달</b>까지다.
     *
     * <p>앞으로 할 일을 고르는 화면이라 <b>미래가 들어간다</b> — 오늘까지만 보면
     * 아직 안 온 납기의 작업지시가 목록에서 빠져 "할 일이 없다" 로 보인다.
     * 한 달 뒤는 <b>같은 날</b>이다(월말 보정 없이 setMonth +1) — 3/31 의 한 달 뒤는 4/30 이 아니라
     * 5/1 이 되지만, 원본도 그 자리를 '(+1개월)' 이라고만 부르고 하루 이틀 차이를 따지지 않는다.
     */
    case '최근30일(+1개월)': {
      const end = new Date(t.getFullYear(), t.getMonth() + 1, t.getDate())
      return { from: ymd(addDays(t, -30)), to: ymd(end) }
    }
    // 현황 화면에서 쓰는 것들. '금월' 과 달리 월말이 아니라 **오늘**까지다.
    case '금월(~오늘)':
      return { from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) }
    case '전월+금월':
      return {
        from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        to: ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0)),
      }
    /*
     * <b>직전분기</b> — 지금 분기의 <b>바로 앞</b> 세 달을 통째로. 1~3월이면 작년 10~12월이다.
     * A/S접수현황·A/S수리현황 버튼줄에 있다(사본 실측) — 분기로 접수량을 견주는 화면이라서다.
     */
    case '직전분기': {
      const q = Math.floor(t.getMonth() / 3) - 1
      const y = q < 0 ? t.getFullYear() - 1 : t.getFullYear()
      const m = ((q % 4) + 4) % 4 * 3
      return {
        from: ymd(new Date(y, m, 1)),
        to: ymd(new Date(y, m + 3, 0)),
      }
    }
    /*
     * <b>직전반기</b> — 지금 반기의 바로 앞 여섯 달. 상반기(1~6월)에 있으면 작년 하반기다.
     */
    case '직전반기': {
      const firstHalf = t.getMonth() < 6
      const y = firstHalf ? t.getFullYear() - 1 : t.getFullYear()
      const m = firstHalf ? 6 : 0
      return {
        from: ymd(new Date(y, m, 1)),
        to: ymd(new Date(y, m + 6, 0)),
      }
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
    /*
     * 이번 기수의 시작부터 <b>지난달 말일까지</b>. 원본 결제내역자료비교의 버튼이다.
     * 이번 달은 아직 마감 전이라 대사에서 빼고 보는 자리다.
     * 기수가 이번 달에 막 시작했으면 볼 구간이 없으므로 시작일 하루로 접는다.
     */
    case '이번기수(~전월)': {
      if (!fiscalStart) return null
      const m = fiscalStart - 1
      let y = t.getFullYear()
      if (t.getMonth() < m) y -= 1
      const start = new Date(y, m, 1)
      const end = new Date(t.getFullYear(), t.getMonth(), 0)   // 지난달 말일
      return end < start
        ? { from: ymd(start), to: ymd(start) }
        : { from: ymd(start), to: ymd(end) }
    }
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
 * 단가요청현황(E040325) — 조회 묶음에 <b>금년·전년</b>이 더 붙는다(사본 실측).
 * 단가는 한 해 단위로 다시 받는 일이 흔해서 해 단위 버튼이 있다.
 * 같은 파일이 그리는 발주요청현황·발주계획현황에는 그 둘이 없다 — 화면마다 다르다.
 */
/**
 * 견적서조회(E040202) — 조회 묶음에 <b>최근30일(+1개월)</b>이 뒤에 붙는다(사본 실측).
 * 견적은 <b>앞으로</b>의 일이라 아직 안 온 날짜까지 봐야 한다 — 작업지시서조회와 같은 까닭이다.
 * 차례도 원본대로 [종료일] 다음이다.
 */
/**
 * A/S접수현황·A/S수리현황(E040610·E040611) — 조회 묶음에 <b>직전분기·직전반기</b>가 붙는다
 * (사본 실측). A/S 는 분기·반기로 접수량을 견주는 일이 흔하다.
 */
export const AS_PICKS = [...BASE_PICKS, '직전분기', '직전반기', '종료일'] as const

export const QUOTATION_PICKS = [...BASE_PICKS, '종료일', '최근30일(+1개월)'] as const

export const PRICE_REQUEST_PICKS = [...BASE_PICKS, '금년', '전년', '종료일'] as const

/**
 * 재고현황(E040701) — <b>금일·전일 둘뿐</b>이다.
 * 재고는 구간이 아니라 시점을 보는 것이라 '금주'·'금월' 같은 구간 버튼이 뜻이 없다.
 */
export const STOCK_PICKS = ['금일', '전일'] as const

/** 수금현황(E040217) — 회계 기수 둘이 더 붙는다 */
export const SETTLE_PICKS = [...BASE_PICKS, '이번기수', '직전기수', '종료일'] as const

/**
 * 결제내역자료비교(E040220) — 원본 사본 실측. <b>'전월' 이 없고</b> 대신
 * '이번기수(~전월)' 이 붙는다. 대사는 마감된 구간을 보는 자리라 이번 달을 빼고 본다.
 */
export const COMPARE_PICKS = [
  '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '종료일', '이번기수(~전월)',
] as const

/**
 * 작업지시서작업처리(ESJ048M) — 앞으로 할 일을 고르는 화면이라 <b>미래가 들어간다</b>.
 * 원본 기본값이 '최근30일(+1개월)' 이고, 그 버튼도 그 자리에 있다.
 */
export const WORK_PROCESS_PICKS = [...BASE_PICKS, '최근30일(+1개월)', '종료일'] as const

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

/**
 * 달을 옮긴다. 옮긴 달에 그 날짜가 없으면 <b>그 달의 말일로 당긴다.</b>
 *
 * <p>Date.setMonth 를 그냥 쓰면 없는 날짜가 다음 달로 넘어간다. 3월 31일에서 한 달을 빼면
 * 2월 31일 → <b>3월 3일</b>이 됐다. '전월동일기간'을 골랐는데 비교 대상이 같은 달로 돌아와
 * 지금 보는 구간과 겹쳤다. 2028년 2월 29일의 전년은 2027년 3월 1일이 됐다.
 *
 * <p>말일로 당기는 것이 맞다 — 3월 31일의 한 달 전은 2월 28일(윤년이면 29일)이다.
 */
export function shiftMonths(d: Date, months: number): Date {
  const day = d.getDate()
  const moved = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const lastDay = new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate()
  moved.setDate(Math.min(day, lastDay))
  return moved
}

export function comparePeriodOf(from: string, to: string, kind: ComparePeriod): PeriodRange | null {
  if (kind === '사용안함' || !from || !to) return null
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to + 'T00:00:00')
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return null
  const days = Math.round((t.getTime() - f.getTime()) / 86400000)

  let start: Date
  switch (kind) {
    case '전년동일기간': start = shiftMonths(f, -12); break
    case '전월동일기간': start = shiftMonths(f, -1); break
    case '전주동일기간': start = new Date(f); start.setDate(start.getDate() - 7); break
    case '전일동일기간': start = new Date(f); start.setDate(start.getDate() - 1); break
    default: return null
  }
  const end = new Date(start)
  end.setDate(end.getDate() + days)
  return { from: ymd(start), to: ymd(end) }
}
