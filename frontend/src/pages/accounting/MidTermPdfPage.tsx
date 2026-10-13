import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { yearEndApi, type Settlement } from '../../features/yearend/api'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

type Emp = { id: number; code: string; name: string }
type Company = { name?: string; bizRegNo?: string }

/**
 * 중도정산 PDF 다운로드 (원본 세무 › 원천징수 › 퇴직정산 E030118, plans/세무/E030114.md 5장) — 모양만.
 * 머리 Search(F3) · 도움말(Option 없음). 조건(접힘): 귀속연도 · 원천세신고 사업자등록번호 · 사원번호.
 * (원본 귀속연도 칸 옆에 '01' 이 하나 더 보였는데 무엇을 거르는지 못 잼 — 남은 것.)
 * 버튼줄 [PDF] 하나 — 파일 다운로드라 잠가 둔다(승인 대기). 줄은 중도정산등록/수정에 올린 사람.
 */
export default function MidTermPdfPage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [condEmp, setCondEmp] = useState('')
  const [rows, setRows] = useState<Settlement[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [emps, setEmps] = useState<Emp[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    yearEndApi.list(year, 'MID_TERM')
      .then((r) => { setRows(condEmp ? r.filter((x) => String(x.employeeId) === condEmp) : r); setPicked(new Set()) })
      .catch((e) => { setRows([]); setError(extractErrorMessage(e)) })
  }
  useEffect(() => {
    load()
    api.get<Emp[]>('/employees/all').then((r) => setEmps(r.data)).catch(() => setEmps([]))
    api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emp = (id: number) => emps.find((e) => e.id === id)
  const allPicked = rows.length > 0 && picked.size === rows.length
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '중도정산 PDF 다운로드', [rows.length])
  const link = (label: string) => <span className="text-ec-navy">{label}</span>

  return (
    <EcListShell
      title="중도정산 PDF 다운로드"
      onSearch={load}
      option={false}
      collapseConditions
      actions={[{ label: 'PDF', disabled: true }]}   // 파일 다운로드 — 누르지 않는다(승인 대기)
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="귀속연도">
          <select className="ec-input w-[100px]" aria-label="귀속연도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </EcCond>
        <EcCond label="원천세신고 사업자등록번호">
          <select className="ec-input w-[260px]" aria-label="원천세신고 사업자등록번호" value="" disabled>
            <option value="">{company?.name ? `${company.name} ${company.bizRegNo ?? ''}` : '전체'}</option>
          </select>
        </EcCond>
        <EcCond label="사원번호" pick>
          <CodePickerField label="사원번호" hideLabel width={200} emptyLabel="전체" value={condEmp} onChange={setCondEmp}
                           items={emps.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
        </EcCond>
        <li><button className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button></li>
      </ul>

      <table ref={tableRef} className="w-full text-center">
        <thead>
          <tr>
            <th className="w-[36px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
            </th>
            <th>사원명</th><th>사번</th><th>주민등록번호</th><th>원천징수부</th><th>원천징수영수증</th><th>의료비명세서</th>
            <th>기부금명세서</th><th>연금·저축명세서</th><th>신용카드소득공제신청서</th><th>월세액·거주자간주택임차차입금명세서</th>
            <th>소득·세액공제신고서</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input type="checkbox" aria-label={`${emp(r.employeeId)?.name ?? ''} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
              </td>
              <td className="text-left">{emp(r.employeeId)?.name ?? ''}</td>
              <td>{emp(r.employeeId)?.code ?? ''}</td>
              <td />
              <td>{link('조회')}</td><td>{link('조회')}</td><td>{link('조회')}</td><td>{link('조회')}</td>
              <td>{link('조회')}</td><td>{link('조회')}</td><td>{link('조회')}</td><td>{link('조회')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
