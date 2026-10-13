import { useMemo, useState, type ReactNode } from 'react'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useDeptProjectItems } from '../cashquick/useDeptProject'
import { VAT_TYPES, type BillLineView } from './types'

/**
 * 회계/판매일괄반영(E060906) · 회계미반영현황(계약)(E060908) 이 같이 쓰는 조건 — 2026-10-13 loginaa 실측 차례:
 * 계약 · 계약항목 · 거래처 · (담당자) · 부가세유형 · 청구단위 · (내.외자구분) · 부서 · 프로젝트.
 * 미반영현황에는 담당자 · 내.외자구분이 없다({@code full=false}). 부가세유형 기본값은 화면마다 다르다(일괄반영 세금계산서, 미반영 전체).
 */
export interface BillLineFilter {
  contract: string; item: string; partner: string; employee: string; vatType: string; unit: string
  currency: '' | 'D' | 'F'; department: string; project: string
}

/** 조건이 읽는 줄 칸 — 청구자료 줄(BillLineView)과 계약 줄(계약단가/수량일괄변경)이 같이 쓴다. */
export type BillCondRow = Pick<BillLineView, 'contractId' | 'contractCode' | 'contractName' | 'itemId' | 'itemName' | 'partnerId' | 'partnerName'
  | 'employeeId' | 'vatType' | 'billingUnitId' | 'billingUnitName' | 'foreignCurrency' | 'departmentId' | 'projectId'>

export function emptyFilter(vatType = ''): BillLineFilter {
  return { contract: '', item: '', partner: '', employee: '', vatType, unit: '', currency: '', department: '', project: '' }
}

export function applyFilter<T extends BillCondRow>(rows: T[], f: BillLineFilter): T[] {
  return rows
    .filter((r) => !f.contract || String(r.contractId) === f.contract)
    .filter((r) => !f.item || String(r.itemId) === f.item)
    .filter((r) => !f.partner || String(r.partnerId) === f.partner)
    .filter((r) => !f.employee || String(r.employeeId) === f.employee)
    .filter((r) => !f.vatType || r.vatType === f.vatType)
    .filter((r) => !f.unit || String(r.billingUnitId) === f.unit)
    .filter((r) => !f.currency || r.foreignCurrency === (f.currency === 'F'))
    .filter((r) => !f.department || String(r.departmentId) === f.department)
    .filter((r) => !f.project || String(r.projectId) === f.project)
}

export function useBillLineFilter(initialVat = '') {
  const [filter, setFilter] = useState<BillLineFilter>(emptyFilter(initialVat))
  const set = (patch: Partial<BillLineFilter>) => setFilter((f) => ({ ...f, ...patch }))
  return { filter, set, reset: () => setFilter(emptyFilter(initialVat)) }
}

/** 조건 칸들(<code>.ec-cond</code> 안의 <code>EcCond</code> 줄). 기간 칸은 화면이 앞에 둔다. */
type CondKey = 'contract' | 'item' | 'partner' | 'employee' | 'vatType' | 'unit' | 'currency' | 'department' | 'project'
const DEFAULT_ORDER: CondKey[] = ['contract', 'item', 'partner', 'employee', 'vatType', 'unit', 'currency', 'department', 'project']

export function BillLineConds({ rows, filter, set, full, vatAll, currency = full, order = DEFAULT_ORDER }: {
  rows: BillCondRow[]; filter: BillLineFilter; set: (p: Partial<BillLineFilter>) => void
  /** 담당자 · 내.외자구분까지(일괄반영). */
  full: boolean
  /** 내.외자구분 칸(기본은 full 과 같다). 계약단가/수량일괄변경은 맨 끝에 ◉내자 ○외자 로 따로 둔다. */
  currency?: boolean
  /** 부가세유형에 '전체' 를 둔다(미반영현황). 일괄반영은 유형 하나를 골라 그 유형만 반영한다. */
  vatAll: boolean
  /** 칸 차례 — 계약현황(E060912)은 거래처 · 계약 · 계약항목 · 청구단위 · 담당자 · 프로젝트 · 부서 · 부가세유형. */
  order?: CondKey[]
}) {
  const pickers = useCondPickers(full ? ['employees'] : [])
  const dp = useDeptProjectItems()
  const opts = (f: (r: BillCondRow) => [string, string] | null) => {
    const m = new Map<string, string>()
    rows.forEach((r) => { const kv = f(r); if (kv) m.set(kv[0], kv[1]) })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, name]) => ({ value, name }))
  }
  const contracts = useMemo(() => opts((r) => [String(r.contractId), r.contractName ?? r.contractCode]), [rows])
  const items = useMemo(() => opts((r) => [String(r.itemId), r.itemName]), [rows])
  const partners = useMemo(() => opts((r) => [String(r.partnerId), r.partnerName]), [rows])
  const units = useMemo(() => opts((r) => (r.billingUnitId != null ? [String(r.billingUnitId), r.billingUnitName ?? ''] : null)), [rows])
  const employees = useMemo(() => pickers.employees.filter((e) => e.id != null).map((e) => ({ value: String(e.id), code: e.code ?? undefined, name: e.name })), [pickers.employees])

  const conds: Record<CondKey, ReactNode> = {
    contract: <EcCond key="contract" label="계약" pick><CodePickerField label="계약" hideLabel width={220} emptyLabel="계약" value={filter.contract} onChange={(v) => set({ contract: v })} items={contracts} /></EcCond>,
    item: <EcCond key="item" label="계약항목" pick><CodePickerField label="계약항목" hideLabel width={220} emptyLabel="계약항목" value={filter.item} onChange={(v) => set({ item: v })} items={items} /></EcCond>,
    partner: <EcCond key="partner" label="거래처" pick><CodePickerField label="거래처" hideLabel width={220} emptyLabel="거래처" value={filter.partner} onChange={(v) => set({ partner: v })} items={partners} /></EcCond>,
    employee: full && <EcCond key="employee" label="담당자" pick><CodePickerField label="담당자" hideLabel width={220} emptyLabel="담당자" value={filter.employee} onChange={(v) => set({ employee: v })} items={employees} /></EcCond>,
    vatType: (
      <EcCond key="vatType" label="부가세유형">
        <select className="ec-input w-[200px]" aria-label="부가세유형" value={filter.vatType} onChange={(e) => set({ vatType: e.target.value })}>
          {vatAll && <option value="">전체</option>}
          {VAT_TYPES.map((v) => <option key={v}>{v}</option>)}
        </select>
      </EcCond>
    ),
    unit: <EcCond key="unit" label="청구단위" pick><CodePickerField label="청구단위" hideLabel width={180} emptyLabel="청구단위" value={filter.unit} onChange={(v) => set({ unit: v })} items={units} /></EcCond>,
    currency: currency && (
      <EcCond key="currency" label="내.외자구분">
        {([['', '전체'], ['D', '내자'], ['F', '외자']] as const).map(([v, n]) => (
          <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
            <input type="radio" name="bill-currency" checked={filter.currency === v} onChange={() => set({ currency: v })} /> {n}
          </label>
        ))}
      </EcCond>
    ),
    department: <EcCond key="department" label="부서" pick><CodePickerField label="부서" hideLabel width={220} emptyLabel="부서" value={filter.department} onChange={(v) => set({ department: v })} items={dp.departments} /></EcCond>,
    project: <EcCond key="project" label="프로젝트" pick><CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="프로젝트" value={filter.project} onChange={(v) => set({ project: v })} items={dp.projects} /></EcCond>,
  }
  return <>{order.map((k) => conds[k])}</>
}
