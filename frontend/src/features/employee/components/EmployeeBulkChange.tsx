import { useState } from 'react'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'
import type { EmployeeMaster } from '../../../types/api'

type Kind = 'text' | 'date' | 'select'
interface Field { key: keyof EmployeeMaster; label: string; kind: Kind; options?: [string, string][] }
type Draft = Record<string, string>

/**
 * 사원리스트 [변경](원본 E090101, 2026-10-04 실측) — 고른 사원들의 항목을 한 번에 고친다.
 * ① 리스트에 체크한 사원이 없으면 '리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'
 * ② [항목검색] 창에서 바꿀 항목을 고르고 [적용] → ③ [변경] 창: 위 줄(항목 고르기 · 값 · 적용)로 모든 줄에 같은 값을 넣고,
 *    격자(사원번호 · 성명 · 고른 항목)에서 줄마다 고친 뒤 [저장(F8)].
 * 원본 항목 중 우리 사원에 담을 칸이 있는 기본항목만 둔다(생년월일 · 프로젝트 · 여권번호 · 수당/공제항목 · 추가정보는 없다).
 */
export default function EmployeeBulkChange({ employees, depts, onClose, onSaved }: {
  employees: EmployeeMaster[]
  depts: { id: number; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const FIELDS: Field[] = [
    { key: 'name', label: '성명', kind: 'text' },
    { key: 'departmentId', label: '부서코드', kind: 'select', options: depts.map((d) => [String(d.id), d.name]) },
    { key: 'jobTitle', label: '직위/직급', kind: 'text' },
    { key: 'duty', label: '직책', kind: 'select', options: [['팀원', '팀원'], ['팀장', '팀장']] },
    { key: 'phone', label: '전화', kind: 'text' },
    { key: 'mobile', label: '모바일', kind: 'text' },
    { key: 'email', label: 'Email', kind: 'text' },
    { key: 'hireDate', label: '입사일자', kind: 'date' },
    { key: 'hireKind', label: '입사구분', kind: 'select', options: [['신입', '신입'], ['경력', '경력']] },
    { key: 'resignDate', label: '퇴사일자', kind: 'date' },
    { key: 'resignReason', label: '퇴사사유', kind: 'text' },
    { key: 'remark', label: '적요', kind: 'text' },
    { key: 'payType', label: '급여구분', kind: 'select', options: [['FIXED', '고정급'], ['VARIABLE', '변동급']] },
    { key: 'address', label: '주소', kind: 'text' },
  ]
  const [step, setStep] = useState<'pick' | 'edit'>('pick')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Draft[]>(() => employees.map((e) =>
    Object.fromEntries(FIELDS.map((f) => [f.key, e[f.key] == null ? '' : String(e[f.key])]))))
  const [allKey, setAllKey] = useState('')
  const [allValue, setAllValue] = useState('')
  const [error, setError] = useState('')
  const chosen = FIELDS.filter((f) => picked.has(f.key))

  function editor(f: Field, value: string, onChange: (v: string) => void, cls = 'ec-input w-full') {
    if (f.kind === 'select') {
      return (
        <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value=""></option>
          {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
    }
    return <input type={f.kind === 'date' ? 'date' : 'text'} className={cls} value={value} onChange={(e) => onChange(e.target.value)} />
  }

  async function save() {
    setError('')
    try {
      for (const [i, e] of employees.entries()) {
        const d = drafts[i]
        if (!d.name.trim()) { setError('사원명을 입력 바랍니다.'); return }
        const resignDate = d.resignDate || null
        await api.put(`/employees/${e.id}`, {
          name: d.name.trim(),
          departmentId: d.departmentId ? Number(d.departmentId) : null,
          jobTitle: d.jobTitle.trim() || null,
          hireDate: d.hireDate || null,
          resignDate,
          baseSalary: e.baseSalary,
          phone: d.phone.trim() || null,
          email: d.email.trim() || null,
          searchKeyword: e.searchKeyword,
          remark: d.remark.trim() || null,
          payType: d.payType || 'FIXED',
          mobile: d.mobile.trim() || null,
          resignReason: d.resignReason.trim() || null,
          address: d.address.trim() || null,
          bankCode: e.bankCode, bankName: e.bankName, accountNo: e.accountNo, accountHolder: e.accountHolder,
          active: !resignDate,
          hireKind: d.hireKind, duty: d.duty,
        })
      }
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  if (step === 'pick') {
    return (
      <Modal open title="항목검색" width={520} onClose={onClose}>
        <p className="text-ec-hint mb-[6px]">기본항목 선택</p>
        <table className="w-full text-left">
          <thead><tr><th className="w-[34px]"></th><th>항목명</th></tr></thead>
          <tbody>
            {FIELDS.filter((f) => f.key !== 'name').map((f) => (
              <tr key={f.key}>
                <td className="text-center">
                  <input type="checkbox" aria-label={f.label} checked={picked.has(f.key)} onChange={() => {
                    const n = new Set(picked); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); setPicked(n)
                  }} />
                </td>
                <td>{f.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => { setAllKey(chosen[0]?.key ?? 'name'); setStep('edit') }}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
    )
  }

  const editable = [FIELDS[0], ...chosen]
  const allField = editable.find((f) => f.key === allKey) ?? FIELDS[0]
  return (
    <Modal open title="변경" width={Math.min(1100, 360 + chosen.length * 160)} error={error} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setStep('pick')}>변경항목선택</button>
      </div>
      <div className="ec-form flex flex-wrap items-center gap-[6px] mb-[8px]">
        <select className="ec-input w-[140px]" value={allField.key} onChange={(e) => { setAllKey(e.target.value); setAllValue('') }}>
          {editable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <div className="w-[260px]">{editor(allField, allValue, setAllValue)}</div>
        <button type="button" className="ec-btn" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, [allField.key]: allValue })))}>적용</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th>사원번호</th>
              {editable.map((f) => <th key={f.key}>{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {employees.map((e, i) => (
              <tr key={e.id}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>{e.code}</td>
                {editable.map((f) => (
                  <td key={f.key}>{editor(f, drafts[i][f.key], (v) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, [f.key]: v } : d))))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[6px] mt-[12px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
