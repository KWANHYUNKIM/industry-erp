import StatementSheetScreen, { type SheetConfig, type SheetItem } from '../../features/statementsheet/StatementSheetScreen'

const P = (key: string): { key: string; sign: 1 } => ({ key, sign: 1 })
const M = (key: string): { key: string; sign: -1 } => ({ key, sign: -1 })

/** 원본 [입력] 창의 항목 차례(2026-10-20 loginaa 실측) — Ⅰ ~ Ⅵ 과 세부 줄. */
const ITEMS: SheetItem[] = [
  { key: 'op', label: 'Ⅰ. 영업활동에 의한 현금흐름', group: true, sum: [P('op1'), P('op2'), M('op3'), P('op4')] },
  { key: 'op1', label: '1. 당기순이익(손실)', indent: 1 },
  { key: 'op2', label: '2. 현금의 유출이 없는 비용 등의 가산', indent: 1, group: true, sum: [P('op2a'), P('op2b')] },
  { key: 'op2a', label: '감가상각비', indent: 2 },
  { key: 'op2b', label: '퇴직급여', indent: 2 },
  { key: 'op3', label: '3. 현금의 유입이 없는 수익 등의 차감', indent: 1, group: true, sum: [P('op3a'), P('op3b')] },
  { key: 'op3a', label: '채무면제이익', indent: 2 },
  { key: 'op3b', label: '외화환산이익', indent: 2 },
  { key: 'op4', label: '4. 영업활동으로 인한 자산부채의 변동', indent: 1, group: true, sum: [P('op4a'), P('op4b'), P('op4c')] },
  { key: 'op4a', label: '재고자산의 감소(증가)', indent: 2 },
  { key: 'op4b', label: '매출채권의 감소(증가)', indent: 2 },
  { key: 'op4c', label: '매입채무의 증가(감소)', indent: 2 },
  { key: 'inv', label: 'Ⅱ. 투자활동으로 인한 현금흐름', group: true, sum: [P('inv1'), M('inv2')] },
  { key: 'inv1', label: '1. 투자활동으로 인한 현금유입액', indent: 1, group: true, sum: [P('inv1a'), P('inv1b')] },
  { key: 'inv1a', label: '단기금융상품의 처분', indent: 2 },
  { key: 'inv1b', label: '토지의 처분', indent: 2 },
  { key: 'inv2', label: '2. 투자활동으로 인한 현금유출액', indent: 1, group: true, sum: [P('inv2a'), P('inv2b')] },
  { key: 'inv2a', label: '현금의 단기대여', indent: 2 },
  { key: 'inv2b', label: '토지의 취득', indent: 2 },
  { key: 'fin', label: 'Ⅲ. 재무활동으로 인한 현금흐름', group: true, sum: [P('fin1'), M('fin2')] },
  { key: 'fin1', label: '1. 재무활동으로 인한 현금유입액', indent: 1, group: true, sum: [P('fin1a'), P('fin1b')] },
  { key: 'fin1a', label: '단기차입금의 차입', indent: 2 },
  { key: 'fin1b', label: '사채의 발행', indent: 2 },
  { key: 'fin2', label: '2.재무활동으로 인한 현금유출액', indent: 1, group: true, sum: [P('fin2a'), P('fin2b')] },
  { key: 'fin2a', label: '단기차입금의 상환', indent: 2 },
  { key: 'fin2b', label: '사채의 상환', indent: 2 },
  { key: 'inc', label: 'Ⅳ. 현금의증가(감소) (Ⅰ+Ⅱ+Ⅲ)', group: true, sum: [P('op'), P('inv'), P('fin')] },
  { key: 'begin', label: 'Ⅴ. 기초의현금', group: true },
  { key: 'end', label: 'Ⅵ. 기말의현금', group: true, sum: [P('inc'), P('begin')] },
]

const CONFIG: SheetConfig = {
  kind: 'CASH_FLOW',
  title: '현금흐름표',
  items: ITEMS,
  /* 원본 목록 머리(2026-10-20) — 회계기수(기간) · 입력 · 아래 11칸 · 인쇄 */
  listCols: [
    { key: 'op', label: 'Ⅰ. 영업활동에 의한 현금흐름' },
    { key: 'op2', label: '2. 현금의 유출이 없는 비용 등의 가산' },
    { key: 'op3', label: '3. 현금의 유입이 없는 수익 등의 차감' },
    { key: 'op4', label: '4. 영업활동으로 인한 자산부채의 변동' },
    { key: 'inv', label: 'Ⅱ. 투자활동으로 인한 현금흐름' },
    { key: 'inv1', label: '1. 투자활동으로 인한 현금유입액' },
    { key: 'inv2', label: '2. 투자활동으로 인한 현금유출액' },
    { key: 'fin', label: 'Ⅲ. 재무활동으로 인한 현금흐름' },
    { key: 'fin1', label: '1. 재무활동으로 인한 현금유입액' },
    { key: 'fin2', label: '2.재무활동으로 인한 현금유출액' },
    { key: 'inc', label: 'Ⅳ. 현금의증가(감소) (Ⅰ+Ⅱ+Ⅲ)' },
  ],
  inputColumn: true,
  settleDate: false,
  twoColumns: false,
}

/**
 * 회계 I › 출력물 › 주요재무제표 › <b>현금흐름표</b>(E010861) — 2026-10-20 loginaa 실측.
 * [신규(F2)] 창: 회계기수 [17] 기 · 기간 2026/01 ~ 2026/12 · 대상항목 ◉전체 ○선택 → 목록에 '17(2026/01 ~ 2026/12)' 줄(금액 칸 빈칸) ·
 * [입력] → 항목명 | 금액 창(Ⅰ ~ Ⅵ, 다 0) · [계산식 적용] [저장(F8)] [삭제] [닫기]. 줄을 지우는 것은 회계기수 글자 → 머리 창 [삭제].
 */
export default function CashFlowStatementPage() {
  return <StatementSheetScreen config={CONFIG} />
}
