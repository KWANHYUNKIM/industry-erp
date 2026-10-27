import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { CodeItem } from '../../components/CodePickerField'
import { partnerCodeItems, type PartnerLike } from '../../utils/codeItems'
import type { BondEntry, BondSide } from './types'

export async function fetchBonds(side: BondSide, to?: string): Promise<BondEntry[]> {
  const r = await api.get<BondEntry[]>('/bonds', { params: { side, to } })
  return r.data
}

export interface BondMasters {
  accounts: CodeItem[]
  partners: CodeItem[]
  departments: CodeItem[]
  projects: CodeItem[]
  deptName: (id: number | null) => string
}

/** 입력 창 · 조건 판이 고르는 마스터 — 계정 · 거래처 · 부서 · 프로젝트. 하나가 실패해도 나머지는 쓴다. */
export function useBondMasters(): BondMasters {
  const [accounts, setAccounts] = useState<CodeItem[]>([])
  const [partners, setPartners] = useState<CodeItem[]>([])
  const [departments, setDepartments] = useState<CodeItem[]>([])
  const [projects, setProjects] = useState<CodeItem[]>([])
  useEffect(() => {
    type Opt = { id: number; code: string; name: string; active?: boolean }
    api.get<Opt[]>('/accounts', { params: { slip: true } }).then((r) => setAccounts(r.data.filter((a) => a.active !== false)
      .map((a) => ({ value: String(a.id), code: a.code, name: a.name })))).catch(() => {})
    api.get<PartnerLike[]>('/partners').then((r) => setPartners(partnerCodeItems(r.data))).catch(() => {})
    api.get<Opt[]>('/departments').then((r) => setDepartments(r.data
      .map((d) => ({ value: String(d.id), code: d.code, name: d.name })))).catch(() => {})
    api.get<Opt[]>('/projects').then((r) => setProjects(r.data
      .map((p) => ({ value: String(p.id), code: p.code, name: p.name })))).catch(() => {})
  }, [])
  const deptName = (id: number | null) => (id == null ? '' : departments.find((d) => d.value === String(id))?.name ?? '')
  return { accounts, partners, departments, projects, deptName }
}
