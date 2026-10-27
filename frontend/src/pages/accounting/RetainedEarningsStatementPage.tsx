import StatementSheetScreen, { type SheetConfig, type SheetItem } from '../../features/statementsheet/StatementSheetScreen'

const P = (key: string): { key: string; sign: 1 } => ({ key, sign: 1 })
const M = (key: string): { key: string; sign: -1 } => ({ key, sign: -1 })
const free = (prefix: string, n: number): SheetItem[] =>
  Array.from({ length: n }, (_, i) => ({ key: `${prefix}${i + 1}`, label: '', free: true, indent: 1 as const }))

/**
 * 원본 [입력] 창 과목 차례(2026-10-20 loginaa 실측) — 과목 | 금액 두 칸(왼 세부, 오른 묶음).
 * Ⅰ 아래 1 ~ 5 다음 빈 줄 다섯, Ⅱ 아래 빈 줄 열, 합계, Ⅲ 아래 1 ~ 6(3 은 가 · 나) 다음 빈 줄 넷, Ⅳ.
 */
const I_FREE = free('i_x', 5)
const II_FREE = free('ii_x', 10)
const III_FREE = free('iii_x', 4)
const ITEMS: SheetItem[] = [
  { key: 'i', label: 'I.처분전이익잉여금', group: true,
    sum: [P('i1'), P('i2'), P('i3'), M('i4'), P('i5'), ...I_FREE.map((f) => P(f.key))] },
  { key: 'i1', label: '1.전기이월이익잉여금', indent: 1 },
  { key: 'i2', label: '2.회계변경의기준효과', indent: 1 },
  { key: 'i3', label: '3.전기오류수정이익', indent: 1 },
  { key: 'i4', label: '4.전기오류수정손실', indent: 1 },
  { key: 'i5', label: '5.당기순이익', indent: 1 },
  ...I_FREE,
  { key: 'ii', label: 'II.임의적립금등의이입액', group: true, sum: II_FREE.map((f) => P(f.key)) },
  ...II_FREE,
  { key: 'total', label: '합계', group: true, sum: [P('i'), P('ii')] },
  { key: 'iii', label: 'III.이익잉여금처분액', group: true,
    sum: [P('iii1'), P('iii2'), P('iii3'), P('iii4'), P('iii5'), P('iii6'), ...III_FREE.map((f) => P(f.key))] },
  { key: 'iii1', label: '1.이익준비금', indent: 1 },
  { key: 'iii2', label: '2.기업합리화적립금', indent: 1 },
  { key: 'iii3', label: '3.배당금', indent: 1, group: true, sum: [P('iii3a'), P('iii3b')] },
  { key: 'iii3a', label: '가.현금배당', indent: 2 },
  { key: 'iii3b', label: '나.주식배당', indent: 2 },
  { key: 'iii4', label: '4.사업확장적립금', indent: 1 },
  { key: 'iii5', label: '5.감채적립금', indent: 1 },
  { key: 'iii6', label: '6.배당평균적립금', indent: 1 },
  ...III_FREE,
  { key: 'iv', label: 'IV.차기이월이익잉여금', group: true, sum: [P('total'), M('iii')] },
]

const CONFIG: SheetConfig = {
  kind: 'RETAINED_EARNINGS',
  title: '이익잉여금처분계산서',
  items: ITEMS,
  /* 원본 목록 머리(2026-10-20) — 회계기수 · 아래 넷 · 인쇄. 금액은 저장 전에도 0 으로 찍는다. */
  listCols: [
    { key: 'i', label: '처분전이익잉여금' },
    { key: 'ii', label: '임의적립금등의이입액' },
    { key: 'iii', label: '이익잉여금처분액' },
    { key: 'iv', label: '차기이월이익잉여금' },
  ],
  inputColumn: false,
  settleDate: true,
  twoColumns: true,
}

/**
 * 회계 I › 출력물 › 주요재무제표 › <b>이익잉여금처분계산서</b>(E010817) — 2026-10-20 loginaa 실측.
 * [신규(F2)] 창: 회계기수 · 기간 2026/01 ~ 2026/12 · 처분확정일(기본 오늘) → 목록 '1 (2026/01 ~ 2026/12 )' 줄(금액 0) ·
 * 회계기수 글자 → 과목 | 금액 창(머리: 회계기수 · 기간 · 처분확정일) [저장(F8)] [닫기] [삭제] — 여기 [삭제] 가 그 줄을 지운다.
 */
export default function RetainedEarningsStatementPage() {
  return <StatementSheetScreen config={CONFIG} />
}
