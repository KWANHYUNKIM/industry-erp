import { vatSlipAmounts } from './vatSlip'

/**
 * 회계전표 한 장이 <b>매출 (세금)계산서</b>인가 — 매출(세금)계산서요약 · (세금)계산서진행단계가 같은 규칙으로 센다.
 * 2026-10-13 loginaa 2026/01 ~ 2026/10: 요약 미발행 38건 = 진행단계 미발행 탭 38건(줄이 회계전표 일자-No. — 같은 회계전표를 센다).
 *
 * <p>부가세유형이 있으면 그것으로 가른다 — 계산서분류 다섯(세금계산서 · 세금계산서(고정자산) · 영세율 · 계산서 · 계산서(고정자산))만,
 * 카드매출 · 현금영수증 · 소매 · 수출 … 은 계산서가 아니다. 유형이 없는 전표(판매 회계반영 등)는 부가세가 0 이면 계산서다.
 */
export const INVOICE_TYPES = ['세금계산서', '세.계(고정자산)', '영세율', '계산서', '계산서(고정자산)'] as const
export type InvoiceType = (typeof INVOICE_TYPES)[number]

interface Line { accountCode: string; debit: number | string; credit: number | string }

export interface SalesInvoice {
  /** 구분 — 매출(세금)계산서요약의 [◉세금계산서 ○계산서]. 영세율은 세금계산서다. */
  kind: '세금계산서' | '계산서'
  /** 계산서분류 — 유형이 없는 전표는 부가세로 세금계산서 · 계산서 둘 가운데 하나. */
  type: InvoiceType
  supply: number
  vat: number
}

export function salesInvoiceOf(e: { lines: readonly Line[]; vatType?: string | null }): SalesInvoice | null {
  const vt = e.vatType?.trim() || null
  if (vt && !(INVOICE_TYPES as readonly string[]).includes(vt)) return null
  let amt = vatSlipAmounts(e.lines, '매출')
  /* 계산서(면세)는 부가세 줄이 없다 — 매출 계정 대변이 곧 공급가액(지급수수료 831 짝은 지운다). */
  if (!amt && vt?.startsWith('계산서')) {
    amt = { supply: e.lines.reduce((t, l) => t + Number(l.credit) - (l.accountCode === '8319' ? Number(l.debit) : 0), 0), vat: 0 }
  }
  if (!amt) return null
  const isTax = vt ? !vt.startsWith('계산서') : amt.vat !== 0
  const type = (vt ?? (isTax ? '세금계산서' : '계산서')) as InvoiceType
  return { kind: isTax ? '세금계산서' : '계산서', type, supply: amt.supply, vat: amt.vat }
}

export type DocKind = 'PAPER' | 'ELECTRONIC' | 'MODIFY_ERROR' | 'MODIFY_AMOUNT' | 'MODIFY_RETURN' | 'MODIFY_CANCEL' | 'MODIFY_LC' | 'MODIFY_DUPLICATE'
export type Progress = 'NONE' | 'LATE' | 'ELSEWHERE'
/** 각종구분값변경에서 매긴 값(/api/vat-invoice-marks). */
export interface InvoiceMark { journalEntryId: number; docKind: DocKind; progress: Progress }
export type Bucket = 'PAPER' | 'UNSENT' | 'ELSEWHERE' | 'LATE'

/**
 * 진행상태 → 칸. 국세청 전송을 하지 않으므로 전자(세금)계산서는 모두 '미발행'이다(전송대기 · 결과대기 · 전송완료 · 오류는 늘 0).
 * 타발행 · 기한후 발행이 종이/전자보다 먼저다.
 */
export function bucketOf(m: InvoiceMark | undefined): Bucket {
  if (m?.progress === 'ELSEWHERE') return 'ELSEWHERE'
  if (m?.progress === 'LATE') return 'LATE'
  if (m?.docKind === 'PAPER') return 'PAPER'
  return 'UNSENT'
}
