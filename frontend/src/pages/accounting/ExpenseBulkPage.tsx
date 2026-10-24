import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcNumInput from '../../components/EcNumInput'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert } from '../../components/EcDialog'
import type { ExpenseControlType, ExpenseItem } from '../../features/expensemaster/api'
import type { EmployeeMaster } from '../../types/api'

/**
 * 회계 II › 비용관리 › 기본사항등록 › <b>비용일괄등록</b>(원본 E060811) — 2026-10-20 loginaa 실측(plans/회계2/비용관리.md 1.4).
 * 창이 아니라 화면 하나: 비용 마스터 전부가 줄로 나오는 편집 격자 + [저장(F8)].
 * 고칠 수 있는 칸은 비용명 · 한도금액(통제유형이 있는 줄만). 나머지는 비용등록에서 정한 값을 보여 준다.
 * 저장 뒤 안내는 원본에서 못 쟀다 — 우리 일괄 저장 화면(단가일괄변경)처럼 말 없이 격자만 다시 불러온다.
 */
export default function ExpenseBulkPage() {
  const [rows, setRows] = useState<ExpenseItem[]>([])
  const [controls, setControls] = useState<ExpenseControlType[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [names, setNames] = useState<Record<number, string>>({})
  const [limits, setLimits] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    api.get<ExpenseItem[]>('/expense-items')
      .then((r) => { setRows(r.data.filter((i) => i.active)); setNames({}); setLimits({}) })
      .catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    load()
    api.get<ExpenseControlType[]>('/expense-control-types').then((r) => setControls(r.data)).catch(() => undefined)
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => undefined)
  }, [])

  const ctl = useMemo(() => new Map(controls.map((c) => [c.id, c])), [controls])
  const emp = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees])
  const empNames = (ids: number[]) => ids.map((id) => emp.get(id) ?? id).join(', ')
  const fmt = (n: number | null) => (n == null ? '' : n.toLocaleString('ko-KR'))

  const changed = rows.filter((i) => {
    const n = names[i.id]; const l = limits[i.id]
    return (n != null && n.trim() !== i.name) || (l != null && l !== '' && Number(l) !== (i.limitAmount ?? 0))
  })

  async function save() {
    setError('')
    if (changed.length === 0) return void ecAlert('변경된정보가 없습니다.')
    if (changed.some((i) => !(names[i.id] ?? i.name).trim())) return void ecAlert('비용명을 입력하세요.')
    setSaving(true)
    try {
      await api.put('/expense-items/bulk', {
        changes: changed.map((i) => ({
          id: i.id, name: (names[i.id] ?? i.name).trim(),
          limitAmount: i.controlTypeId != null && limits[i.id] !== undefined && limits[i.id] !== '' ? Number(limits[i.id]) : null,
        })),
      })
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <EcListShell
      title="비용일괄등록"
      searchable={false}
      onSearch={() => undefined}
      actions={[{ label: saving ? '저장 중…' : '저장(F8)', onClick: save, primary: true }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full">
        <thead>
          <tr>
            <th>비용코드</th><th>비용명</th><th>통제유형코드</th><th>통제유형명</th>
            <th>기간구분</th><th>기간구분</th><th>기간</th><th>인원통제</th><th>인원통제</th>
            <th>한도구분</th><th>한도구분</th><th className="text-right">한도금액</th>
            <th>통제알림방식</th><th>통제알림방식</th><th>PIC</th><th>PIC_NOTI</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={16} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
          {rows.map((i) => {
            const c = i.controlTypeId != null ? ctl.get(i.controlTypeId) : undefined
            const period = c?.periodType === 'DESIGNATED' ? `${i.controlFrom ?? ''} ~ ${i.controlTo ?? ''}` : (c ? '' : '    /  /  ~     /  /')
            return (
              <tr key={i.id}>
                <td>{i.code}</td>
                <td><input className="ec-input w-full" aria-label="비용명" value={names[i.id] ?? i.name}
                           onChange={(e) => setNames({ ...names, [i.id]: e.target.value })} /></td>
                <td>{i.controlTypeCode}</td>
                <td>{i.controlTypeName}</td>
                <td>{c?.periodType}</td><td>{i.periodTypeName}</td>
                <td>{period}</td>
                <td>{c ? String(c.personControl) : ''}</td><td>{i.personControlName}</td>
                <td>{c?.limitType ?? 'TOTAL'}</td><td>{i.limitTypeName}</td>
                <td className="text-right">
                  {i.controlTypeId != null
                    ? <EcNumInput className="ec-input w-[120px] text-right" aria-label="한도금액"
                                  value={limits[i.id] ?? String(i.limitAmount ?? 0)} onValue={(v) => setLimits({ ...limits, [i.id]: v })} />
                    : fmt(i.limitAmount)}
                </td>
                <td>{c?.noticeType}</td><td>{c?.noticeTypeName}</td>
                <td>{empNames(i.employeeIds)}</td><td>{empNames(i.alertEmployeeIds)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
