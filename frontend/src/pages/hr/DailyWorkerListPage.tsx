import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { BANK_CODES } from '../../utils/bankCodes'
import Modal from '../../components/Modal'
import BulkChangeModal, { type BulkDraft, type BulkField } from '../../components/BulkChangeModal'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { Department } from '../../types/api'
import { ymd } from '../../utils/periods'

interface DailyWorker {
  id: number; code: string; name: string; foreigner: boolean; nationality: string | null
  departmentId: number | null; department: string; mobile: string | null; email: string | null
  hireDate: string | null; resignDate: string | null; zipcode: string | null; address: string | null
  employmentInsurance: boolean; pensionAuto: boolean; pensionBase: number | null
  healthAuto: boolean; healthBase: number | null
  bankName: string | null; accountNo: string | null; accountHolder: string | null; remark: string | null
  dailyWage: number | null; fixedIncomeTax: number | null; fixedLocalTax: number | null
}

interface Form {
  code: string; name: string; foreigner: boolean; nationality: string; departmentId: string; mobile: string; email: string
  hireDate: string; resignDate: string; zipcode: string; address: string
  employmentInsurance: boolean; pensionAuto: boolean; pensionBase: string; healthAuto: boolean; healthBase: string
  bankName: string; accountNo: string; accountHolder: string; remark: string
  dailyWage: string; fixedIncomeTax: string; fixedLocalTax: string
}
const blankForm = (): Form => ({
  code: '', name: '', foreigner: false, nationality: '', departmentId: '', mobile: '', email: '',
  hireDate: ymd(new Date()), resignDate: '', zipcode: '', address: '',
  employmentInsurance: true, pensionAuto: false, pensionBase: '', healthAuto: false, healthBase: '',
  bankName: '', accountNo: '', accountHolder: '', remark: '', dailyWage: '', fixedIncomeTax: '', fixedLocalTax: '',
})
const str = (v: unknown) => (v == null ? '' : String(v))
const num = (s: string) => (s === '' ? null : Number(s.replace(/,/g, '')))
const won = (s: string) => (s === '' ? '' : Number(s).toLocaleString('ko-KR'))
type Tab = '기본' | '급여지급사항'

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 기본사항 등록 &gt; <b>일용근로 사원등록</b> (원본 E020105, 화면 제목 '일용근로 사원리스트').
 *
 * <p>2026-10-03 loginaa 에서 넣고 지워 본 그대로:
 * <ul>
 *   <li>상용 사원과 다른 목록이다(번호 00001 · 00002 …). 격자 사원번호 · 성명 · 입사일자 · 퇴사일자 · 주소.
 *       버튼 신규(F2) · 화면인쇄 · SMS · 프린트문제해결 · 변경 · 선택삭제 · Excel · 웹자료올리기 · 이력조회.</li>
 *   <li>[신규(F2)] '사원등록' 창 — [기본]: 사원번호(다음 번호 00003 미리 채움) · 성명 · 주민등록번호 · 외국인(국적) · 부서코드 ·
 *       모바일 · Email · 입사일자(오늘) · 퇴사일자 · 우편번호 · 주소 · 고용보험(대상 · 대상아님) · 국민연금(기준소득월액기준 · 자동계산,
 *       기준소득월액) · 건강보험(보수월액기준 · 자동계산, 보수월액) · 급여통장(은행 · 계좌번호 · 예금주) · 적요.
 *       [급여지급사항]: 지급구분(1차수) · 일급수당 일근무 내역 · 월정공제 소득세 · 지방소득세.</li>
 *   <li>저장하면 안내 없이 닫히고 목록에 붙는다. 선택삭제: '한번 지워진 자료는 복구될 수 없습니다. 삭제하겠습니까?'</li>
 * </ul>
 * 일근무 150,000 인 사원이 근무입력에 일근무 2.00 을 넣고 급여대장을 전체계산하면 지급총액 300,000 · 소득세 0 · 실지급액 300,000
 * (일급 15만원까지 비과세) — 근무입력 · 급여대장은 다음 바퀴에 이 목록으로 바꾼다(지금 /hr/daily-wage 는 상용 사원 출역).
 * 주민등록번호 · 사원정보 · 추가정보 · 기타설정 탭 · 화면인쇄 · SMS · 변경 · 웹자료올리기 · 이력조회는 없다.
 */
export default function DailyWorkerListPage() {
  const [rows, setRows] = useState<DailyWorker[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  /** 원본 [변경] — 체크한 사원들의 항목을 한 번에 고친다(사원등록과 같은 창). */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(blankForm())
  const [tab, setTab] = useState<Tab>('기본')
  const tableRef = useRef<HTMLTableElement>(null)

  function load() {
    setError('')
    api.get<DailyWorker[]>('/hr/daily-workers').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    load()
    api.get<Department[]>('/departments').then((r) => setDepartments(r.data)).catch(() => setDepartments([]))
  }, [])

  const filtered = rows.filter((r) => !quick || r.code.includes(quick) || r.name.includes(quick))
  const sort = useTableSort(filtered, {
    사원번호: (r) => r.code, 성명: (r) => r.name, 입사일자: (r) => r.hireDate ?? '', 퇴사일자: (r) => r.resignDate ?? '',
    주소: (r) => r.address ?? '',
  })
  const shown = sort.sorted
  useTableColumnCheck(tableRef, '일용근로 사원리스트', [shown.length])
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  async function openNew() {
    setEditId(null); setForm(blankForm()); setFormError(''); setTab('기본'); setOpen(true)
    try {
      const r = await api.get<{ code: string }>('/hr/daily-workers/next-code')
      setForm((f) => (f.code ? f : { ...f, code: r.data.code }))
    } catch { /* 비우면 서버가 매긴다 */ }
  }
  function openEdit(w: DailyWorker) {
    setEditId(w.id); setFormError(''); setTab('기본')
    setForm({
      code: w.code, name: w.name, foreigner: w.foreigner, nationality: str(w.nationality), departmentId: str(w.departmentId),
      mobile: str(w.mobile), email: str(w.email), hireDate: str(w.hireDate), resignDate: str(w.resignDate),
      zipcode: str(w.zipcode), address: str(w.address), employmentInsurance: w.employmentInsurance,
      pensionAuto: w.pensionAuto, pensionBase: str(w.pensionBase), healthAuto: w.healthAuto, healthBase: str(w.healthBase),
      bankName: str(w.bankName), accountNo: str(w.accountNo), accountHolder: str(w.accountHolder), remark: str(w.remark),
      dailyWage: str(w.dailyWage), fixedIncomeTax: str(w.fixedIncomeTax), fixedLocalTax: str(w.fixedLocalTax),
    })
    setOpen(true)
  }

  async function save() {
    if (!form.name.trim()) { setFormError('성명을 입력 바랍니다.'); setTab('기본'); return }
    const body = {
      ...form, code: form.code.trim() || null, departmentId: form.departmentId ? Number(form.departmentId) : null,
      hireDate: form.hireDate || null, resignDate: form.resignDate || null,
      pensionBase: num(form.pensionBase), healthBase: num(form.healthBase),
      dailyWage: num(form.dailyWage), fixedIncomeTax: num(form.fixedIncomeTax), fixedLocalTax: num(form.fixedLocalTax),
    }
    try {
      if (editId) await api.put(`/hr/daily-workers/${editId}`, body)
      else await api.post('/hr/daily-workers', body)
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('한번 지워진 자료는 복구될 수 없습니다.\n\n삭제하겠습니까?')) return
    try {
      for (const id of checked) await api.delete(`/hr/daily-workers/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const text = (label: string, key: keyof Form, wide = false) => (
    <li className={wide ? 'wide' : undefined}>
      <span className="title">{label}</span>
      <div className="form">
        <input className="ec-input w-full" placeholder={label} value={form[key] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<Form>)} />
      </div>
    </li>
  )
  const money = (key: 'pensionBase' | 'healthBase' | 'dailyWage' | 'fixedIncomeTax' | 'fixedLocalTax', placeholder = '') => (
    <input className="ec-input w-full text-right" inputMode="numeric" placeholder={placeholder} value={won(form[key])}
           onChange={(e) => set({ [key]: e.target.value.replace(/[^0-9]/g, '') } as Partial<Form>)} />
  )

  return (
    <EcListShell
      title="일용근로 사원리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={load}
      onNew={openNew}
      actions={[
        { label: '화면인쇄', onClick: () => window.print() },
        { label: '변경', onClick: () => {
          if (checked.size === 0) { setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
          setError(''); setBulkOpen(true)
        } },
        { label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('사원번호')}>사원번호 {sort.mark('사원번호')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('성명')}>성명 {sort.mark('성명')}</th>
            <th className="text-center cursor-pointer" onClick={() => sort.toggle('입사일자')}>입사일자 {sort.mark('입사일자')}</th>
            <th className="text-center cursor-pointer" onClick={() => sort.toggle('퇴사일자')}>퇴사일자 {sort.mark('퇴사일자')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('주소')}>주소 {sort.mark('주소')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.name}</a></td>
              <td className="text-center">{r.hireDate?.replace(/-/g, '/') ?? ''}</td>
              <td className="text-center">{r.resignDate?.replace(/-/g, '/') ?? ''}</td>
              <td>{r.address ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {bulkOpen && (
        <BulkChangeModal rows={rows.filter((r) => checked.has(r.id))} codeLabel="사원번호" fields={bulkFields(departments)}
                         initial={bulkInitial} saveRow={bulkSave}
                         onClose={() => setBulkOpen(false)}
                         onSaved={() => { setBulkOpen(false); setChecked(new Set()); load() }} />
      )}
      <Modal error={formError} open={open} title="사원등록" width={820} onClose={() => setOpen(false)}>
        <div className="ec-pills mb-[8px]">
          {(['기본', '급여지급사항'] as const).map((t) => (
            <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        {tab === '기본' ? (
          <ul className="ec-form">
            <li className="wide">
              <span className="title">사원번호</span>
              <div className="form">
                {editId ? <span>{form.code}</span> : <input className="ec-input w-full" value={form.code} onChange={(e) => set({ code: e.target.value })} />}
              </div>
            </li>
            {text('성명', 'name', true)}
            <li>
              <span className="title">외국인</span>
              <div className="form flex items-center gap-[6px]">
                <label className="inline-flex items-center gap-[4px]">
                  <input type="checkbox" checked={form.foreigner} onChange={(e) => set({ foreigner: e.target.checked })} /> 외국인
                </label>
                <input className="ec-input flex-1" placeholder="국적" disabled={!form.foreigner} value={form.nationality} onChange={(e) => set({ nationality: e.target.value })} />
              </div>
            </li>
            <li>
              <span className="title">부서코드</span>
              <div className="form">
                <CodePickerField label="부서코드" hideLabel fill placeholder="부서코드" emptyLabel="선택 해제"
                                 value={form.departmentId} onChange={(v) => set({ departmentId: v })}
                                 items={departments.map((d) => ({ value: String(d.id), code: d.code, name: d.name }))} />
              </div>
            </li>
            {text('모바일', 'mobile')}
            {text('Email', 'email')}
            <li>
              <span className="title">입사일자</span>
              <div className="form"><input type="date" className="ec-input w-[150px]" value={form.hireDate} onChange={(e) => set({ hireDate: e.target.value })} /></div>
            </li>
            <li>
              <span className="title">퇴사일자</span>
              <div className="form"><input type="date" className="ec-input w-[150px]" value={form.resignDate} onChange={(e) => set({ resignDate: e.target.value })} /></div>
            </li>
            {text('우편번호', 'zipcode', true)}
            <li className="wide">
              <span className="title">주소</span>
              <div className="form"><textarea className="ec-input w-full h-[48px]" placeholder="주소" value={form.address} onChange={(e) => set({ address: e.target.value })} /></div>
            </li>
            <li className="wide">
              <span className="title">고용보험</span>
              <div className="form flex items-center gap-[12px]">
                {([[true, '대상'], [false, '대상아님']] as const).map(([v, l]) => (
                  <label key={l} className="inline-flex items-center gap-[4px]">
                    <input type="radio" name="dw-ei" checked={form.employmentInsurance === v} onChange={() => set({ employmentInsurance: v })} /> {l}
                  </label>
                ))}
              </div>
            </li>
            <li className="wide">
              <span className="title">국민연금</span>
              <div className="form">
                <div className="flex items-center gap-[12px] mb-[4px]">
                  {([[false, '기준소득월액기준'], [true, '자동계산']] as const).map(([v, l]) => (
                    <label key={l} className="inline-flex items-center gap-[4px]">
                      <input type="radio" name="dw-np" checked={form.pensionAuto === v} onChange={() => set({ pensionAuto: v })} /> {l}
                    </label>
                  ))}
                </div>
                {!form.pensionAuto && money('pensionBase', '기준소득월액')}
              </div>
            </li>
            <li className="wide">
              <span className="title">건강보험</span>
              <div className="form">
                <div className="flex items-center gap-[12px] mb-[4px]">
                  {([[false, '보수월액기준'], [true, '자동계산']] as const).map(([v, l]) => (
                    <label key={l} className="inline-flex items-center gap-[4px]">
                      <input type="radio" name="dw-hi" checked={form.healthAuto === v} onChange={() => set({ healthAuto: v })} /> {l}
                    </label>
                  ))}
                </div>
                {!form.healthAuto && money('healthBase', '보수월액')}
              </div>
            </li>
            <li className="wide">
              <span className="title">급여통장</span>
              <div className="form flex flex-col gap-[4px]">
                {/* 원본 은행은 은행코드 코드도움 — 일용 사원은 은행 이름만 들고 있어 이름을 담는다(예전 글자 값도 후보에 남긴다) */}
                <CodePickerField label="은행" hideLabel fill placeholder="은행" emptyLabel="선택 해제"
                                 value={form.bankName} onChange={(v) => set({ bankName: v })}
                                 items={[...BANK_CODES.map(([code, name]) => ({ value: name, code, name })),
                                   ...(form.bankName && !BANK_CODES.some(([, n]) => n === form.bankName) ? [{ value: form.bankName, name: form.bankName }] : [])]} />
                <input className="ec-input w-full" placeholder="계좌번호" value={form.accountNo} onChange={(e) => set({ accountNo: e.target.value })} />
                <input className="ec-input w-full" placeholder="예금주" value={form.accountHolder} onChange={(e) => set({ accountHolder: e.target.value })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">적요</span>
              <div className="form"><textarea className="ec-input w-full h-[48px]" placeholder="적요" value={form.remark} onChange={(e) => set({ remark: e.target.value })} /></div>
            </li>
          </ul>
        ) : (
          <>
            <ul className="ec-form mb-[8px]">
              <li className="wide"><span className="title">사원번호</span><div className="form">{form.code}</div></li>
              {text('성명', 'name', true)}
            </ul>
            <p className="font-bold mb-[4px]">&gt; 일급수당</p>
            <table className="w-full mb-[8px]">
              <thead><tr><th>수당항목명</th><th className="w-[260px]">내역</th></tr></thead>
              <tbody><tr><td>일근무</td><td>{money('dailyWage')}</td></tr></tbody>
            </table>
            <p className="font-bold mb-[4px]">&gt; 월정공제</p>
            <table className="w-full">
              <thead><tr><th>공제항목명</th><th className="w-[260px]">금액</th></tr></thead>
              <tbody>
                <tr><td>소득세</td><td>{money('fixedIncomeTax')}</td></tr>
                <tr><td>지방소득세</td><td>{money('fixedLocalTax')}</td></tr>
              </tbody>
            </table>
          </>
        )}
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => { const w = rows.find((x) => x.id === editId); if (w) openEdit(w); else setForm({ ...blankForm(), code: form.code }) }}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}

/*
 * [변경] 항목 — 원본 일용근로 [항목검색](2026-10-04 실측: 성명 · 부서코드 · 프로젝트 · 전화 · 모바일 · 여권번호 · Email · 입사일자 · 퇴사일자 ·
 * 우편번호 · 주소 · 적요 · 수당항목 일근무 · 공제항목 소득세 · 지방소득세 · 추가정보 · 주민등록번호 · 외국인 · 고용보험 · 국민연금 · 건강보험) 중
 * 일용 사원에 담을 칸이 있는 것만. 수정 API 가 통째로 바꾸므로 고르지 않은 칸은 지금 값을 그대로 다시 보낸다.
 */
const bulkFields = (departments: Department[]): BulkField[] => [
  { key: 'name', label: '성명', kind: 'text' },
  { key: 'departmentId', label: '부서코드', kind: 'select', options: departments.map((d) => [String(d.id), d.name]) },
  { key: 'mobile', label: '모바일', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text' },
  { key: 'hireDate', label: '입사일자', kind: 'date' },
  { key: 'resignDate', label: '퇴사일자', kind: 'date' },
  { key: 'zipcode', label: '우편번호', kind: 'text' },
  { key: 'address', label: '주소', kind: 'text' },
  { key: 'remark', label: '적요', kind: 'text' },
  { key: 'dailyWage', label: '일근무', kind: 'number' },
  { key: 'fixedIncomeTax', label: '소득세', kind: 'number' },
  { key: 'fixedLocalTax', label: '지방소득세', kind: 'number' },
  { key: 'foreigner', label: '외국인', kind: 'select', options: [['true', 'Yes'], ['false', 'No']] },
  { key: 'employmentInsurance', label: '고용보험', kind: 'select', options: [['true', 'Yes'], ['false', 'No']] },
]
const bulkInitial = (w: DailyWorker): BulkDraft =>
  Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v == null ? '' : String(v)]))
async function bulkSave(w: DailyWorker, d: BulkDraft) {
  if (!d.name.trim()) throw new Error('성명을 입력 바랍니다.')
  await api.put(`/hr/daily-workers/${w.id}`, {
    ...w,
    name: d.name.trim(), departmentId: d.departmentId ? Number(d.departmentId) : null,
    mobile: d.mobile.trim() || null, email: d.email.trim() || null,
    hireDate: d.hireDate || null, resignDate: d.resignDate || null,
    zipcode: d.zipcode.trim() || null, address: d.address.trim() || null, remark: d.remark.trim() || null,
    dailyWage: num(d.dailyWage), fixedIncomeTax: num(d.fixedIncomeTax), fixedLocalTax: num(d.fixedLocalTax),
    foreigner: d.foreigner === 'true', employmentInsurance: d.employmentInsurance === 'true',
  })
}
