/**
 * 현황 화면의 집계 — 이카운트 판매현황·구매현황의 [집계] 모드.
 *
 * <p>원본은 상단 `메뉴 [현황][집계]` 로 모드를 가르고, 집계 모드에서 `집계조건1`·`집계조건2` 로
 * <b>2단계 그룹화</b>를 한다. 판매·구매 두 화면이 같은 규칙을 쓰므로 여기에 모은다 —
 * 같은 계산을 두 곳에 적으면 반드시 어긋난다(부가세 배분을 `VatAllocator` 로 모은 것과 같은 이유).
 *
 * <p>원본 [항목추가] 팝업에서 확인한 기준:
 * 일별·주차별·월별·분기별·반기별·연별·담당자별·창고별·거래유형별·거래처별·프로젝트별·
 * 전표별·관리항목별·품목별·라인별. (라인별은 곧 현황 모드라 여기 없다.)
 */

export const GROUP_KEYS = [
  '일별', '주차별', '월별', '분기별', '반기별', '연별',
  '담당자별', '창고별', '거래유형별', '거래처별', '프로젝트별', '전표별', '관리항목별', '품목별',
] as const

export type GroupKey = (typeof GROUP_KEYS)[number]

/** 집계가 읽는 한 줄. 화면마다 Row 모양이 달라도 이 모양만 맞추면 된다. */
export interface AggregatableRow {
  date: string
  docNo: string
  partner: string
  itemName: string
  qty: number
  supply: number
  vat: number
  warehouseName: string
  projectName: string | null
  taxable: boolean
  employeeName: string | null
  /** 품목의 관리항목. 전표 라인이 아니라 품목 마스터에서 파생한다(원본도 그렇다). */
  managementItemName: string | null
}

/**
 * 그 해 몇 번째 주인가(월요일 시작).
 * `EcPeriodPicks` 의 '주' 와 같은 셈법이어야 한다 — 한쪽만 일요일 시작이면 같은 날이 다른 주가 된다.
 */
export function weekOfYear(iso: string): number {
  const d = new Date(iso)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000)
  return Math.floor((days + ((jan1.getDay() + 6) % 7)) / 7) + 1
}

/** 한 행이 어느 그룹에 속하는지. 값이 없으면 묶어서 보여 준다 — 빈칸이 흩어지면 못 읽는다. */
export function groupValue(r: AggregatableRow, key: GroupKey | ''): string {
  if (!key) return ''
  const month = Number(r.date.slice(5, 7))
  switch (key) {
    case '일별': return r.date
    case '주차별': return `${r.date.slice(0, 4)}년 ${weekOfYear(r.date)}주`
    case '월별': return r.date.slice(0, 7)
    case '분기별': return `${r.date.slice(0, 4)} ${Math.floor((month - 1) / 3) + 1}분기`
    case '반기별': return `${r.date.slice(0, 4)} ${month <= 6 ? '상' : '하'}반기`
    case '연별': return r.date.slice(0, 4)
    case '담당자별': return r.employeeName ?? '(미지정)'
    case '창고별': return r.warehouseName
    case '거래유형별': return r.taxable ? '과세' : '면세'
    case '거래처별': return r.partner
    case '프로젝트별': return r.projectName ?? '(없음)'
    case '전표별': return r.docNo
    case '관리항목별': return r.managementItemName || '(없음)'
    case '품목별': return r.itemName
    default: return ''
  }
}

export interface AggregatedRow {
  g1: string
  g2: string
  count: number
  qty: number
  supply: number
  vat: number
}

/** 조건1(+조건2)로 묶어 수량·금액을 더한다. 금액이 큰 그룹이 위로 온다. */
export function aggregate(
  rows: AggregatableRow[],
  group1: GroupKey | '',
  group2: GroupKey | '',
): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>()
  for (const r of rows) {
    const g1 = groupValue(r, group1)
    const g2 = groupValue(r, group2)
    // 그룹 키를 잇는 구분자. 데이터에 나올 리 없는 기호를 쓴다(널문자는 소스에 박히면 파일이 깨진다).
    const k = `${g1}␟${g2}`
    const cur = map.get(k) ?? { g1, g2, count: 0, qty: 0, supply: 0, vat: 0 }
    cur.count += 1
    cur.qty += r.qty
    cur.supply += r.supply
    cur.vat += r.vat
    map.set(k, cur)
  }
  return [...map.values()].sort((a, b) => b.supply - a.supply)
}
