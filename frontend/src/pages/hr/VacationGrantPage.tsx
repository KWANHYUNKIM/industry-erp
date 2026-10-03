import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster } from '../../types/api'
import { annualLeaveDays } from '../../utils/annualLeave'

interface Summary { vacationKindId: number; code: string; name: string; periodFrom: string; periodTo: string; headcount: number }
interface GrantRow { employeeId: number; carryOverDays: number; currentDays: number }
interface Row { employeeId: string; carryOverDays: string; currentDays: string }
const blank = (): Row => ({ employeeId: '', carryOverDays: '', currentDays: '' })
const slash = (s: string) => s.replace(/-/g, '/')
const num = (s: string) => Number(s) || 0

/**
 * 관리 &gt; 근태관리 &gt; 기본사항등록 &gt; <b>사원별휴가일수조회</b> (원본 E020703).
 *
 * <p>2026-10-03 loginaa 에서 넣고 지워 본 그대로:
 * <ul>
 *   <li>[전체] 알약 · 격자 휴가코드 · 휴가명 · 사용기간 · 등록인원수(1.00 꼴, 없으면 빈칸). 버튼 선택삭제 · Excel · 웹자료올리기.</li>
 *   <li>[휴가코드]를 누르면 '사원별휴가일수입력' 창: 머리 휴가 · 사용기간, 격자 사번 · 사원명 · 부서명 · 직급 · 입사일 · 이월 잔여일수 ·
 *       당해년 휴가일수 · 휴가일수, 합계줄. 사번을 넣으면 사원명 · 부서명 · 직급 · 입사일이 채워지고, 당해년 휴가일수를 넣으면
 *       휴가일수 = 이월 잔여일수 + 당해년 휴가일수. 저장하면 목록 등록인원수가 는다. 버튼 찾기(F3) · 연차계산 · 저장(F8) · 닫기.</li>
 * </ul>
 * [연차계산]은 사번이 든 줄의 당해년 휴가일수를 입사일로 채운다(원본 연차계산기준 40시간제와 같은 셈 — utils/annualLeave).
 * 원본은 줄을 고르고 연차계산기준(40시간제 · 44시간제)을 골라 [적용]하는데, 우리는 40시간제 하나로 셈한다.
 * 찾기(F3) · 웹자료올리기는 없다.
 */
export default function VacationGrantPage() {
  const [rows, setRows] = useState<Summary[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState<Summary | null>(null)
  const [lines, setLines] = useState<Row[]>([])
  const [formError, setFormError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  const gridRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '사원별휴가일수조회', [rows.length])
  useTableColumnCheck(gridRef, '사원별휴가일수입력', [lines.length])

  function load() {
    setError('')
    api.get<Summary[]>('/hr/vacation-kinds/grant-summaries').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    load()
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
  }, [])

  async function openGrant(s: Summary) {
    setFormError('')
    try {
      const got = (await api.get<GrantRow[]>(`/hr/vacation-kinds/${s.vacationKindId}/grants`)).data
        .map((g) => ({ employeeId: String(g.employeeId), carryOverDays: String(Number(g.carryOverDays)), currentDays: String(Number(g.currentDays)) }))
      setLines([...got, ...Array.from({ length: Math.max(1, 3 - got.length) }, blank)])
      setOpen(s)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  function edit(i: number, patch: Partial<Row>) {
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l))
      return next[next.length - 1].employeeId ? [...next, blank()] : next
    })
  }

  async function save() {
    if (!open) return
    const filled = lines.filter((l) => l.employeeId)
    try {
      await api.put(`/hr/vacation-kinds/${open.vacationKindId}/grants`,
        filled.map((l) => ({ employeeId: Number(l.employeeId), carryOverDays: num(l.carryOverDays), currentDays: num(l.currentDays) })))
      setOpen(null)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('삭제하시겠습니까?')) return
    try {
      for (const id of checked) await api.delete(`/hr/vacation-kinds/${id}/grants`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.vacationKindId))
  const sum = (k: 'carryOverDays' | 'currentDays') => lines.reduce((s, l) => s + (l.employeeId ? num(l[k]) : 0), 0)

  return (
    <EcListShell title="사원별휴가일수조회" searchable={false}
                 actions={[{ label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 }, { label: 'Excel' }]}>
      <div className="ec-pills mb-[8px]"><button type="button" className="ec-pill active">전체</button></div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.vacationKindId)))} />
            </th>
            <th>휴가코드</th>
            <th>휴가명</th>
            <th className="text-center">사용기간</th>
            <th className="text-right">등록인원수</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.vacationKindId}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.vacationKindId)}
                       onChange={() => { const n = new Set(checked); if (n.has(r.vacationKindId)) n.delete(r.vacationKindId); else n.add(r.vacationKindId); setChecked(n) }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openGrant(r) }}>{r.code}</a></td>
              <td>{r.name}</td>
              <td className="text-center">{slash(r.periodFrom)} ~ {slash(r.periodTo)}</td>
              <td className="text-right">{r.headcount ? r.headcount.toFixed(2) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={!!open} title="사원별휴가일수입력" width={1000} onClose={() => setOpen(null)}>
        {open && (
          <>
            <ul className="ec-form mb-[8px]">
              <li><span className="title">휴가</span><div className="form">{open.code}</div></li>
              <li><span className="title">사용기간</span><div className="form">{slash(open.periodFrom)} ~ {slash(open.periodTo)}</div></li>
            </ul>
            <div className="flex gap-[6px] mb-[6px]">
              <button type="button" className="ec-btn ec-btn-sm"
                      onClick={() => setLines(lines.map((l) => {
                        if (!l.employeeId) return l
                        const e = employees.find((x) => String(x.id) === l.employeeId)
                        return { ...l, currentDays: String(annualLeaveDays(e?.hireDate, open.periodFrom)) }
                      }))}>연차계산</button>
            </div>
            <div className="overflow-x-auto">
              <table ref={gridRef} className="w-full text-left">
                <thead>
                  <tr>
                    <th className="w-[34px]"></th>
                    <th className="w-[160px]">사번</th>
                    <th>사원명</th>
                    <th>부서명</th>
                    <th>직급</th>
                    <th className="text-center">입사일</th>
                    <th className="w-[110px] text-right">이월 잔여일수</th>
                    <th className="w-[110px] text-right">당해년 휴가일수</th>
                    <th className="w-[90px] text-right">휴가일수</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const e = employees.find((x) => String(x.id) === l.employeeId)
                    return (
                      <tr key={i}>
                        <td className="text-center text-ec-hint">{i + 1}</td>
                        <td>
                          <CodePickerField label="사번" hideLabel fill placeholder="사번" emptyLabel="선택 해제"
                                           value={l.employeeId} onChange={(v) => edit(i, { employeeId: v })}
                                           items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                        </td>
                        <td>{e?.name ?? ''}</td>
                        <td>{e?.department ?? ''}</td>
                        <td>{e?.jobTitle ?? ''}</td>
                        <td className="text-center">{e?.hireDate?.replace(/-/g, '/') ?? ''}</td>
                        <td>
                          <input className="ec-input w-full text-right" inputMode="decimal" value={l.carryOverDays}
                                 onChange={(ev) => edit(i, { carryOverDays: ev.target.value.replace(/[^0-9.]/g, '') })} />
                        </td>
                        <td>
                          <input className="ec-input w-full text-right" inputMode="decimal" value={l.currentDays}
                                 onChange={(ev) => edit(i, { currentDays: ev.target.value.replace(/[^0-9.]/g, '') })} />
                        </td>
                        <td className="text-right">{l.employeeId ? num(l.carryOverDays) + num(l.currentDays) : ''}</td>
                      </tr>
                    )
                  })}
                  <tr className="font-bold">
                    <td colSpan={6}></td>
                    <td className="text-right">{sum('carryOverDays')}</td>
                    <td className="text-right">{sum('currentDays')}</td>
                    <td className="text-right">{sum('carryOverDays') + sum('currentDays')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex gap-[6px] mt-[12px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
              <button type="button" className="ec-btn" onClick={() => setOpen(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
