import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import CustomFieldsPanel from '../../components/CustomFieldsPanel'
import CodePickerField from '../../components/CodePickerField'
import { bankItems, bankNameOf } from '../../utils/bankCodes'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, EmployeePayType } from '../../types/api'
import { dateText } from '../../utils/dateText'
import EmployeeBulkChange from '../../features/employee/components/EmployeeBulkChange'

const won = (n: number) => n.toLocaleString('ko-KR')
const inputCls = 'ec-input w-full'

interface DeptRow { id: number; name: string; code?: string | null }

type FormTab = '기본' | '급여지급사항' | '추가정보'

/**
 * 관리 &gt; 급여관리 &gt; 기본사항등록 &gt; <b>사원등록</b> (원본 E090101, 화면 제목 '사원리스트').
 *
 * <p>2026-10-03 loginaa 에서 등록 · 수정 · 삭제를 직접 해 보고 맞췄다.
 * <ul>
 *   <li>격자: 사원번호 · 성명 · 부서명 · 직위/직급명 · 전화번호 · Email · 입사일자 · 급여구분. 사원번호 순.</li>
 *   <li>조건([Search(F3)] 로 펼친다): 사원번호 · 성명 · 부서 · 직위/직급 · 급여구분(전체) · 재직구분(재직자).</li>
 *   <li>[신규(F2)] 는 다음 사원번호(00007 꼴)를 채운 '사원등록' 창. 성명이 비면 '사원명을 입력 바랍니다.'
 *       저장하면 안내 없이 창이 닫히고 목록이 다시 그려진다.</li>
 *   <li>성명을 누르면 같은 창이 수정으로 열린다 — 사원번호가 잠기고 [복사] · [삭제] 가 붙는다.</li>
 *   <li>[선택삭제] · [삭제] 는 '한번 지워진 자료는 복구될 수 없습니다. 삭제하겠습니까?' 를 묻고 실제로 지운다.
 *       전표 · 급여 · 근태가 물고 있는 사원은 서버가 막는다 — 그런 사원은 퇴사일을 넣어 퇴사자로 내린다.</li>
 * </ul>
 *
 * <p>원본 폼에 있으나 담을 자리가 없어 그리지 않은 것: 외국어성명 · 주민등록번호 · 세대주여부 · 입사구분 · 직책 ·
 * 여권번호 · 프로젝트 · UserPay비밀번호 · 급여통장 · 우편번호 · 사진 · 첨부, [사원정보] 탭(기본 탭과 같은 칸),
 * [기타설정] 탭(4대보험 · 공제대상가족 · 간이세액표 …), 기본급 밖의 고정수당 · 월정공제 항목.
 */
export default function EmployeePage() {
  const [rows, setRows] = useState<EmployeeMaster[]>([])
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [tab, setTab] = useState<FormTab>('기본')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  /** 원본 [변경] — 체크한 사원들의 항목을 한 번에 고친다. */
  const [bulkOpen, setBulkOpen] = useState(false)

  const empty = {
    code: '', name: '', departmentId: '', jobTitle: '',
    hireDate: new Date().toISOString().slice(0, 10), resignDate: '', resignReason: '',
    phone: '', mobile: '', email: '', address: '', remark: '',
    payType: 'FIXED' as EmployeePayType, baseSalary: '',
    bankCode: '', bankName: '', accountNo: '', accountHolder: '', hireKind: '', duty: '',
  }
  const [form, setForm] = useState(empty)

  function load() {
    setError('')
    // 재직구분 [전체]·[퇴사자] 를 거르려면 퇴사자까지 받아야 한다 — /employees 는 재직자만 준다.
    api.get<EmployeeMaster[]>('/employees/all')
      .then((r) => setRows(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
    api.get<DeptRow[]>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }

  useEffect(() => { load() }, [])

  /** 원본은 창을 열자마자 다음 사원번호를 채워 둔다(고칠 수 있다). */
  async function openNew(base = empty) {
    setEditId(null)
    setTab('기본')
    setFormError('')
    setForm(base)
    setShowForm(true)
    try {
      const r = await api.get<{ code: string }>('/employees/next-code')
      setForm((f) => (f.code ? f : { ...f, code: r.data.code }))
    } catch { /* 비워 두면 서버가 매긴다 */ }
  }

  function openEdit(e: EmployeeMaster) {
    setEditId(e.id)
    setTab('기본')
    setFormError('')
    setForm({
      code: e.code, name: e.name,
      departmentId: e.departmentId ? String(e.departmentId) : '',
      jobTitle: e.jobTitle ?? '', hireKind: e.hireKind ?? '', duty: e.duty ?? '',
      hireDate: e.hireDate ?? '', resignDate: e.resignDate ?? '', resignReason: e.resignReason ?? '',
      phone: e.phone ?? '', mobile: e.mobile ?? '', email: e.email ?? '',
      address: e.address ?? '', remark: e.remark ?? '',
      payType: e.payType, baseSalary: e.baseSalary == null ? '' : String(e.baseSalary),
      bankCode: e.bankCode ?? '', bankName: e.bankName ?? '', accountNo: e.accountNo ?? '', accountHolder: e.accountHolder ?? '',
    })
    setShowForm(true)
  }

  /** 원본 [복사] — 같은 내용으로 새 사원번호를 받아 신규 창을 연다. */
  function copyForm() {
    openNew({ ...form, code: '' })
  }

  async function submit(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!form.name.trim()) { setTab('기본'); setFormError('사원명을 입력 바랍니다.'); return }
    const body = {
      name: form.name.trim(),
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      jobTitle: form.jobTitle.trim() || null,
      hireDate: form.hireDate || null,
      baseSalary: form.baseSalary === '' ? null : Number(form.baseSalary.replace(/,/g, '')) || 0,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      remark: form.remark.trim() || null,
      payType: form.payType,
      mobile: form.mobile.trim() || null,
      resignReason: form.resignReason.trim() || null,
      address: form.address.trim() || null,
      bankCode: form.bankCode.trim() || null,
      bankName: form.bankName.trim() || null,
      accountNo: form.accountNo.trim() || null,
      accountHolder: form.accountHolder.trim() || null,
      hireKind: form.hireKind,
      duty: form.duty,
    }
    try {
      if (editId) {
        const cur = rows.find((r) => r.id === editId)
        await api.put(`/employees/${editId}`, {
          ...body, searchKeyword: cur?.searchKeyword ?? null,
          resignDate: form.resignDate || null,
          // 퇴사일을 지우면 재직자로 되돌린다(서버가 퇴사일과 재직을 함께 맞춘다)
          active: !form.resignDate,
        })
      } else {
        await api.post('/employees', { ...body, code: form.code.trim() || null })
      }
      setShowForm(false)
      load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  const CONFIRM_DELETE = '한번 지워진 자료는 복구될 수 없습니다.\n\n삭제하겠습니까?'

  async function removeIds(ids: number[]) {
    for (const id of ids) {
      await api.delete(`/employees/${id}`)
    }
  }

  async function deleteOne() {
    if (!editId || !window.confirm(CONFIRM_DELETE)) return
    try {
      await removeIds([editId])
      setShowForm(false)
      load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm(CONFIRM_DELETE)) return
    try {
      await removeIds([...checked])
    } catch (err) {
      setError(extractErrorMessage(err))
    }
    setChecked(new Set())
    load()
  }

  // ── 조건 ([Search(F3)] 로 펼치는 판) ──
  const [quick, setQuick] = useState('')
  const [codeCond, setCodeCond] = useState('')
  const [nameCond, setNameCond] = useState('')
  const [deptCond, setDeptCond] = useState('')
  const [titleCond, setTitleCond] = useState('')
  const [payCond, setPayCond] = useState<'ALL' | EmployeePayType>('ALL')
  const [statusCond, setStatusCond] = useState<'ALL' | 'ACTIVE' | 'RESIGNED'>('ACTIVE')

  const shownRows = rows
    .filter((e) => statusCond === 'ALL' || (statusCond === 'ACTIVE' ? !e.resignDate : !!e.resignDate))
    .filter((e) => payCond === 'ALL' || e.payType === payCond)
    .filter((e) => !codeCond || e.code.includes(codeCond))
    .filter((e) => !nameCond || e.name.includes(nameCond))
    .filter((e) => !deptCond || String(e.departmentId ?? '') === deptCond)
    .filter((e) => !titleCond || (e.jobTitle ?? '').includes(titleCond))
    .filter((e) => !quick || e.code.includes(quick) || e.name.includes(quick))
    .sort((a, b) => a.code.localeCompare(b.code))

  // 원본은 열마다 ▼ 정렬 표시를 단다.
  const sort = useTableSort(shownRows, {
    사원번호: (e) => e.code,
    성명: (e) => e.name,
    부서명: (e) => e.department,
    '직위/직급명': (e) => e.jobTitle,
    전화번호: (e) => e.phone ?? '',
    Email: (e) => e.email ?? '',
    입사일자: (e) => e.hireDate ?? '',
    급여구분: (e) => e.payTypeName,
  })
  const shown = sort.sorted

  const allChecked = shown.length > 0 && shown.every((e) => checked.has(e.id))
  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(shown.map((e) => e.id)))
  }
  function toggleOne(id: number) {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id); else next.add(id)
    setChecked(next)
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })

  return (
    <EcListShell
      title="사원리스트"
      collapseConditions
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={() => openNew()}
      actions={[
        { label: '화면인쇄' },
        { label: '변경', onClick: () => {
          if (checked.size === 0) { setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
          setError(''); setBulkOpen(true)
        } },
        { label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/* 원본 조건 차례(기본 탭): 사원번호 · 성명 · 부서 · 프로젝트 · 직위/직급 · 급여구분 · 지급구분 · 재직구분 · 근무기간.
          프로젝트 · 지급구분 · 근무기간은 사원에 그 값이 없어 뺐다. */}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="사원번호">
          <input className="ec-input w-[160px]" value={codeCond} onChange={(e) => setCodeCond(e.target.value)} />
        </EcCond>
        <EcCond label="성명">
          <input className="ec-input w-[160px]" value={nameCond} onChange={(e) => setNameCond(e.target.value)} />
        </EcCond>
        <EcCond label="부서">
          <select className="ec-input w-[160px]" value={deptCond} onChange={(e) => setDeptCond(e.target.value)}>
            <option value="">전체</option>
            {depts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </select>
        </EcCond>
        <EcCond label="직위/직급">
          <input className="ec-input w-[160px]" value={titleCond} onChange={(e) => setTitleCond(e.target.value)} />
        </EcCond>
        <EcCond label="급여구분">
          {([['ALL', '전체'], ['FIXED', '고정급'], ['VARIABLE', '변동급']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]">
              <input type="radio" name="emp-pay" checked={payCond === v} onChange={() => setPayCond(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="재직구분">
          {([['ALL', '전체'], ['ACTIVE', '재직자'], ['RESIGNED', '퇴사자']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]">
              <input type="radio" name="emp-status" checked={statusCond === v} onChange={() => setStatusCond(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>

      {bulkOpen && (
        <EmployeeBulkChange employees={rows.filter((r) => checked.has(r.id))} depts={depts}
                            onClose={() => setBulkOpen(false)}
                            onSaved={() => { setBulkOpen(false); setChecked(new Set()); load() }} />
      )}
      <Modal error={formError} open={showForm} title="사원등록" width={720} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit}>
          {/* 원본 폼 탭은 알약이다: 기본 · 사원정보 · 급여지급사항 · 추가정보 · 기타설정 (사원정보 · 기타설정은 위 주석) */}
          <div className="ec-pills mb-[8px]">
            {(['기본', '급여지급사항', ...(editId ? ['추가정보'] : [])] as FormTab[]).map((t) => (
              <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
                      onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {tab === '기본' && (
            <ul className="ec-form">
              <Field label="사원번호">
                {editId
                  ? <span>{form.code}</span>
                  : <input className={inputCls} value={form.code} onChange={set('code')} />}
              </Field>
              <Field label="성명">
                <input className={inputCls} value={form.name} onChange={set('name')} placeholder="성명" autoFocus />
              </Field>
              <Field label="입사일자">
                <input type="date" className={inputCls} value={form.hireDate} onChange={set('hireDate')} />
              </Field>
              {/* 원본 [입사구분] 코드도움 — 100 신입 · 200 경력 */}
              <Field label="입사구분">
                <CodePickerField label="입사구분" hideLabel fill placeholder="입사구분" emptyLabel="선택 해제"
                                 value={form.hireKind} onChange={(v) => setForm({ ...form, hireKind: v })}
                                 items={[{ value: '신입', code: '100', name: '신입' }, { value: '경력', code: '200', name: '경력' },
                                   ...(form.hireKind && !['신입', '경력'].includes(form.hireKind) ? [{ value: form.hireKind, name: form.hireKind }] : [])]} />
              </Field>
              <Field label="직위/직급">
                <input className={inputCls} value={form.jobTitle} onChange={set('jobTitle')} placeholder="직위/직급" />
              </Field>
              {/* 원본 [직책] 코드도움 — 100 팀원 · 200 팀장 */}
              <Field label="직책">
                <CodePickerField label="직책" hideLabel fill placeholder="직책" emptyLabel="선택 해제"
                                 value={form.duty} onChange={(v) => setForm({ ...form, duty: v })}
                                 items={[{ value: '팀원', code: '100', name: '팀원' }, { value: '팀장', code: '200', name: '팀장' },
                                   ...(form.duty && !['팀원', '팀장'].includes(form.duty) ? [{ value: form.duty, name: form.duty }] : [])]} />
              </Field>
              <Field label="퇴사일자">
                <input type="date" className={inputCls} value={form.resignDate} onChange={set('resignDate')} />
              </Field>
              <Field label="퇴사사유">
                <input className={inputCls} value={form.resignReason} onChange={set('resignReason')} placeholder="퇴사사유" />
              </Field>
              <Field label="전화">
                <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="전화" />
              </Field>
              <Field label="모바일">
                <input className={inputCls} value={form.mobile} onChange={set('mobile')} placeholder="모바일" />
              </Field>
              <Field label="Email">
                <input className={inputCls} value={form.email} onChange={set('email')} placeholder="Email" />
              </Field>
              <Field label="부서코드">
                <CodePickerField
                  label="" placeholder="부서코드" emptyLabel="선택 해제"
                  value={form.departmentId}
                  onChange={(v) => setForm({ ...form, departmentId: v })}
                  items={depts.map((d) => ({ value: String(d.id), code: d.code ?? undefined, name: d.name }))}
                />
              </Field>
              {/* 원본 [급여통장] — 은행 · 계좌번호 · 예금주 세 칸을 한 이름표 아래 쌓는다 */}
              <Field label="급여통장" wide>
                <div className="flex gap-[6px] w-full mobile:flex-col">
                  {/* 원본 은행 칸은 은행코드 코드도움(85줄) — 고르면 코드 · 은행명이 같이 찬다 */}
                  <div className="flex-1">
                    <CodePickerField label="은행" hideLabel fill pair placeholder="은행" emptyLabel="선택 해제"
                                     value={form.bankCode}
                                     onChange={(v, it) => setForm({ ...form, bankCode: v, bankName: it?.name ?? '' })}
                                     items={form.bankCode && !bankNameOf(form.bankCode)
                                       ? [...bankItems(), { value: form.bankCode, code: form.bankCode, name: form.bankName }]
                                       : bankItems()} />
                  </div>
                  <input className="ec-input flex-1" value={form.accountNo} onChange={set('accountNo')} placeholder="계좌번호" />
                  <input className="ec-input flex-1" value={form.accountHolder} onChange={set('accountHolder')} placeholder="예금주" />
                </div>
              </Field>
              <Field label="주소" wide>
                <textarea className={inputCls} rows={2} value={form.address} onChange={set('address')} placeholder="주소" />
              </Field>
              <Field label="적요" wide>
                <textarea className={inputCls} rows={2} value={form.remark} onChange={set('remark')} placeholder="적요" />
              </Field>
            </ul>
          )}

          {tab === '급여지급사항' && (
            <>
              <ul className="ec-form mb-[10px]">
                <Field label="사원번호"><span>{form.code}</span></Field>
                <Field label="성명"><span>{form.name}</span></Field>
                <Field label="급여구분">
                  {([['FIXED', '고정급'], ['VARIABLE', '변동급']] as const).map(([v, l]) => (
                    <label key={v} className="mr-[10px]">
                      <input type="radio" name="emp-form-pay" checked={form.payType === v}
                             onChange={() => setForm({ ...form, payType: v })} /> {l}
                    </label>
                  ))}
                </Field>
              </ul>
              <p className="font-bold mb-[4px]">&gt; 고정수당</p>
              <table className="w-full">
                <thead><tr><th>수당항목명</th><th className="w-[45%]">내역</th></tr></thead>
                <tbody>
                  <tr>
                    <td>기본급</td>
                    <td>
                      <input className="ec-input w-full text-right" inputMode="numeric" value={form.baseSalary}
                             onChange={set('baseSalary')} />
                    </td>
                  </tr>
                  <tr>
                    <td></td>
                    <td className="text-right font-bold">{won(Number(form.baseSalary.replace(/,/g, '')) || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* 원본 [추가정보] 는 문자형 · 숫자형 · Y/N · 일자 · 코드형 칸을 이름째 박아 둔다. 우리는
              Self-Customizing 에서 이름을 지어 정의한 칸이 여기 뜬다. 값은 행에 붙으므로 수정할 때만 있다. */}
          {tab === '추가정보' && editId && <CustomFieldsPanel entityType="EMPLOYEE" entityId={editId} />}

          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            {editId && <button type="button" className="ec-btn" onClick={copyForm}>복사</button>}
            <button type="button" className="ec-btn"
                    onClick={() => (editId ? openEdit(rows.find((r) => r.id === editId)!) : setForm({ ...empty, code: form.code }))}>
              다시 작성
            </button>
            {editId && <button type="button" className="ec-btn" onClick={deleteOne}>삭제</button>}
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
            <th className="cursor-pointer" onClick={() => sort.toggle('사원번호')}>사원번호 {sort.mark('사원번호')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('성명')}>성명 {sort.mark('성명')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('부서명')}>부서명 {sort.mark('부서명')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('직위/직급명')}>직위/직급명 {sort.mark('직위/직급명')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('전화번호')}>전화번호 {sort.mark('전화번호')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('Email')}>Email {sort.mark('Email')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('입사일자')}>입사일자 {sort.mark('입사일자')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('급여구분')}>급여구분 {sort.mark('급여구분')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((e) => (
            <tr key={e.id}>
              <td className="text-center"><input type="checkbox" checked={checked.has(e.id)} onChange={() => toggleOne(e.id)} /></td>
              <td><a href="#" onClick={(ev) => { ev.preventDefault(); openEdit(e) }}>{e.code}</a></td>
              <td><a href="#" onClick={(ev) => { ev.preventDefault(); openEdit(e) }}>{e.name}</a></td>
              <td>{e.department}</td>
              <td>{e.jobTitle}</td>
              <td>{e.phone}</td>
              <td>{e.email}</td>
              <td className="text-center">{dateText(e.hireDate) || ''}</td>
              <td className="text-center">{e.payTypeName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}

/** 원본 입력 판 한 칸 — 이름표 92 · 값. wide 는 두 칸을 차지한다(주소 · 적요). */
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <li className={wide ? 'wide' : undefined}>
      <span className="title">{label}</span>
      <div className="form">{children}</div>
    </li>
  )
}
