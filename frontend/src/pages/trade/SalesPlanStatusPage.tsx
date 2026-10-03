import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf, QUOTATION_PICKS } from '../../components/EcPeriodPicks'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo } from '../../utils/dateNo'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { useItemFlags } from '../../utils/useInactiveItems'

interface PlanRow {
  id: number; planNo: string; planDate: string; lineNo: number
  itemId: number; itemCode: string; itemName: string
  employeeId: number | null; employeeName: string | null
  partnerId: number | null; partnerName: string | null
  warehouseId: number | null; warehouseName: string | null
  projectId: number | null; projectName: string | null
  planQty: number; unitPrice: number; planAmount: number; remark: string | null; createdBy: string | null
}

/** 원본 금액 칸은 소수 한 자리까지 찍는다(7,000.0). */
const amt1 = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * 재고 II &gt; 계획관리 &gt; 매출계획 &gt; <b>매출계획현황</b>(E040640) — 2026-10-04 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 구분(◉내역 ○집계, 라인별) · 일자(기본 금월(~오늘)) · 창고 · 거래처 · 품목 · 프로젝트 · 담당자명,
 * 그 밖에 거래처그룹1 · 품목구분 · 품목그룹1 · 적요 · 최초작성자. 거래처관리담당자는 계획 줄에 없어 뺐다.
 * 열: 일자-No. · 거래처명 · 담당자명 · 품명 · 금액 — 계획 <b>줄마다</b> 한 행, 달마다 '<b>2026/09 계</b>' 와 맨 끝 [합계].
 * 원본 9월: 9/27 -1 이카건설 · 천우석 건축용석재 7,000.0 / 건축용목재 4,000.0, 9/29 -1 빛나오토파츠 · 정재원 두 줄 16,000.0 · 70,000.0,
 * '2026/09 계' 97,000.0. 금액은 소수 한 자리. 머리글 '매출계획현황' · 꼬리 [P.1].
 * 예전엔 [매출계획 / 비교표] 한 화면이 현황을 겸했다(연 · 월 표) — 원본 현황은 계획 줄 목록이다. [구분] ○집계는 아직.
 */
export default function SalesPlanStatusPage() {
  const pickers = useCondPickers(['warehouses', 'partners', 'items', 'projects'])
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [project, setProject] = useState('')
  const [employee, setEmployee] = useState('')
  const [partnerGroup, setPartnerGroup] = useState('')
  const [itemCat, setItemCat] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [remark, setRemark] = useState('')
  const [creator, setCreator] = useState('')
  /* 거래처그룹1 · 품목구분 · 품목그룹1 은 마스터에 붙는 값이라 줄의 id 로 잇는다. */
  const pgroup = usePartnerGroups()
  const flags = useItemFlags()
  const [rows, setRows] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows((await api.get<PlanRow[]>('/sales-plans')).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const employees = useMemo(() => [...new Set(rows.map((r) => r.employeeName).filter(Boolean) as string[])].sort(), [rows])
  const creators = useMemo(() => [...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort(), [rows])
  const shown = useMemo(() => rows
    .filter((r) => r.planDate >= from && r.planDate <= to)
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !item || String(r.itemId) === item)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !employee || r.employeeName === employee)
    .filter((r) => !partnerGroup || pgroup.groupOfId(r.partnerId) === partnerGroup)
    .filter((r) => !itemCat || flags.categoryOf(r.itemId) === itemCat)
    .filter((r) => !itemGroup || flags.groupOf(r.itemId) === itemGroup)
    .filter((r) => !remark || (r.remark ?? '').includes(remark))
    .filter((r) => !creator || r.createdBy === creator)
    .sort((a, b) => a.planDate.localeCompare(b.planDate) || a.planNo.localeCompare(b.planNo) || a.lineNo - b.lineNo),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows, from, to, warehouse, partner, item, project, employee, partnerGroup, itemCat, itemGroup, remark, creator, pgroup.groupOfId, flags])
  const months = useMemo(() => {
    const by = new Map<string, PlanRow[]>()
    for (const r of shown) by.set(r.planDate.slice(0, 7), [...(by.get(r.planDate.slice(0, 7)) ?? []), r])
    return [...by.entries()].map(([m, rs]) => ({ m, rs, sum: rs.reduce((n, r) => n + Number(r.planAmount), 0) }))
  }, [shown])
  const total = months.reduce((n, g) => n + g.sum, 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '매출계획현황', [months.length])

  return (
    <EcListShell
      title="매출계획현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setWarehouse(''); setPartner(''); setItem(''); setProject(''); setEmployee(''); setPartnerGroup(''); setItemCat(''); setItemGroup(''); setRemark(''); setCreator('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분"><span className="text-ec-label">내역 · 라인별</span></EcCond>
        <EcCond label="일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="거래처그룹1" pick>
          <CodePickerField label="거래처그룹1" hideLabel width={170} emptyLabel="전체" value={partnerGroup} onChange={setPartnerGroup}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={140} emptyLabel="전체" value={itemCat} onChange={setItemCat}
                           items={flags.categories.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체" value={itemGroup} onChange={setItemGroup}
                           items={flags.groups.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자명" pick>
          <CodePickerField label="담당자명" hideLabel width={170} emptyLabel="전체" value={employee} onChange={setEmployee}
                           items={employees.map((e) => ({ value: e, name: e }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-[200px]" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={170} emptyLabel="전체" value={creator} onChange={setCreator}
                           items={creators.map((e) => ({ value: e, name: e }))} />
        </EcCond>
      </ul>

      <EcReportHead title="매출계획현황" period={reportPeriod(from, to)} />
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th>거래처명</th>
            <th>담당자명</th>
            <th>품명</th>
            <th className="text-right">금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="ec-empty">불러오는 중…</td></tr>
          ) : months.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : months.flatMap((g) => [
            ...g.rs.map((r) => (
              <tr key={r.id}>
                <td className="text-center">{dateNo(r.planDate, r.planNo)}</td>
                <td>{r.partnerName ?? ''}</td>
                <td>{r.employeeName ?? ''}</td>
                <td>{r.itemName}</td>
                <td className="text-right">{amt1(Number(r.planAmount))}</td>
              </tr>
            )),
            <tr key={`sub-${g.m}`} className="ec-list-total">
              <td colSpan={4} className="text-center font-bold">{g.m.replace('-', '/')} 계</td>
              <td className="text-right font-bold">{amt1(g.sum)}</td>
            </tr>,
          ])}
        </tbody>
        {months.length > 0 && (
          <tfoot><tr className="ec-total">
            <td colSpan={4} className="text-center">합계</td>
            <td className="text-right">{amt1(total)}</td>
          </tr></tfoot>
        )}
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
