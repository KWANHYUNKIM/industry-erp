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

/**
 * 화면 하나에만 있는 축. GROUP_KEYS(판매·구매·발주 드롭다운이 그대로 펼친다)에는 넣지 않는다.
 * 생산불출현황 원본 집계조건은 창고를 [보낸창고명]·[받는창고명] 둘로 가르고 [품목그룹1] 이 있다(2026-10-02 실측).
 */
export const EXTRA_GROUP_KEYS = ['보낸창고별', '받는창고별', '품목그룹1별'] as const

export type GroupKey = (typeof GROUP_KEYS)[number] | (typeof EXTRA_GROUP_KEYS)[number]

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
  /** 받는 쪽 창고(생산불출의 받는공장). 없는 화면은 비운다. */
  toWarehouseName?: string | null
  /** 품목그룹1 이름. 없는 화면은 비운다. */
  itemGroupName?: string | null
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

/**
 * 한 행이 어느 그룹에 속하는지. 값이 없으면 묶어서 보여 준다 — 빈칸이 흩어지면 못 읽는다.
 *
 * <p>'값이 없다'는 null 뿐 아니라 <b>빈 문자열</b>도 포함한다. 예전엔 관리항목만 빈 문자열을
 * 묶고 담당자·프로젝트는 안 묶어서, 이름이 빈 값이면 이름 없는 그룹이 따로 생겼다.
 */
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
    case '담당자별': return r.employeeName || '(미지정)'
    case '창고별': return r.warehouseName
    case '보낸창고별': return r.warehouseName || '(없음)'
    case '받는창고별': return r.toWarehouseName || '(없음)'
    case '품목그룹1별': return r.itemGroupName || '(없음)'
    case '거래유형별': return r.taxable ? '과세' : '면세'
    case '거래처별': return r.partner
    case '프로젝트별': return r.projectName || '(없음)'
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

/**
 * 원본 집계 [기타] 의 [코드포함] — 켜면 묶음 이름 앞에 그 코드 열이 선다(2026-10-02 loginaa 생산불출현황 실측:
 * 보낸창고명으로 묶으면 [보낸창고명코드 | 보낸창고명 | 수량]). 코드가 없는 축(날짜·전표·거래유형·관리항목)은 열을 안 세운다.
 */
export const GROUP_CODE_LABEL: Partial<Record<GroupKey, string>> = {
  품목별: '품목코드', 창고별: '창고코드', 보낸창고별: '보낸창고코드', 받는창고별: '받는창고코드', 담당자별: '담당자코드', 프로젝트별: '프로젝트코드', 거래처별: '거래처코드',
}

/** 묶음 이름 → 코드. 같은 이름에 코드가 둘이면 먼저 본 것을 쓴다(이름으로 묶었으므로 한 칸에 하나만 적을 수 있다). */
export function groupCodes<R>(
  rows: R[], key: GroupKey | '', toAgg: (r: R) => AggregatableRow, codeOf: (r: R, key: GroupKey) => string | null | undefined,
): Map<string, string> {
  const m = new Map<string, string>()
  if (!key || !GROUP_CODE_LABEL[key]) return m
  for (const r of rows) {
    const g = groupValue(toAgg(r), key)
    if (!m.has(g)) m.set(g, codeOf(r, key) ?? '')
  }
  return m
}

/**
 * 원본 집계조건 옆 정렬 선택상자(2026-10-02 생산입고현황 실측): 코드순(기본) · 코드명순 · 수량 · 공급가액 · 부가세 · 합계 ·
 * 노무시간 · 경비시간, 그리고 오름/내림 단추. 생산 현황에는 공급가액·부가세가 없고(생산금액은 평가단가로 센 값이라 다른 값이다)
 * 노무·경비시간도 안 남기므로 셋만 둔다.
 */
export const AGG_SORTS = ['코드순', '코드명순', '수량'] as const
export type AggSort = (typeof AGG_SORTS)[number]

/** 코드순은 묶음 코드(없으면 이름 — 날짜 축은 날짜 그대로가 곧 차례다), 코드명순은 이름, 수량은 수량. 조건1 이 같으면 조건2 로. */
export function sortAggregated(
  rows: AggregatedRow[], by: AggSort, desc: boolean, codes1: Map<string, string>, codes2: Map<string, string>,
): AggregatedRow[] {
  const key = (g: string, codes: Map<string, string>) => (by === '코드순' ? codes.get(g) || g : g)
  const cmp = (a: AggregatedRow, b: AggregatedRow) => by === '수량'
    ? a.qty - b.qty
    : key(a.g1, codes1).localeCompare(key(b.g1, codes1), 'ko') || key(a.g2, codes2).localeCompare(key(b.g2, codes2), 'ko')
  const out = [...rows].sort(cmp)
  return desc ? out.reverse() : out
}
