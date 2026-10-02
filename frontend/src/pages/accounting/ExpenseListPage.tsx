import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

interface Expense {
  id: number; docNo: string; expenseDate: string; accountName: string; accountGroupName: string | null
  content: string | null; partnerId: number | null; partnerName: string | null; amount: number
  department: string | null; projectId: number | null; projectName: string | null; createdBy: string | null
}

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
 */
export default function ExpenseListPage() {
  const navigate = useNavigate()
  const pickers = useCondPickers(['partners', 'projects'])
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  /* 원본 [사용일자] 옆 [사용] 체크로 켜는 두 번째 기간. 우리 비용은 날짜가 하나뿐이라 같은 값을 한 번 더 거른다. */
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
  const [rows, setRows] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    .filter((r) => !useUse || (r.expenseDate >= useFrom && r.expenseDate <= useTo))
    .filter((r) => !group || (r.accountGroupName ?? '') === group)
    .filter((r) => !account || r.accountName === account)
    .filter((r) => !user || (r.createdBy ?? '') === user)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !dept || (r.department ?? '').includes(dept))
    .filter((r) => !project || String(r.projectId) === project)
    .filter(() => reflected['확인(회계)'])
    .filter((r) => !remark || (r.content ?? '').includes(remark))
    .sort((a, b) => (a.expenseDate > b.expenseDate ? -1 : a.expenseDate < b.expenseDate ? 1 : b.docNo.localeCompare(a.docNo))),
  [rows, from, to, useUse, useFrom, useTo, group, account, user, partner, dept, project, reflected, remark])
  const groups = useMemo(() => [...new Set(rows.map((r) => r.accountGroupName).filter(Boolean) as string[])].sort(), [rows])
  const accounts = useMemo(() => [...new Set(rows.map((r) => r.accountName))].sort(), [rows])
  const users = useMemo(() => [...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort(), [rows])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '비용내역조회', [shown.length])

  const allOn = Object.values(reflected).every(Boolean)
  return (
    <EcListShell
      title="비용내역조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setGroup(''); setAccount(''); setUser(''); setPartner(''); setDept(''); setProject(''); setReflected({ 미청구: true, '미확인(회계)': true, '확인(회계)': true }); setRemark('') } },
        { label: '신규(F2)', onClick: () => navigate('/accounting/expense') },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="사용일자">
          <input type="date" className="ec-input" value={useFrom} disabled={!useUse} onChange={(e) => setUseFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={useTo} disabled={!useUse} onChange={(e) => setUseTo(e.target.value)} style={{ width: 145 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8, fontSize: 12.5 }}>
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
        <EcCond label="회계반영여부">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
            <input type="checkbox" checked={allOn} onChange={(e) => setReflected({ 미청구: e.target.checked, '미확인(회계)': e.target.checked, '확인(회계)': e.target.checked })} /> 전체
          </label>
          {(['미청구', '미확인(회계)', '확인(회계)'] as const).map((k) => (
            <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="checkbox" checked={reflected[k]} onChange={(e) => setReflected((r) => ({ ...r, [k]: e.target.checked }))} /> {k}
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
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center' }}>전표번호</th>
            <th>비용그룹명</th>
            <th>비용명</th>
            <th>사용자</th>
            <th style={{ textAlign: 'right' }}>사용금액</th>
            <th style={{ textAlign: 'center' }}>회계반영여부</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: 'var(--ec-text-hint)' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(r.expenseDate)} {r.docNo}</td>
              <td>{r.accountGroupName ?? ''}</td>
              <td>{r.accountName}</td>
              <td>{r.createdBy ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{won(Number(r.amount))}</td>
              <td style={{ textAlign: 'center' }}>확인(회계)</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
