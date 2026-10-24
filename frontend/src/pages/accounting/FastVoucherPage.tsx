import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import type { FastVoucher } from '../../types/api'
import CashReportEntryPage from './CashReportEntryPage'

type Kind = 'EXPENSE_REPORT' | 'DEPOSIT_REPORT' | 'ADVANCE_SETTLEMENT'
const kindOf = (t: string | null): Kind | null =>
  t === 'EXPENSE_REPORT' || t === 'DEPOSIT_REPORT' || t === 'ADVANCE_SETTLEMENT' ? t : null

/**
 * 회계 I > FastEntry — 지출결의서 · 입금보고서 · 가지급금정산서.
 *
 * 원본 셋은 목록이 아니라 <b>입력 화면</b>이다(2026-10-12 loginaa 실측) — 줄마다 계좌(가지급금정산서는 정산자) ·
 * 계정 · 거래처를 넣는 격자 화면(CashReportEntryPage)으로 연다. 저장한 것은 [리스트](회계거래조회)에서 열어 고치고 지운다.
 * 메뉴가 ?type= 으로 셋 중 하나를 지목하고, 회계거래조회에서 ?journal= 로만 들어오면 그 전표의 종류를 물어 연다.
 */
export default function FastVoucherPage() {
  const [params] = useSearchParams()
  const typed = kindOf(params.get('type'))
  const journal = params.get('journal')
  const [found, setFound] = useState<Kind | null>(null)

  useEffect(() => {
    setFound(null)
    if (typed || !journal) return
    api.get<FastVoucher>(`/vouchers/by-journal/${journal}`)
      .then(({ data }) => setFound(kindOf(data.type) ?? 'EXPENSE_REPORT'))
      .catch(() => setFound('EXPENSE_REPORT'))
  }, [typed, journal])

  const kind = typed ?? (journal ? found : 'EXPENSE_REPORT')
  if (!kind) return null
  return <CashReportEntryPage key={kind} kind={kind} />
}
