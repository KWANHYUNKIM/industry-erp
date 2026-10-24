import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ecConfirm } from '../../components/EcDialog'
import type { EmployeeMaster } from '../../types/api'
import { insuranceEmployeeColumns } from '../../features/insurance/employeeColumns'
import WorkplaceModal from '../../features/insurance/WorkplaceModal'
import { INSURANCE_FORM_NAMES, INSURANCE_INPUT_PATHS, type InsuranceKind, type InsuranceReport } from '../../features/insurance/types'

/**
 * 관리 › 급여관리 › 4대보험신고(원본 N001768, 2026-10-14 실측).
 * 머리: 제목 · 빠른 검색칸 · Search(F3) · 기간 글자(금월 1일 ~ 오늘). 조건 판(접힘): 기준일자 · 사원 · 서식명(셋 다 켜짐) · 삭제구분(미삭제).
 * 격자 2단 머리: [☐][일자-No.][신고일자][사원][사업자등록번호][신고번호][서식명][국민연금 · 건강보험 · 고용보험 · 산재보험 × 처리상태 · 처리일 · 상세처리내역].
 * 버튼: 신고 · 결과조회 · 4대보험취득신고(▴ 4대보험상실신고 · 피부양자자격신고) · 사업장관리 · 선택삭제 · 인증서관리 · Excel(데이터).
 * 신고 · 결과조회 · 인증서관리는 공단 EDI 전송이라 만들지 않는다(누르면 아무 일도 없다). 신고 전이라 신고일자 · 신고번호 · 처리상태는 빈칸.
 */
const KINDS: InsuranceKind[] = ['ACQUIRE', 'LOSS', 'DEPENDENT']
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const slash = (s: string) => s.replaceAll('-', '/')

export default function InsuranceReportListPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(iso(now))
  const [employeeId, setEmployeeId] = useState('')
  const [kinds, setKinds] = useState<Set<InsuranceKind>>(new Set(KINDS))
  const [deleted, setDeleted] = useState<'ALL' | 'NO' | 'YES'>('NO')
  const [rows, setRows] = useState<InsuranceReport[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [company, setCompany] = useState<{ name?: string; bizRegNo?: string } | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [wpOpen, setWpOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    api.get<InsuranceReport[]>('/hr/insurance/reports', { params: { from, to } })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    load()
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = useMemo(() => rows.filter((r) => kinds.has(r.kind)
    && (!employeeId || String(r.employeeId) === employeeId)
    && (deleted === 'ALL' || (deleted === 'YES') === r.deleted)
    && (!search || `${r.employeeCode} ${r.employeeName} ${r.reportName}`.includes(search))), [rows, kinds, employeeId, deleted, search])

  const biz = company ? `${company.name ?? ''} ${(company.bizRegNo ?? '').replaceAll('-', '')}`.trim() : ''

  async function deleteChecked() {
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 4대보험신고'))) return
    try {
      await api.post('/hr/insurance/reports/delete', [...checked])
      setChecked(new Set())
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '4대보험신고', [shown.length])

  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))
  const toggleKind = (k: InsuranceKind) => setKinds((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <EcListShell
      title="4대보험신고"
      search={search}
      onSearchChange={setSearch}
      onSearch={load}
      actions={[
        { label: '신고' },
        { label: '결과조회' },
        { label: '4대보험취득신고', onClick: () => navigate(INSURANCE_INPUT_PATHS.ACQUIRE), menu: [
          { label: '4대보험상실신고', onClick: () => navigate(INSURANCE_INPUT_PATHS.LOSS) },
          { label: '피부양자자격신고', onClick: () => navigate(INSURANCE_INPUT_PATHS.DEPENDENT) },
        ] },
        { label: '사업장관리', onClick: () => setWpOpen(true) },
        { label: '선택삭제', onClick: deleteChecked, selected: checked.size },
        { label: '인증서관리' },
        { label: 'Excel(데이터)' },
      ]}
    >
      <div className="text-right mb-[6px]">{slash(from)}  ~ {slash(to)}</div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자" span={2}>
          <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} /> ~
          <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="사원" span={2}>
          <CodePickerField label="사원" hideLabel fill plain placeholder="사원" value={employeeId}
                           items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))}
                           columns={insuranceEmployeeColumns(employees)}
                           onChange={(v) => setEmployeeId(v)} />
        </EcCond>
        <EcCond label="서식명" span="full">
          <label className="inline-flex items-center gap-[3px] mr-[10px]">
            <input type="checkbox" checked={kinds.size === KINDS.length} onChange={(e) => setKinds(new Set(e.target.checked ? KINDS : []))} />전체
          </label>
          {KINDS.map((k) => (
            <label key={k} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="checkbox" checked={kinds.has(k)} onChange={() => toggleKind(k)} />{INSURANCE_FORM_NAMES[k]}
            </label>
          ))}
        </EcCond>
        <EcCond label="삭제구분" span={2}>
          {([['ALL', '전체'], ['NO', '미삭제'], ['YES', '삭제']] as const).map(([v, t]) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" checked={deleted === v} onChange={() => setDeleted(v)} />{t}
            </label>
          ))}
        </EcCond>
      </ul>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="ec-report-head400 [&_td]:whitespace-nowrap">
          <thead>
            <tr>
              <th rowSpan={2} className="w-[25px]">
                <input type="checkbox" checked={allChecked} onChange={(e) => setChecked(new Set(e.target.checked ? shown.map((r) => r.id) : []))} />
              </th>
              {['일자-No.', '신고일자', '사원', '사업자등록번호', '신고번호', '서식명'].map((h) => <th key={h} rowSpan={2} className="w-[100px]">{h}</th>)}
              {['국민연금', '건강보험', '고용보험', '산재보험'].map((h) => <th key={h} colSpan={3}>{h}</th>)}
            </tr>
            <tr>
              {[0, 1, 2, 3].flatMap((i) => ['처리상태', '처리일', '상세처리내역'].map((h) => <th key={`${i}${h}`} className="w-[100px]">{h}</th>))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td /><td colSpan={18}>등록된 데이터가 없습니다.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className={r.deleted ? 'text-ec-hint' : undefined}>
                <td className="text-center">
                  <input type="checkbox" checked={checked.has(r.id)}
                         onChange={(e) => setChecked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} />
                </td>
                <td className="text-center">
                  <a className="cursor-pointer" onClick={() => navigate(`${INSURANCE_INPUT_PATHS[r.kind]}?id=${r.id}`)}>{slash(r.reportDate)} -{r.reportSeq}</a>
                </td>
                <td />
                <td>{r.reportName}</td>
                <td>{biz}</td>
                <td />
                <td>{r.formName}</td>
                {Array.from({ length: 12 }, (_, i) => <td key={i} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wpOpen && <WorkplaceModal onClose={() => setWpOpen(false)} />}
    </EcListShell>
  )
}
