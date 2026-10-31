import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { periodOf, ymd } from '../../components/EcPeriodPicks'
import { ecAlert, ecConfirm, NO_SELECTION_MESSAGE } from '../../components/EcDialog'
import NumCheck from '../../components/NumCheck'
import { groupSlips, slipNo, type ExpenseRow } from '../../features/expense/types'
import { useCondPickers } from '../../utils/useCondPickers'
import type { EmployeeMaster } from '../../types/api'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmount } from '../../utils/format'


/**
 * 회계 II › 비용관리 › 비용내역 › <b>전표별회계반영(비용)</b>(E060814) — 2026-10-20 loginaa 실측(plans/회계2/비용관리.md 4장).
 *
 * <p>조건(펼친 채 시작): 기준일자(금월(~오늘)) · 비용그룹 · 비용 · 사원 · 거래처 · 부서 · 프로젝트 · 결제구분(◉전체 ○개인비용 ○회사비용).
 * 결과: 회계 반영이 안 된 비용내역만 — 전표번호 · 결제구분 · 비용그룹 · 비용명 · 사용자 · 사용금액 · 회계No., 합계줄.
 * [가지급금정산서작성]: 회사비용 줄이 있으면 '결제구분이 개인비용인 전표를 선택 바랍니다.', 개인비용이면 '가지급금정산서' 창
 * (일자 · 첨언내용 · 정산자 · 계정코드(차변) · 금액 · 적요명) → [저장] → 회계 I 가지급금정산서 전표(차 비용 계정 / 대 가지급금).
 * 전표를 둘 이상 고르면(2026-10-21 실측) 창 없이 '전표 일괄 생성을 진행하겠습니까?' → 전표 한 장마다 정산서 한 장.
 * 그 정산서를 회계 I 에서 지우면 비용 전표가 이 목록에 다시 나온다(정산취소 — settled_journal_id ON DELETE SET NULL).
 */
export default function ExpenseSettlePage() {
  const navigate = useNavigate()
  const pickers = useCondPickers(['partners', 'projects'])
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [group, setGroup] = useState('')
  const [item, setItem] = useState('')
  const [emp, setEmp] = useState('')
  const [partner, setPartner] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [payType, setPayType] = useState<'' | 'PERSONAL' | 'COMPANY'>('')
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [vDate, setVDate] = useState(ymd(new Date()))
  const [memo, setMemo] = useState('')
  const [formError, setFormError] = useState('')

  async function load() {
    setError('')
    try {
      const r = await api.get<ExpenseRow[]>('/expenses')
      setRows(r.data.filter((x) => x.expenseItemId != null && x.settledJournalId == null))
      setChecked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  useEffect(() => {
    void load()
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => undefined)
  }, [])

  const empName = (id: number | null) => employees.find((e) => e.id === id)?.name ?? ''
  const shown = useMemo(() => rows
    .filter((r) => r.expenseDate >= from && r.expenseDate <= to)
    .filter((r) => !group || String(r.expenseGroupId) === group)
    .filter((r) => !item || String(r.expenseItemId) === item)
    .filter((r) => !emp || String(r.employeeId) === emp)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !dept || (r.department ?? '').includes(dept))
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !payType || r.payType === payType)
    /* 원본(2026-10-21): 최근 전표가 위('-2 김기현' · '-1 고준희'), 일괄 생성도 이 차례(-2 → 26/10/21-7, -1 → -8). */
    .sort((a, b) => (a.expenseDate === b.expenseDate ? b.docNo.localeCompare(a.docNo) : a.expenseDate < b.expenseDate ? 1 : -1)),
  [rows, from, to, group, item, emp, partner, dept, project, payType])
  const total = shown.reduce((s, r) => s + Number(r.amount), 0)
  /* 원본(2026-10-20): 두 줄 전표도 한 줄 '2026/10/20 -2 · 개인비용 · 교통비(국내-자차) · 고준희 · 35,000' — 비용명 · 사용자는 첫 줄 것. */
  const slips = useMemo(() => groupSlips(shown), [shown])
  const pickedSlips = slips.filter((g) => checked.has(g[0].id))
  const picked = pickedSlips.flat()
  const uniq = (xs: [string, string, string][]) => [...new Map(xs.map((x) => [x[0], x])).values()].map(([value, code, name]) => ({ value, code, name }))

  async function openSettle() {
    if (picked.length === 0) { await ecAlert(NO_SELECTION_MESSAGE); return }
    if (picked.some((r) => r.payType !== 'PERSONAL')) { await ecAlert('결제구분이 개인비용인 전표를 선택 바랍니다.'); return }
    /* 원본(2026-10-21): 전표를 둘 이상 고르면 창 없이 확인만 묻고 전표 한 장마다 가지급금정산서 한 장(사원별로 따로). */
    if (pickedSlips.length > 1) {
      if (!(await ecConfirm('전표 일괄 생성을 진행하겠습니까?'))) return
      try {
        await api.post('/expenses/settle-batch', {
          slips: pickedSlips.map((g) => ({
            voucherDate: ymd(new Date()),
            lines: g.map((r) => ({ expenseId: r.id, employeeName: empName(r.employeeId) })),
          })),
        })
        await load()
      } catch (e) {
        await ecAlert(extractErrorMessage(e))
      }
      return
    }
    setVDate(ymd(new Date())); setMemo(''); setFormError(''); setOpen(true)
  }

  async function save() {
    setFormError('')
    try {
      await api.post('/expenses/settle', {
        voucherDate: vDate, description: memo || undefined,
        lines: picked.map((r) => ({ expenseId: r.id, employeeName: empName(r.employeeId) })),
      })
      setOpen(false)
      await load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  const reset = () => { setFrom(init.from); setTo(init.to); setGroup(''); setItem(''); setEmp(''); setPartner(''); setDept(''); setProject(''); setPayType('') }
  return (
    <EcListShell
      title="전표별회계반영(비용)"
      onSearch={load}
      onReset={reset}
      searchable={false}
      actions={[{ label: '가지급금정산서작성', onClick: () => void openSettle(), selected: picked.length }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "기준일자 시작", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "기준일자 끝", value: to, onChange: (e) => setTo(e.target.value) }} />
        </EcCond>
        <EcCond label="비용그룹" pick>
          <CodePickerField label="비용그룹" hideLabel width={180} emptyLabel="전체" value={group} onChange={setGroup}
                           items={uniq(rows.filter((r) => r.expenseGroupId).map((r) => [String(r.expenseGroupId), r.expenseGroupCode ?? '', r.expenseGroupName ?? '']))} />
        </EcCond>
        <EcCond label="비용" pick>
          <CodePickerField label="비용" hideLabel width={180} emptyLabel="전체" value={item} onChange={setItem}
                           items={uniq(rows.map((r) => [String(r.expenseItemId), r.expenseItemCode ?? '', r.expenseItemName ?? '']))} />
        </EcCond>
        <EcCond label="사원" pick>
          <CodePickerField label="사원" hideLabel width={170} emptyLabel="전체" value={emp} onChange={setEmp}
                           items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="부서">
          <input className="ec-input w-[160px]" aria-label="부서" value={dept} onChange={(e) => setDept(e.target.value)} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="결제구분">
          {([['', '전체'], ['PERSONAL', '개인비용'], ['COMPANY', '회사비용']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="expense-settle-pay-type" checked={payType === v} onChange={() => setPayType(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>

      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck no="" head label="전체선택" on={slips.length > 0 && slips.every((g) => checked.has(g[0].id))}
                        onChange={(v) => setChecked(v ? new Set(slips.map((g) => g[0].id)) : new Set())} />
            </th>
            <th>전표번호</th>
            <th>결제구분</th>
            <th>비용그룹</th>
            <th>비용명</th>
            <th>사용자</th>
            <th className="text-right">사용금액</th>
            <th>회계No.</th>
          </tr>
        </thead>
        <tbody>
          {slips.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : slips.map((g, n) => { const r = g[0]; return (
            <tr key={r.id}>
              <td className="text-center">
                <NumCheck no={n + 1} label={`${slipNo(r)} 선택`} on={checked.has(r.id)}
                          onChange={(v) => setChecked((c) => { const s = new Set(c); if (v) s.add(r.id); else s.delete(r.id); return s })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => navigate('/accounting/expense-list')}>{slipNo(r)}</button></td>
              <td>{r.payTypeName ?? ''}</td>
              <td>{r.expenseGroupName ?? ''}</td>
              <td>{r.expenseItemName ?? ''}</td>
              <td>{empName(r.employeeId)}</td>
              <td className="text-right">{fmtAmount(g.reduce((s, x) => s + Number(x.amount), 0))}</td>
              <td></td>
            </tr>
          ) })}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={6} className="text-center">합계</td>
              <td className="text-right">{fmtAmount(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>

      <Modal error={formError} open={open} title="가지급금정산서" width={1100} onClose={() => setOpen(false)}>{(
        <div>
          <ul className="ec-form mb-[8px]">
            <li>
              <span className="title">일자</span>
              <div className="form"><EcDateInput className="ec-input w-[145px]" aria-label="일자" value={vDate} onChange={(e) => setVDate(e.target.value)} /></div>
            </li>
            <li>
              <span className="title">첨언내용</span>
              <div className="form"><input className="ec-input w-full" aria-label="첨언내용" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
            </li>
          </ul>
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-[40px]"></th>
                <th>정산자 검색</th>
                <th>정산대상자명</th>
                <th>계정코드(차변)</th>
                <th>계정코드명</th>
                <th>거래처</th>
                <th>거래처명</th>
                <th className="text-right">금액</th>
                <th>적요명</th>
              </tr>
            </thead>
            <tbody>
              {picked.map((r, n) => (
                <tr key={r.id}>
                  <td className="text-center">{n + 1}</td>
                  <td>{employees.find((e) => e.id === r.employeeId)?.code ?? ''}</td>
                  <td>{empName(r.employeeId)}</td>
                  <td>{r.accountCode ?? ''}</td>
                  <td>{r.accountName}</td>
                  <td></td>
                  <td></td>
                  <td className="text-right">{fmtAmount(Number(r.amount))}</td>
                  <td>{r.content ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[6px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => { setVDate(ymd(new Date())); setMemo('') }}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>
    </EcListShell>
  )
}
