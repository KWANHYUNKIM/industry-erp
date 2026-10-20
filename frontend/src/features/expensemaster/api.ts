import { api, extractErrorMessage } from '../../api/client'
import type { BottomAction } from '../../components/EcListShell'
import { ecAlert, ecConfirm, NO_SELECTION_MESSAGE } from '../../components/EcDialog'

/** 회계 II › 비용관리 기본사항(E060808 · E060809 · E060810) — 서버 /api/expense-control-types · expense-items · expense-groups. */

export type ExpensePeriodType = 'DESIGNATED' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'EACH'
export type ExpenseLimitType = 'PERSONAL_SAME' | 'PERSONAL_EACH' | 'TOTAL'
export type ExpenseNoticeType = 'NONE' | 'WARN' | 'BLOCK'

/** 원본 통제유형등록 [기간] ▾ 차례 */
export const PERIOD_TYPES: [ExpensePeriodType, string][] = [
  ['DESIGNATED', '지정기간'], ['DAILY', '매일반복'], ['WEEKLY', '매주반복'],
  ['MONTHLY', '매월반복'], ['YEARLY', '매년반복'], ['EACH', '매회반복'],
]
export const LIMIT_TYPES: [ExpenseLimitType, string][] = [
  ['PERSONAL_SAME', '개인별(동일금액)'], ['PERSONAL_EACH', '개인별(별도금액)'], ['TOTAL', '총금액'],
]
export const NOTICE_TYPES: [ExpenseNoticeType, string][] = [
  ['NONE', '사용안함'], ['WARN', '경고 및 알림'], ['BLOCK', '저장불가'],
]

export interface ExpenseControlType {
  id: number
  code: string
  name: string
  periodType: ExpensePeriodType
  periodTypeName: string
  personControl: boolean
  limitType: ExpenseLimitType
  limitTypeName: string
  noticeType: ExpenseNoticeType
  noticeTypeName: string
  remark: string | null
  active: boolean
}

export interface ExpenseItem {
  id: number
  code: string
  name: string
  accountId: number | null
  accountCode: string | null
  accountName: string | null
  controlTypeId: number | null
  controlTypeCode: string | null
  controlTypeName: string | null
  periodTypeName: string | null
  personControlName: string
  limitTypeName: string
  limitAmount: number | null
  employeeIds: number[]
  remark: string | null
  active: boolean
}

export interface ExpenseGroup {
  id: number
  code: string
  name: string
  controlTypeId: number | null
  controlTypeCode: string | null
  controlTypeName: string | null
  periodTypeName: string | null
  personControlName: string
  limitTypeName: string
  items: { id: number; code: string; name: string }[]
  addInput: boolean
  remark: string | null
  active: boolean
}

/**
 * 마스터 리스트 하단 [사용중단/재사용 ▴] — 원본(2026-10-20 실측)은 위로 펴는 메뉴: 사용중단 · 삭제 · 재사용 · 사용중단/재사용(보기 바꾸기).
 * 체크칸을 고르고 [삭제] → '삭제하겠습니까?' [확인] → 목록에서 사라진다. 고른 줄이 없으면 원본 알림.
 */
export function activeMenuAction(base: string, picked: number[], toggleView: () => void, reload: () => void): BottomAction {
  const run = async (fn: () => Promise<unknown>) => {
    if (picked.length === 0) { await ecAlert(NO_SELECTION_MESSAGE); return }
    try { await fn() } catch (e) { await ecAlert(extractErrorMessage(e)) }
    reload()
  }
  return {
    label: '사용중단/재사용',
    onClick: toggleView,
    menu: [
      { label: '사용중단', onClick: () => void run(() => api.post(`${base}/active?active=false`, picked)) },
      { label: '삭제', onClick: () => void run(async () => { if (await ecConfirm('삭제하겠습니까?')) await api.post(`${base}/delete`, picked) }) },
      { label: '재사용', onClick: () => void run(() => api.post(`${base}/active?active=true`, picked)) },
      { label: '사용중단/재사용', onClick: toggleView },
    ],
  }
}
