import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { ecConfirm } from '../../components/EcDialog'
import { useBondMasters } from '../../features/bond/api'
import NumCheck from '../../components/NumCheck'
import { deleteBudgetAccounts, fetchBudgetReport } from '../../features/budget/api'
import BudgetInputModal from '../../features/budget/components/BudgetInputModal'
import { won, type BudgetReportPlan } from '../../features/budget/types'

/**
 * 회계 II › 예산관리 › <b>월별예산조회</b>(E020201) — 2026-10-14 loginaa 실측(plans/회계2/E020201.md).
 *
 * <p>예산 한 건 = 기준년도 × 계정 × 부서 × 프로젝트 × 1~12월. 목록은 계정마다 한 줄(그 해 모든 부서 · 프로젝트 합).
 * 열: (번호 체크) · 계정코드 · 계정명(둘 다 링크 → 예산입력 창) · 총 예산액 · 예산관리방법(월) · 실적표기방법(잔액), 끝 줄 '계'.
 * 조건(Search(F3), 처음 접힘): 기준일자(해) · 계정 · 부서 · 프로젝트 · [금년] [전년]. 격자 오른쪽 위에 기준년도.
 * 하단 [선택삭제](고른 계정의 그 해 예산 통째) · [Excel] · [예산계정설정].
 *
 * <p>원본 [예산계정설정] 은 이 계정으로 '(예산관리) 업무 권한이 없습니다.' 라 못 봤다 — 원본은 설정한 계정만 목록에 나온다.
 * 우리는 예산이 한 줄이라도 있는 계정이 나오고, [예산계정설정] 에서 계정을 골라 예산입력 창을 연다(통제 여부 · 관리방법은 없음).
 */
export default function BudgetPage() {
  const title = '월별예산조회'
  const masters = useBondMasters()
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [account, setAccount] = useState('')
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [quick, setQuick] = useState('')
  const [plans, setPlans] = useState<BudgetReportPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [input, setInput] = useState<number | null>(null)
  const [pickAccount, setPickAccount] = useState(false)
  const [newAccount, setNewAccount] = useState('')

  async function load(y = year) {
    setLoading(true)
    setError('')
    try {
      setPlans((await fetchBudgetReport(y, y)).plans)
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const rows = useMemo(() => {
    const map = new Map<number, { accountId: number; code: string; name: string; total: number }>()
    for (const p of plans) {
      if (account && String(p.accountId) !== account) continue
      if (dept && String(p.departmentId ?? '') !== dept) continue
      if (project && String(p.projectId ?? '') !== project) continue
      const cur = map.get(p.accountId) ?? { accountId: p.accountId, code: p.accountCode, name: p.accountName, total: 0 }
      cur.total += p.months.reduce((s, v) => s + Number(v), 0)
      map.set(p.accountId, cur)
    }
    return [...map.values()].filter((r) => !quick || r.code.includes(quick) || r.name.includes(quick))
  }, [plans, account, dept, project, quick])
  const sum = rows.reduce((s, r) => s + r.total, 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [rows.length])

  async function removePicked() {
    if (!(await ecConfirm('선택한 계정의 예산을 삭제하겠습니까?'))) return
    try {
      await deleteBudgetAccounts(year, [...picked])
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const years = Array.from({ length: 11 }, (_, i) => thisYear - 8 + i)
  const reset = () => { setYear(thisYear); setAccount(''); setDept(''); setProject('') }

  return (
    <EcListShell
      title={title}
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => void load()}
      onReset={reset}
      actions={[
        { label: '선택삭제', selected: picked.size, onClick: () => void removePicked() },
        { label: 'Excel' },
        { label: '예산계정설정', onClick: () => { setNewAccount(''); setPickAccount(true) } },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <select className="ec-input w-[90px]" aria-label="기준년도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="ml-[6px]">
            <button type="button" className="ec-btn-pick" onClick={() => setYear(thisYear)}>금년</button>
            <button type="button" className="ec-btn-pick" onClick={() => setYear(thisYear - 1)}>전년</button>
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} value={account} onChange={setAccount} items={masters.accounts} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} value={dept} onChange={setDept} items={masters.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} value={project} onChange={setProject} items={masters.projects} />
        </EcCond>
      </ul>

      <div className="flex items-center justify-between mb-[4px]">
        <div className="ec-pills"><button type="button" className="ec-pill active">전체</button></div>
        <span className="text-[12px]">{year}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[40px]">
              <NumCheck no="" head label="전체선택" on={rows.length > 0 && rows.every((r) => picked.has(r.accountId))}
                        onChange={(v) => setPicked(v ? new Set(rows.map((r) => r.accountId)) : new Set())} />
            </th>
            <th>계정코드</th>
            <th>계정명</th>
            <th className="text-right">총 예산액</th>
            <th>예산관리방법</th>
            <th>실적표기방법</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.accountId}>
              <td className="text-center">
                <NumCheck no={i + 1} label={`${r.code} 선택`} on={picked.has(r.accountId)}
                          onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.accountId); else n.delete(r.accountId); return n })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => setInput(r.accountId)}>{r.code}</button></td>
              <td><button type="button" className="ec-link" onClick={() => setInput(r.accountId)}>{r.name}</button></td>
              <td className="text-right">{won(r.total)}</td>
              <td>월</td>
              <td>잔액</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="ec-total">
              <td colSpan={3} className="text-center">계</td>
              <td className="text-right">{won(sum)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>

      <BudgetInputModal open={input != null} year={year} accountId={input} departments={masters.departments} projects={masters.projects}
                        onClose={() => setInput(null)} onSaved={() => void load()} />
      <Modal open={pickAccount} title="예산계정설정" width={420} error={error} onClose={() => setPickAccount(false)}>
        <p className="mb-[8px]">예산을 넣을 계정을 고르세요.</p>
        <CodePickerField label="계정" hideLabel width={300} value={newAccount} onChange={setNewAccount} items={masters.accounts} />
        <div className="flex gap-[5px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={!newAccount}
                  onClick={() => { setPickAccount(false); setInput(Number(newAccount)) }}>예산입력</button>
          <button type="button" className="ec-btn" onClick={() => setPickAccount(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
