import { api } from '../../api/client'
import type { BudgetAccountDetail, BudgetAccountRow, BudgetReport } from './types'

export async function fetchBudgetAccounts(year: number): Promise<BudgetAccountRow[]> {
  return (await api.get<BudgetAccountRow[]>('/budget-plans', { params: { year } })).data
}

export async function fetchBudgetAccount(year: number, accountId: number): Promise<BudgetAccountDetail> {
  return (await api.get<BudgetAccountDetail>('/budget-plans/account', { params: { year, accountId } })).data
}

export interface SaveBudgetLine {
  id: number | null
  departmentId: number | null
  projectId: number | null
  remark: string | null
  months: number[]
}

export async function saveBudgetAccount(year: number, accountId: number, lines: SaveBudgetLine[]): Promise<BudgetAccountDetail> {
  return (await api.put<BudgetAccountDetail>('/budget-plans/account', { year, accountId, lines })).data
}

export async function deleteBudgetAccounts(year: number, accountIds: number[]): Promise<void> {
  await api.post('/budget-plans/delete', { year, accountIds })
}

export async function fetchBudgetReport(fromYear: number, toYear: number): Promise<BudgetReport> {
  return (await api.get<BudgetReport>('/budget-plans/report', { params: { fromYear, toYear } })).data
}
