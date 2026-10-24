import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import Modal from '../../components/Modal'
import ExpenseSlipForm from '../../features/expense/ExpenseSlipForm'
import { groupSlips, slipNo, type ExpenseRow } from '../../features/expense/types'
import NumCheck from '../../components/NumCheck'
import { ecConfirm } from '../../components/EcDialog'
import type { EmployeeMaster } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

type Expense = ExpenseRow
/** 비용코드로 넣은 전표는 비용명 · 비용그룹명 · 사원(2026-10-20 비용내역입력 E060812), 옛 지출은 계정 · 계정 세부분류 · 작성자. */
const itemName = (r: Expense) => r.expenseItemName ?? r.accountName
const groupName = (r: Expense) => (r.expenseItemId ? r.expenseGroupName : r.accountGroupName) ?? ''

/**
 * 회계 II &gt; 비용관리 &gt; 비용내역 &gt; <b>비용내역조회</b>(E060813) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>금월(~오늘)</b>) · 사용일자 · 사용 · 비용그룹 · 비용 · 사원 · 거래처 · 부서 · 프로젝트 · 비고 ·
 * 회계반영여부(전체 · 미청구 · 미확인(회계) · 확인(회계), 다 켜짐) · 결제구분(전체 · 개인비용 · 회사비용) · 적요.
 * 열: 전표번호 · 비용그룹명 · 비용명 · 사용자 · 사용금액 · 회계반영여부 · 인쇄. 버튼 신규(F2) · 인쇄 · 선택삭제.
 *
 * <p>비용내역현황과 같은 비용 전표를 목록으로 본다. 우리 비용은 <b>저장하는 순간 분개를 만든다</b>(ExpenseService →
 * JournalService.createFromExpense) — 그래서 회계반영여부는 늘 '확인(회계)' 이고, 미청구 · 미확인(회계)는 걸릴 전표가 없다.
 * 비용그룹명은 계정의 세부분류(현황과 같다), 사용자는 작성자다. [사용일자]는 옆 [사용] 체크로 켜는 두 번째 기간이다
 * (받을어음조회의 [만기일자] · [사용]과 같은 모양 — 2026-10-03 에 그 화면을 재며 알았다).
 * 2026-10-12: 비용 전표에 원본 비용내역입력(E060812)의 [사용일자] · [비고] · [결제구분](개인비용 · 회사비용)이 생겨(V326)
 * [사용일자] 기간 · [비고] · [결제구분] 조건이 제 값을 거른다(사용일자가 빈 예전 전표는 기준일자).
 */
export default function ExpenseListPage() {
  const navigate = useNavigate()
  const pickers = useCondPickers(['partners', 'projects'])
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  /* 원본 [사용일자] 옆 [사용] 체크로 켜는 두 번째 기간 — 전표의 사용일자(V326)를 거른다. */
  const [useUse, setUseUse] = useState(false)
  const [useFrom, setUseFrom] = useState(init.from)
  const [useTo, setUseTo] = useState(init.to)
  const [group, setGroup] = useState('')
  const [account, setAccount] = useState('')
  const [user, setUser] = useState('')
  const [partner, setPartner] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [reflected, setReflected] = useState({ 미청구: true, '미확인(회계)': true, '확인(회계)': true })
  const [remark, setRemark] = useState('')
  const [note, setNote] = useState('')
  const [payType, setPayType] = useState<'' | 'PERSONAL' | 'COMPANY'>('')
  const [rows, setRows] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Expense[] | null>(null)
  /* 원본(2026-10-21): 회계반영된 전표의 [회계반영여부] ✓ → '회계전표번호보기' 창(No. · 회계전표 · 청구서 · 전자(세금)계산서). */
  const [jview, setJview] = useState<{ nos: string[]; journal: string; id: number } | null>(null)
  async function openJournalNo(g: Expense[]) {
    const id = g.find((x) => x.settledJournalId != null)?.settledJournalId
    if (id == null) return
    try {
      const j = (await api.get<{ docNo: string; entryDate: string }>(`/journals/${id}`)).data
      const seq = Number(j.docNo.split('-').pop())
      setJview({ nos: g.map((x) => `${slipNo(x)}-${x.lineNo ?? 1}`), journal: `${j.entryDate.replace(/-/g, '/')} - ${Number.isFinite(seq) ? seq : j.docNo}`, id })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  useEffect(() => { api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => undefined) }, [])
  const userName = (r: Expense) => (r.employeeId ? employees.find((e) => e.id === r.employeeId)?.name ?? '' : r.createdBy ?? '')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<Expense[]>('/expenses')
      setRows(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const shown = useMemo(() => rows
    .filter((r) => r.expenseDate >= from && r.expenseDate <= to)
    .filter((r) => !useUse || (r.useDate >= useFrom && r.useDate <= useTo))
    .filter((r) => !group || groupName(r) === group)
    .filter((r) => !account || itemName(r) === account)
    .filter((r) => !user || userName(r) === user)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !dept || (r.department ?? '').includes(dept))
    .filter((r) => !project || String(r.projectId) === project)
    .filter(() => reflected['확인(회계)'])
    .filter((r) => !remark || (r.content ?? '').includes(remark))
    .filter((r) => !note || (r.remarks ?? '').includes(note))
    .filter((r) => !payType || r.payType === payType)
    .sort((a, b) => (a.expenseDate > b.expenseDate ? -1 : a.expenseDate < b.expenseDate ? 1 : b.docNo.localeCompare(a.docNo))),
  [rows, employees, from, to, useUse, useFrom, useTo, group, account, user, partner, dept, project, reflected, remark, note, payType])
  /* 원본(2026-10-20): 두 줄 전표 = 한 줄 '2026/10/20 -2 · 교통비(국내-자차) 외 1건 · 고준희 외 1건 · 35,000'. */
  const slips = useMemo(() => groupSlips(shown), [shown])
  const more = (name: string, g: Expense[]) => (g.length > 1 && name ? `${name} 외 ${g.length - 1}건` : name)
  const pickedSlips = slips.filter((g) => checked.has(g[0].id))
  async function removeChecked() {
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    try {
      for (const g of pickedSlips) await api.delete(`/expenses/${g[0].id}`)
      setChecked(new Set())
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const groups = useMemo(() => [...new Set(rows.map(groupName).filter(Boolean))].sort(), [rows])
  const accounts = useMemo(() => [...new Set(rows.map(itemName))].sort(), [rows])
  const users = useMemo(() => [...new Set(rows.map(userName).filter(Boolean))].sort(), [rows, employees])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '비용내역조회', [slips.length])

  const allOn = Object.values(reflected).every(Boolean)
  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="비용내역조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setGroup(''); setAccount(''); setUser(''); setPartner(''); setDept(''); setProject(''); setReflected({ 미청구: true, '미확인(회계)': true, '확인(회계)': true }); setRemark(''); setNote(''); setPayType(''); setUseUse(false) } },
        { label: '신규(F2)', onClick: () => navigate('/accounting/expense') },
        { label: '인쇄', onClick: () => window.print() },
        { label: '선택삭제', onClick: () => void removeChecked(), selected: pickedSlips.length },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="사용일자">
          <input type="date" className="ec-input" value={useFrom} disabled={!useUse} onChange={(e) => setUseFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={useTo} disabled={!useUse} onChange={(e) => setUseTo(e.target.value)} style={{ width: 145 }} />
          <label className="inline-flex items-center gap-[3px] ml-[8px] text-[12.5px]">
            <input type="checkbox" checked={useUse} onChange={(e) => setUseUse(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <EcCond label="비용그룹" pick>
          <CodePickerField label="비용그룹" hideLabel width={180} emptyLabel="전체" value={group} onChange={setGroup} items={groups.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="비용" pick>
          <CodePickerField label="비용" hideLabel width={180} emptyLabel="전체" value={account} onChange={setAccount} items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="사원" pick>
          <CodePickerField label="사원" hideLabel width={170} emptyLabel="전체" value={user} onChange={setUser} items={users.map((u) => ({ value: u, name: u }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="부서">
          <input className="ec-input" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="비고">
          <input className="ec-input w-[220px]" aria-label="비고" value={note} onChange={(e) => setNote(e.target.value)} />
        </EcCond>
        <EcCond label="회계반영여부">
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="checkbox" checked={allOn} onChange={(e) => setReflected({ 미청구: e.target.checked, '미확인(회계)': e.target.checked, '확인(회계)': e.target.checked })} /> 전체
          </label>
          {(['미청구', '미확인(회계)', '확인(회계)'] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="checkbox" checked={reflected[k]} onChange={(e) => setReflected((r) => ({ ...r, [k]: e.target.checked }))} /> {k}
            </label>
          ))}
        </EcCond>
        <EcCond label="결제구분">
          {([['', '전체'], ['PERSONAL', '개인비용'], ['COMPANY', '회사비용']] as const).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="expense-list-pay-type" checked={payType === v} onChange={() => setPayType(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck no="" head label="전체선택" on={slips.length > 0 && pickedSlips.length === slips.length}
                        onChange={(v) => setChecked(v ? new Set(slips.map((g) => g[0].id)) : new Set())} />
            </th>
            <th className="text-center">전표번호</th>
            <th>비용그룹명</th>
            <th>비용명</th>
            <th>사용자</th>
            <th className="text-right">사용금액</th>
            <th className="text-center">회계반영여부</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : slips.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : slips.map((g, i) => { const r = g[0]; return (
            <tr key={r.id}>
              <td className="text-center">
                <NumCheck no={i + 1} label={`${slipNo(r)} 선택`} on={checked.has(r.id)}
                          onChange={(v) => setChecked((c) => { const s = new Set(c); if (v) s.add(r.id); else s.delete(r.id); return s })} />
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => setEditing(g)}>{slipNo(r)}</button></td>
              <td>{groupName(r)}</td>
              <td>{more(itemName(r), g)}</td>
              <td>{more(userName(r), g)}</td>
              <td className="text-right">{won(g.reduce((s, x) => s + Number(x.amount), 0))}</td>
              {/* 원본(2026-10-21 다시 잼): 가지급금정산서로 반영하면 주황 ✓ 링크(fa-check text-warning). 옛 지출은 저장 즉시 분개라 확인(회계). */}
              <td className="text-center">{!r.expenseItemId ? '확인(회계)' : g.some((x) => x.settledJournalId != null)
                ? <button type="button" className="ec-link text-ec-warn" aria-label={`${slipNo(r)} 회계전표번호보기`} onClick={() => void openJournalNo(g)}>✓</button> : ''}</td>
              <td className="text-center">인쇄</td>
            </tr>
          ) })}
        </tbody>
      </table>
      <Modal error={error} open={!!jview} title="회계전표번호보기" width={800} onClose={() => setJview(null)}>{jview && (
        <div>
          <table className="w-full">
            <thead><tr><th>No.</th><th>회계전표</th><th>청구서</th><th>전자(세금)계산서</th></tr></thead>
            <tbody>
              {jview.nos.map((no) => (
                <tr key={no}><td>{no}</td><td><button type="button" className="ec-link" onClick={() => navigate(`/accounting/vouchers?journal=${jview.id}`)}>{jview.journal}</button></td><td></td><td></td></tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[10px]"><button type="button" className="ec-btn" onClick={() => setJview(null)}>닫기</button></div>
        </div>
      )}</Modal>
      <Modal error={error} open={!!editing} title="비용내역수정" width={1200} onClose={() => setEditing(null)}>{(
        <ExpenseSlipForm edit={editing} onSaved={() => { void load() }} onClose={() => setEditing(null)} />
      )}</Modal>
    </EcListShell>
  )
}
