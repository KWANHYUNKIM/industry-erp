import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import Modal from '../../components/Modal'
import EcDateField from '../../components/EcDateField'
import { ecAlert, ecConfirm, NO_SELECTION_MESSAGE } from '../../components/EcDialog'
import { EcDateRange } from '../../components/ui/EcDateInput'

interface Emp { id: number; code: string; name: string; department: string | null; hireDate: string | null; resignDate: string | null; resignReason?: string | null }
interface Company { name: string | null; bizRegNo: string | null }
/** [퇴직처리] 창 — 원본 신규(F2) · 줄 누르기(2026-10-13 loginaa 실측) */
interface RetireForm { employeeId: string; hireDate: string; resignDate: string; resignReason: string }
/** [퇴직금계산] 한 건에서 이 화면이 쓰는 것 */
interface RetirePay { employeeId: number; retireDate: string | null; withholdingMonth: string | null; payDate: string | null }

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
 * 중도정산귀속월은 원본에서 모든 줄이 퇴사월이라 퇴사일자의 달을 찍는다. 중도정산원천징수연월은 중도정산등록/수정(E030114)의 원천징수연월(없으면 빈칸).
 * 퇴직소득 세 칸은 그 사원의 [퇴직금계산] 에서 읽는다 — 귀속월 = 퇴직금계산의 퇴사일 달(사원 퇴사일과 다를 수 있다:
 * 원본 홍길동 퇴사 2024/10/01 · 귀속 2024/12 · 원천징수 2024/10 · 지급 2024/10/16), 원천징수연월 · 지급일자는 그대로(2026-10-12 실측).
 * 한 사원에 여럿이면 지급일이 가장 늦은 것.
 * 세무신고사업장은 우리 회사가 사업장을 하나만 둔다.
 *
 * <p>줄 차례는 <b>퇴사일자 늦은 것 먼저</b>, 같으면 사번 글자 차례(2026-10-13: 2026/09/30 퇴사한 00007 이 2024/10/01 퇴사 20명 위 1번).
 * 조건은 [Search(F3)] 로 펼친다(원본도 처음엔 목록만 보인다).
 *
 * <p>[신규(F2)] · 사번/성명 누르기 → <b>퇴직처리</b> 창: 사원(재직자만 · 수정 땐 막힘) · 주민등록번호 · 원천세신고 사업자등록번호 ·
 * 입사일자 · 퇴사일자 · 퇴사사유 · 적요, [저장(F8)] [다시 작성] [삭제(수정 때)] [닫기]. 빈 사원 · 입사 · 퇴사일자는 빨간 칸.
 * 저장하면 그 사원의 입사 · 퇴사일자 · 퇴사사유가 바뀌고(사원등록과 같은 값) 퇴사자리스트에 오른다.
 * [삭제] · [선택삭제]는 확인 창 '중도정산한 내역이 삭제 됩니다. 삭제된 내역은 원상복구가 불가능합니다. 삭제하겠습니까?' 뒤
 * 퇴사를 거둔다 — 그 사원은 목록에서 빠지고 재직으로 돌아온다(사원 고르기 창에 다시 보인다).
 * 주민등록번호는 우리 사원에 담지 않아 비워 둔다. 적요는 담을 데가 없다(남은 것).
 */
export default function RetiredEmployeePage() {
  const [rows, setRows] = useState<Emp[]>([])
  const [pays, setPays] = useState<Map<number, RetirePay>>(new Map())
  /** 사원 → 중도정산 원천징수연월(YYYY-MM) — 중도정산등록/수정(E030114)의 원천징수연월 창에서 정한 달 */
  const [midMonths, setMidMonths] = useState<Map<number, string>>(new Map())
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
  const [quick, setQuick] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [company, setCompany] = useState<Company | null>(null)
  const [form, setForm] = useState<RetireForm | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [formError, setFormError] = useState('')
  const [tried, setTried] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, p] = await Promise.all([
        api.get<Emp[]>('/employees/all'),
        api.get<RetirePay[]>('/retirement-pays', { params: { from: '1900-01-01', to: '2999-12-31' } }),
      ])
      setRows(r.data)
      const m = new Map<number, RetirePay>()
      for (const x of p.data) {
        const prev = m.get(x.employeeId)
        if (!prev || (x.payDate ?? '') > (prev.payDate ?? '')) m.set(x.employeeId, x)
      }
      setPays(m)
      // 중도정산은 귀속연도 = 퇴사한 해. 퇴사한 해마다 한 번씩 읽는다.
      const years = [...new Set(r.data.filter((e) => e.resignDate).map((e) => Number(e.resignDate!.slice(0, 4))))]
      const mids = await Promise.all(years.map((y) =>
        api.get<{ employeeId: number; withholdingMonth: string | null }[]>('/tax-settlements', { params: { year: y, kind: 'MID_TERM' } })
          .then((x) => x.data).catch(() => [])))
      const mm = new Map<number, string>()
      for (const x of mids.flat()) if (x.withholdingMonth) mm.set(x.employeeId, x.withholdingMonth)
      setMidMonths(mm)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { api.get<Company | null>('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null)) }, [])

  const blank = (): RetireForm => ({ employeeId: '', hireDate: '', resignDate: '', resignReason: '' })
  function openNew() { setEditId(null); setForm(blank()); setFormError(''); setTried(false) }
  function openEdit(r: Emp) {
    setEditId(r.id)
    setForm({ employeeId: String(r.id), hireDate: r.hireDate ?? '', resignDate: r.resignDate ?? '', resignReason: r.resignReason ?? '' })
    setFormError(''); setTried(false)
  }
  function pickEmployee(id: string) {
    const e = rows.find((x) => String(x.id) === id)
    setForm((f) => f && { ...f, employeeId: id, hireDate: e?.hireDate ?? '' })
  }
  async function saveForm() {
    if (!form) return
    setTried(true)
    if (!form.employeeId || !form.hireDate || !form.resignDate) return
    try {
      await api.put(`/employees/${form.employeeId}/retirement`, { hireDate: form.hireDate, resignDate: form.resignDate, resignReason: form.resignReason })
      setForm(null)
      await load()
    } catch (e) { setFormError(extractErrorMessage(e)) }
  }
  const CANCEL_MSG = '중도정산한 내역이 삭제 됩니다.\n삭제된 내역은 원상복구가 불가능합니다.\n삭제하겠습니까?'
  async function cancelRetire(ids: number[]) {
    if (ids.length === 0) { void ecAlert(NO_SELECTION_MESSAGE); return }
    if (!(await ecConfirm(CANCEL_MSG))) return
    try {
      await api.post('/employees/retirement/cancel', ids)
      setForm(null); setChecked(new Set())
      await load()
    } catch (e) { void ecAlert(extractErrorMessage(e)) }
  }

  const inRange = (d: string | null, from: string, to: string) => !!d && (!from || d >= from) && (!to || d <= to)
  const shown = useMemo(() => rows
    .filter((r) => r.resignDate)
    .filter((r) => !emp || String(r.id) === emp)
    .filter((r) => !dept || (r.department ?? '') === dept)
    .filter((r) => !useHire || inRange(r.hireDate, hireFrom, hireTo))
    .filter((r) => !useResign || inRange(r.resignDate, resignFrom, resignTo))
    .filter((r) => !quick.trim() || r.code.includes(quick.trim()) || r.name.includes(quick.trim()))
    .sort((a, b) => (b.resignDate ?? '').localeCompare(a.resignDate ?? '') || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
  [rows, emp, dept, useHire, hireFrom, hireTo, useResign, resignFrom, resignTo, quick])
  const retired = rows.filter((r) => r.resignDate)
  const working = rows.filter((r) => !r.resignDate)
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))
  const bad = (v: string) => (tried && !v ? ' border border-ec-danger rounded-ec' : '')
  const depts = [...new Set(retired.map((r) => r.department).filter((v): v is string => !!v))].sort()

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '퇴사자리스트', [shown.length])

  return (
    <EcListShell
      title="퇴사자리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={load}
      collapseConditions
      onNew={openNew}
      actions={[
        { label: 'Email' },
        { label: '인쇄' },
        { label: '선택삭제', selected: checked.size, onClick: () => void cancelRetire([...checked]) },
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
          <EcDateRange from={{ className: "ec-input w-[145px]", value: hireFrom, disabled: !useHire, onChange: (e) => setHireFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: hireTo, disabled: !useHire, onChange: (e) => setHireTo(e.target.value) }} />
          <label className="ml-2 inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={useHire} onChange={(e) => setUseHire(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <EcCond label="퇴사일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: resignFrom, disabled: !useResign, onChange: (e) => setResignFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: resignTo, disabled: !useResign, onChange: (e) => setResignTo(e.target.value) }} />
          <label className="ml-2 inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={useResign} onChange={(e) => setUseResign(e.target.checked)} /> 사용
          </label>
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
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
              <td className="text-center" title={String(i + 1)}>
                <input type="checkbox" aria-label={`${r.code} 선택`} checked={checked.has(r.id)}
                       onChange={() => { const n = new Set(checked); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setChecked(n) }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.name}</a></td>
              <td>{r.department ?? ''}</td>
              <td className="text-center">{slash(r.hireDate)}</td>
              <td className="text-center">{slash(r.resignDate)}</td>
              <td className="text-center">{month(r.resignDate)}</td>
              <td className="text-center">{(midMonths.get(r.id) ?? '').replace('-', '/')}</td>
              <td className="text-center">{month(pays.get(r.id)?.retireDate ?? null)}</td>
              <td className="text-center">{(pays.get(r.id)?.withholdingMonth ?? '').replace('-', '/')}</td>
              <td className="text-center">{slash(pays.get(r.id)?.payDate ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!form} title="퇴직처리" width={720} error={formError || null} onClose={() => setForm(null)}>
        {form && (
          <>
            <ul className="ec-form">
              <li className="wide">
                <span className="title">사원</span>
                <div className={'form' + bad(form.employeeId)}>
                  {editId != null
                    ? <input className="ec-input w-full" disabled value={`${rows.find((x) => x.id === editId)?.code ?? ''}  ${rows.find((x) => x.id === editId)?.name ?? ''}`} />
                    : <CodePickerField label="사원" hideLabel fill placeholder="사원" value={form.employeeId} onChange={pickEmployee}
                                       items={working.map((r) => ({ value: String(r.id), code: r.code, name: r.name }))} />}
                </div>
              </li>
              <li className="wide">
                <span className="title">주민등록번호</span>
                <div className="form"><input className="ec-input w-full" disabled value="" /></div>
              </li>
              <li className="wide">
                <span className="title">원천세신고 사업자등록번호</span>
                <div className="form">
                  <select className="ec-input w-full"><option>{[company?.name, company?.bizRegNo].filter(Boolean).join(' ')}</option></select>
                </div>
              </li>
              <li className="wide">
                <span className="title">입사일자</span>
                <div className={'form' + bad(form.hireDate)}><EcDateField value={form.hireDate} onChange={(v) => setForm({ ...form, hireDate: v })} yearSpan={30} /></div>
              </li>
              <li className="wide">
                <span className="title">퇴사일자</span>
                <div className={'form' + bad(form.resignDate)}><EcDateField value={form.resignDate} onChange={(v) => setForm({ ...form, resignDate: v })} yearSpan={30} /></div>
              </li>
              <li className="wide">
                <span className="title">퇴사사유</span>
                <div className="form"><input className="ec-input w-full" placeholder="퇴사사유" value={form.resignReason} onChange={(e) => setForm({ ...form, resignReason: e.target.value })} /></div>
              </li>
              <li className="wide">
                <span className="title">적요</span>
                <div className="form"><input className="ec-input w-full" placeholder="적요" disabled /></div>
              </li>
            </ul>
            <div className="flex gap-[6px] mt-[12px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveForm()}>저장(F8)</button>
              <button type="button" className="ec-btn" onClick={() => { const r = rows.find((x) => x.id === editId); if (r) openEdit(r); else openNew() }}>다시 작성</button>
              {editId != null && <button type="button" className="ec-btn" onClick={() => void cancelRetire([editId])}>삭제</button>}
              <button type="button" className="ec-btn" onClick={() => setForm(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
