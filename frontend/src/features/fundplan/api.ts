import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useBondMasters } from '../bond/api'
import type { CodeItem } from '../../components/codepicker/CodePickerField'
import type { FundPlanMasters } from './components/FundPlanModal'
import { bankLabel, type BankAccountOpt, type FundPlan } from './types'

export async function fetchFundPlans(from?: string, to?: string): Promise<FundPlan[]> {
  const r = await api.get<FundPlan[]>('/fund-plans', { params: { from, to } })
  return r.data
}

/** 계획전표 창 · 조건이 고르는 마스터 — 부서 · 프로젝트 · 계좌 · 계정 · 거래처. */
export function useFundPlanMasters(): FundPlanMasters & { banks: BankAccountOpt[]; deptName: (id: number | null) => string } {
  const m = useBondMasters()
  const [banks, setBanks] = useState<BankAccountOpt[]>([])
  useEffect(() => {
    api.get<BankAccountOpt[]>('/bank-cards/accounts').then((r) => setBanks(r.data)).catch(() => {})
  }, [])
  const bankAccounts: CodeItem[] = banks.filter((b) => b.active)
    .map((b) => ({ value: String(b.id), code: b.code ?? b.accountNo, name: bankLabel(b) }))
  return { departments: m.departments, projects: m.projects, accounts: m.accounts, partners: m.partners, bankAccounts, banks, deptName: m.deptName }
}
