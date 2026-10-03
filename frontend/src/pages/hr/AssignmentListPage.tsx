import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { STATUS_PICKS } from '../../components/EcPeriodPicks'
import AssignmentConds, { initialAssignmentConds, matchAssignment } from '../../features/assignment/components/AssignmentConds'
import Modal from '../../components/Modal'
import AssignmentSlipForm from '../../features/assignment/components/AssignmentSlipForm'
import { groupSlips, slipLabel, type AssignmentLine } from '../../features/assignment/types'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 관리 &gt; 인사관리 &gt; 인사발령 &gt; <b>인사발령조회</b> (원본 E020602).
 *
 * <p>2026-10-03 loginaa 실측: 기간 전월+금월(2026/09/01 ~ 2026/10/03) · 격자 일자-No. · 성명 · 발령구분 · 적요 ·
 * 버튼 신규(F2) · 선택삭제 · Excel. 조건은 접혀 있고 [Search(F3)] 로 편다 — 기준일자 · 발령일자(사용) · 사원 · 발령구분 ·
 * 입사구분 · 직위/직급 · 부서 · 적요. [일자-No.]를 누르면 '인사발령입력수정' 창이 뜬다.
 * 한 전표에 여러 사원이면 성명을 '홍길동 외 1건' 으로 찍는다(근무조회와 같은 꼴). 조건 판은 AssignmentConds. 이력 탭은 없다.
 */
export default function AssignmentListPage() {
  const nav = useNavigate()
  const [conds, setConds] = useState(initialAssignmentConds)
  const range = conds.range
  const [quick, setQuick] = useState('')
  const [lines, setLines] = useState<AssignmentLine[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<AssignmentLine | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<AssignmentLine[]>('/employees/assignment-slips', { params: { from: range.from, to: range.to } })
      .then((r) => setLines(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { search() }, [])

  const slips = groupSlips(lines.filter((l) => matchAssignment(conds, l)
    && (!quick || l.employeeName.includes(quick) || (l.remark ?? '').includes(quick))))
  useTableColumnCheck(tableRef, '인사발령조회', [slips.length])
  const keyOf = (s: AssignmentLine[]) => `${s[0].slipDate}/${s[0].slipNo}`
  const allChecked = slips.length > 0 && slips.every((s) => checked.has(keyOf(s)))

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('전표를 삭제하겠습니까?')) return
    try {
      for (const s of slips.filter((x) => checked.has(keyOf(x)))) {
        await api.delete(`/employees/assignment-slips/${s[0].slipDate}/${s[0].slipNo}`)
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    search()
  }

  return (
    <EcListShell
      title="인사발령조회"
      search={quick}
      onSearchChange={setQuick}
      onSearch={search}
      onNew={() => nav('/hr/assignments/input')}
      actions={[
        { label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond mb-[8px]">
        <AssignmentConds value={conds} onChange={setConds} lines={lines} />
        <li className="flex flex-wrap items-center gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
          <EcPeriodPicks labels={STATUS_PICKS} currentFrom={range.from} onPick={(r) => setConds({ ...conds, range: r })} />
        </li>
      </ul>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="text-right text-ec-hint mb-[4px]">{range.from.replace(/-/g, '/')} ~ {range.to.replace(/-/g, '/')}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(slips.map(keyOf)))} />
            </th>
            <th className="w-[160px]">일자-No.</th>
            <th>성명</th>
            <th>발령구분</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {slips.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : slips.map((s) => (
            <tr key={keyOf(s)}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(keyOf(s))}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(keyOf(s))) next.delete(keyOf(s)); else next.add(keyOf(s))
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setOpen(s[0]) }}>{slipLabel(s[0])}</a></td>
              <td>{s[0].employeeName}{s.length > 1 ? ` 외 ${s.length - 1}건` : ''}</td>
              <td>{s[0].typeName}</td>
              <td>{s[0].remark ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={error} open={!!open} title="인사발령입력수정" width={1200} onClose={() => setOpen(null)}>
        {open && (
          <AssignmentSlipForm slipDate={open.slipDate} slipNo={open.slipNo}
                              onClose={() => setOpen(null)} onSaved={() => { setOpen(null); search() }} />
        )}
      </Modal>
    </EcListShell>
  )
}
