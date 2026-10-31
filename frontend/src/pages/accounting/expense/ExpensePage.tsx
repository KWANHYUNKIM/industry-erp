import { useNavigate } from 'react-router-dom'
import ExpenseSlipForm from '../../../features/expense/ExpenseSlipForm'

/**
 * 회계 II › 비용관리 › 비용내역 › <b>비용내역입력</b>(E060812) — 2026-10-20 loginaa 실측(plans/회계2/비용관리.md 2장).
 *
 * <p>예전 이 자리는 계정과목을 바로 고르고 저장 즉시 분개하는 '지출 등록' 한 장짜리 폼이었다. 원본은 머리(작성일자 · 비용그룹 ·
 * 결제구분 · 비고) + 줄(비용코드 · 사원 …) 이고 <b>저장해도 회계전표가 없다</b> — 개인비용만 전표별회계반영(E060814)에서
 * 가지급금정산서로 분개한다. 계정만 주는 옛 API 요청(결재 · qa.mjs)은 서버가 그대로 즉시 분개한다.
 */
export default function ExpensePage() {
  const navigate = useNavigate()
  return <ExpenseSlipForm onList={() => navigate('/accounting/expense-list')} />
}
