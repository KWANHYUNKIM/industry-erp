import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'

interface Emp { id: number; code: string; name: string; department: string | null; hireDate: string | null; resignDate: string | null }

const slash = (d: string | null) => (d ? d.replace(/-/g, '/') : '')
const month = (d: string | null) => (d ? d.slice(0, 7).replace('-', '/') : '')

/**
 * 세무 &gt; 원천징수 &gt; 퇴직정산 &gt; <b>퇴사자리스트</b>(E020126) — 2026-10-03 loginaa 실측(자료 20줄).
 *
 * <p>조건(Search(F3)): 세무신고사업장 · 사원 · 부서 · 입사일자(구간 + [사용], 꺼짐) · 퇴사일자(구간 + [사용], 꺼짐).
 * 기본은 기간을 안 보므로 <b>퇴사일자가 있는 사원 전부</b>가 나온다.
 *
 * <p>열: 번호 · 사번 · 성명 · 부서 · 입사일자 · 퇴사일자 · 중도정산귀속월 · 중도정산원천징수연월 · 퇴직소득귀속월 ·
 * 퇴직소득원천징수연월 · 퇴직소득지급일자. 줄은 사번 글자 차례(원본이 00001 · 002 · 1 · 10 · 11 … 로 찍는다).
 * 중도정산귀속월은 원본에서 모든 줄이 퇴사월이라 퇴사일자의 달을 찍는다. 중도정산원천징수연월과 퇴직소득 세 칸은
 * 연말정산 · 퇴직금 정산을 등록해야 생기는 값인데 우리에게 그 정산이 없어 비운다.
 * 세무신고사업장은 우리 회사가 사업장을 하나만 둔다. 원본의 [신규(F2)] · [선택삭제]는 퇴직정산 입력이라 두지 않는다.
 */
export default function RetiredEmployeePage() {
  const [rows, setRows] = useState<Emp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emp, setEmp] = useState('')
  const [dept, setDept] = useState('')
  const [useHire, setUseHire] = useState(false)
  const [hireFrom, setHireFrom] = useState('')
  const [hireTo, setHireTo] = useState('')
  const [useResign, setUseResign] = useState(false)
  const [resignFrom, setResignFrom] = useState('')
  const [resignTo, setResignTo] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<Emp[]>('/employees/all')
      setRows(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const inRange = (d: string | null, from: string, to: string) => !!d && (!from || d >= from) && (!to || d <= to)
  const shown = useMemo(() => rows
    .filter((r) => r.resignDate)
    .filter((r) => !emp || String(r.id) === emp)
    .filter((r) => !dept || (r.department ?? '') === dept)
    .filter((r) => !useHire || inRange(r.hireDate, hireFrom, hireTo))
    .filter((r) => !useResign || inRange(r.resignDate, resignFrom, resignTo))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
  [rows, emp, dept, useHire, hireFrom, hireTo, useResign, resignFrom, resignTo])
  const retired = rows.filter((r) => r.resignDate)
  const depts = [...new Set(retired.map((r) => r.department).filter((v): v is string => !!v))].sort()

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '퇴사자리스트', [shown.length])

  return (
    <EcListShell
      title="퇴사자리스트"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setEmp(''); setDept(''); setUseHire(false); setHireFrom(''); setHireTo(''); setUseResign(false); setResignFrom(''); setResignTo('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-error">{error}</p>}
      <ul className="ec-cond mb-2">
        <EcCond label="사원" pick>
          <CodePickerField label="사원" hideLabel width={200} emptyLabel="전체" value={emp} onChange={setEmp}
                           items={retired.map((r) => ({ value: String(r.id), code: r.code, name: r.name }))} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={200} emptyLabel="전체" value={dept} onChange={setDept}
                           items={depts.map((d) => ({ value: d, name: d }))} />
        </EcCond>
        <EcCond label="입사일자">
          <input type="date" className="ec-input w-[145px]" value={hireFrom} disabled={!useHire} onChange={(e) => setHireFrom(e.target.value)} />
          <span className="mx-1">~</span>
          <input type="date" className="ec-input w-[145px]" value={hireTo} disabled={!useHire} onChange={(e) => setHireTo(e.target.value)} />
          <label className="ml-2 inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={useHire} onChange={(e) => setUseHire(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <EcCond label="퇴사일자">
          <input type="date" className="ec-input w-[145px]" value={resignFrom} disabled={!useResign} onChange={(e) => setResignFrom(e.target.value)} />
          <span className="mx-1">~</span>
          <input type="date" className="ec-input w-[145px]" value={resignTo} disabled={!useResign} onChange={(e) => setResignTo(e.target.value)} />
          <label className="ml-2 inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={useResign} onChange={(e) => setUseResign(e.target.checked)} /> 사용
          </label>
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>사번</th>
            <th>성명</th>
            <th>부서</th>
            <th className="text-center">입사일자</th>
            <th className="text-center">퇴사일자</th>
            <th className="text-center">중도정산귀속월</th>
            <th className="text-center">중도정산원천징수연월</th>
            <th className="text-center">퇴직소득귀속월</th>
            <th className="text-center">퇴직소득원천징수연월</th>
            <th className="text-center">퇴직소득지급일자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{r.code}</td>
              <td>{r.name}</td>
              <td>{r.department ?? ''}</td>
              <td className="text-center">{slash(r.hireDate)}</td>
              <td className="text-center">{slash(r.resignDate)}</td>
              <td className="text-center">{month(r.resignDate)}</td>
              <td className="text-center"></td>
              <td className="text-center"></td>
              <td className="text-center"></td>
              <td className="text-center"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
