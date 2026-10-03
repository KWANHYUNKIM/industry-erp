import { useEffect, useRef, useState } from 'react'
import CodePickerField from '../../../components/CodePickerField'
import Modal from '../../../components/Modal'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import type { Department, EmployeeMaster } from '../../../types/api'
import { ymd } from '../../../utils/periods'
import { ASSIGNMENT_KINDS, type AssignmentKind, type AssignmentLine } from '../types'

interface Row {
  assignDate: string
  employeeId: string
  type: AssignmentKind | ''
  hireKind: string
  jobTitle: string
  departmentId: string
  remark: string
}
const blank = (): Row => ({ assignDate: '', employeeId: '', type: '', hireKind: '', jobTitle: '', departmentId: '', remark: '' })
const BLANK_ROWS = 3
/** 원본 입사구분 코드도움(2026-10-03 loginaa): 100 신입 · 200 경력. 예전에 글자로 적은 값이면 그 값도 후보에 둔다. */
const HIRE_KINDS = [{ value: '신입', code: '100', name: '신입' }, { value: '경력', code: '200', name: '경력' }]
const hireKindItems = (cur: string) => (cur && !HIRE_KINDS.some((k) => k.value === cur) ? [...HIRE_KINDS, { value: cur, name: cur }] : HIRE_KINDS)

/**
 * 인사발령입력 격자(원본 E020721 '인사발령입력등록' / 조회에서 열면 '인사발령입력수정').
 *
 * <p>2026-10-03 loginaa 에서 넣고 고치고 지워 본 그대로:
 * <ul>
 *   <li>머리 [일자](오늘) + 격자 발령일자 · 사번 · 성명 · 발령구분 · 입사구분 · 이전 직위/직급 · 발령 직위/직급 · 이전 부서 · 발령 부서 · 적요.</li>
 *   <li>사번을 넣으면 발령일자(머리 일자) · 성명 · 이전/발령 직위 · 이전/발령 부서가 사원의 지금 값으로 채워진다.</li>
 *   <li>발령구분이 비면 저장이 막힌다. 저장하면 '저장하시겠습니까? [사원정보에 반영] 체크 시, 저장한 정보로 사원정보가
 *       변경됩니다.'(체크된 채) — 확인하면 안내 없이 폼이 비워진다.</li>
 *   <li>수정 창: 일자는 막히고(2026/10/03 -1), 버튼 저장(F8) · 닫기 · 삭제('전표를 삭제하겠습니까?').</li>
 * </ul>
 * 발령구분 · 입사구분은 원본이 회사가 등록하는 코드다. 우리 발령구분은 '인사발령'(직위 · 부서만) 외에 입사 · 전보 · 승진 ·
 * 퇴사 · 재입사(재직상태까지 바꾼다)를 고르고, 입사구분은 원본 코드 100 신입 · 200 경력을 고른다. 복사 · H(이력) · 찾기(F3) 는 없다.
 */
export default function AssignmentSlipForm({
  slipDate: editDate, slipNo: editNo, onSaved, onClose,
}: {
  slipDate?: string
  slipNo?: number
  onSaved?: () => void
  onClose?: () => void
}) {
  const editing = !!(editDate && editNo)
  const [slipDate, setSlipDate] = useState(editDate ?? ymd(new Date()))
  const [rows, setRows] = useState<Row[]>(Array.from({ length: BLANK_ROWS }, blank))
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reflect, setReflect] = useState(true)
  const [prev, setPrev] = useState<Record<number, { jobTitle: string; department: string }>>({})
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '인사발령입력', [rows.length])

  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<Department[]>('/departments').then((r) => setDepartments(r.data)).catch(() => setDepartments([]))
  }, [])

  function reset() {
    setError('')
    if (!editing) { setRows(Array.from({ length: BLANK_ROWS }, blank)); setPrev({}); return }
    api.get<AssignmentLine[]>(`/employees/assignment-slips/${editDate}/${editNo}`).then((r) => {
      const got = r.data.map((l) => ({
        assignDate: l.assignDate, employeeId: String(l.employeeId), type: l.type, hireKind: l.hireKind ?? '',
        jobTitle: l.jobTitle, departmentId: l.departmentId ? String(l.departmentId) : '', remark: l.remark ?? '',
      }))
      setPrev(Object.fromEntries(r.data.map((l, i) => [i, { jobTitle: l.prevJobTitle, department: l.prevDepartment }])))
      setRows([...got, ...Array.from({ length: Math.max(1, BLANK_ROWS - got.length) }, blank)])
    }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { reset() }, [editDate, editNo])

  function edit(i: number, patch: Partial<Row>) {
    setRows((rs) => {
      const next = rs.map((r, j) => (j === i ? { ...r, ...patch } : r))
      return next[next.length - 1].employeeId ? [...next, blank()] : next
    })
  }

  /** 사번을 고르면 원본처럼 발령일자 · 이전/발령 직위 · 부서를 사원의 지금 값으로 채운다. */
  function pickEmployee(i: number, v: string) {
    const e = employees.find((x) => String(x.id) === v)
    setPrev((p) => ({ ...p, [i]: { jobTitle: e?.jobTitle ?? '', department: e?.department ?? '' } }))
    edit(i, {
      employeeId: v,
      assignDate: rows[i].assignDate || slipDate,
      jobTitle: e?.jobTitle ?? '',
      departmentId: e?.departmentId ? String(e.departmentId) : '',
    })
  }

  const filled = rows.filter((r) => r.employeeId)

  function askSave() {
    setError('')
    if (filled.length === 0) { setError('사번을 입력 바랍니다.'); return }
    if (filled.some((r) => !r.type)) { setError('발령구분을 입력 바랍니다.'); return }
    setReflect(true)
    setConfirmOpen(true)
  }

  async function save() {
    setConfirmOpen(false)
    const body = {
      slipDate, reflect,
      lines: filled.map((r) => ({
        assignDate: r.assignDate || slipDate, employeeId: Number(r.employeeId), type: r.type,
        hireKind: r.hireKind || null, jobTitle: r.jobTitle || null,
        departmentId: r.departmentId ? Number(r.departmentId) : null, remark: r.remark || null,
      })),
    }
    try {
      if (editing) await api.put(`/employees/assignment-slips/${editDate}/${editNo}`, body)
      else await api.post('/employees/assignment-slips', body)
      // 원본은 안내 없이 폼을 비운다(수정 창은 닫힌다)
      if (!editing) { setRows(Array.from({ length: BLANK_ROWS }, blank)); setPrev({}) }
      onSaved?.()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!window.confirm('전표를 삭제하겠습니까?')) return
    try {
      await api.delete(`/employees/assignment-slips/${editDate}/${editNo}`)
      onSaved?.()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-form mb-[8px]">
        <li>
          <span className="title">일자</span>
          <div className="form">
            {editing ? <span>{slipDate.replace(/-/g, '/')} -{editNo}</span>
              : <input type="date" className="ec-input w-[150px]" value={slipDate} onChange={(e) => setSlipDate(e.target.value)} />}
          </div>
        </li>
      </ul>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[150px]">발령일자</th>
              <th className="w-[150px]">사번</th>
              <th>성명</th>
              <th className="w-[120px]">발령구분</th>
              <th>입사구분</th>
              <th>이전 직위/직급</th>
              <th>발령 직위/직급</th>
              <th>이전 부서</th>
              <th className="w-[150px]">발령 부서</th>
              <th>적요</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const emp = employees.find((x) => String(x.id) === r.employeeId)
              return (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td><input type="date" className="ec-input w-full" value={r.assignDate} onChange={(e) => edit(i, { assignDate: e.target.value })} /></td>
                  <td>
                    <CodePickerField label="사번" hideLabel fill placeholder="사번" emptyLabel="선택 해제"
                                     value={r.employeeId} onChange={(v) => pickEmployee(i, v)}
                                     items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                  </td>
                  <td>{emp?.name ?? ''}</td>
                  <td>
                    <select className="ec-input w-full" value={r.type} onChange={(e) => edit(i, { type: e.target.value as AssignmentKind })}>
                      <option value=""></option>
                      {ASSIGNMENT_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    <CodePickerField label="입사구분" hideLabel fill placeholder="입사구분" emptyLabel="선택 해제"
                                     value={r.hireKind} onChange={(v) => edit(i, { hireKind: v })}
                                     items={hireKindItems(r.hireKind)} />
                  </td>
                  <td>{r.employeeId ? prev[i]?.jobTitle ?? '' : ''}</td>
                  <td><input className="ec-input w-full" value={r.jobTitle} onChange={(e) => edit(i, { jobTitle: e.target.value })} /></td>
                  <td>{r.employeeId ? prev[i]?.department ?? '' : ''}</td>
                  <td>
                    <CodePickerField label="발령 부서" hideLabel fill placeholder="부서" emptyLabel="선택 해제"
                                     value={r.departmentId} onChange={(v) => edit(i, { departmentId: v })}
                                     items={departments.map((d) => ({ value: String(d.id), code: d.code, name: d.name }))} />
                  </td>
                  <td><input className="ec-input w-full" value={r.remark} onChange={(e) => edit(i, { remark: e.target.value })} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-[6px] mt-[10px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={askSave}>저장(F8)</button>
        {editing ? (
          <>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
            <button type="button" className="ec-btn" onClick={remove}>삭제</button>
          </>
        ) : (
          <>
            <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={onClose}>리스트</button>
          </>
        )}
      </div>

      <Modal error="" open={confirmOpen} title="알림" width={480} onClose={() => setConfirmOpen(false)}>
        <p className="font-bold mb-[6px]">알림</p>
        <p>저장하시겠습니까?</p>
        <p className="mb-[8px]">[사원정보에 반영] 체크 시, 저장한 정보로 사원정보가 변경됩니다.</p>
        <label className="flex items-center gap-[6px] mb-[12px]">
          <input type="checkbox" checked={reflect} onChange={(e) => setReflect(e.target.checked)} /> 사원정보에 반영
        </label>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmOpen(false)}>취소</button>
        </div>
      </Modal>
    </>
  )
}
