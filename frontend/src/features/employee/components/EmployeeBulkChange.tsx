import BulkChangeModal, { type BulkDraft, type BulkField } from '../../../components/BulkChangeModal'
import { api } from '../../../api/client'
import type { EmployeeMaster } from '../../../types/api'

/**
 * 사원리스트 [변경](원본 E090101, 2026-10-04 실측) — 몸통은 공용 BulkChangeModal.
 * 원본 [항목검색] 기본항목 중 우리 사원에 담을 칸이 있는 것만 둔다(생년월일 · 프로젝트 · 여권번호 · 수당/공제항목 · 추가정보는 없다).
 * 수정 API 가 통째로 바꾸므로 고르지 않은 칸은 사원의 지금 값을 그대로 다시 보낸다.
 */
export default function EmployeeBulkChange({ employees, depts, onClose, onSaved }: {
  employees: EmployeeMaster[]
  depts: { id: number; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const fields: BulkField[] = [
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
    { key: 'zipcode', label: '우편번호', kind: 'text' },
    { key: 'foreignName2', label: '외국어성명2', kind: 'text' },
    { key: 'foreignName1', label: '외국어성명1', kind: 'text' },
    { key: 'address', label: '주소', kind: 'text' },
  ]
  const initial = (e: EmployeeMaster): BulkDraft => Object.fromEntries(fields.map((f) => {
    const v = e[f.key as keyof EmployeeMaster]
    return [f.key, v == null ? '' : String(v)]
  }))

  async function saveRow(e: EmployeeMaster, d: BulkDraft) {
    if (!d.name.trim()) throw new Error('사원명을 입력 바랍니다.')
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
      zipcode: d.zipcode.trim(),
      foreignName1: d.foreignName1.trim(), foreignName2: d.foreignName2.trim(),
      address: d.address.trim() || null,
      bankCode: e.bankCode, bankName: e.bankName, accountNo: e.accountNo, accountHolder: e.accountHolder,
      active: !resignDate,
      hireKind: d.hireKind, duty: d.duty,
    })
  }

  return <BulkChangeModal rows={employees} codeLabel="사원번호" fields={fields} initial={initial} saveRow={saveRow} onClose={onClose} onSaved={onSaved} />
}
