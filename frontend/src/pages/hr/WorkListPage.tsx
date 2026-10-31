import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, PayItem } from '../../types/api'
import WorkHistoryView from '../../features/workrecord/components/WorkHistoryView'
import { ecConfirm } from '../../components/EcDialog'
import NumCheck from '../../components/NumCheck'
import { EcDateRange } from '../../components/ui/EcDateInput'

interface SlipLine { employeeId: number; payItemId: number }
interface SlipRow { slipDate: string; slipNo: number; employeeLabel: string; payItemLabel: string; quantity: number; lines: SlipLine[] }
/** 원본 근무조회 [Search(F3)] 판의 빠른선택(2026-10-03 실측) */
const WORK_LIST_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일', '전월+금월', '차월', '금년'] as const


const thisYear = () => {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/**
 * 관리 &gt; 근무기록 &gt; <b>근무조회</b> (원본 E090105).
 *
 * <p>2026-10-03 loginaa 실측: [전체] 알약 · 기간 올해(2026/01/01 ~ 2026/12/31) · 격자 전표일자(2026/10/03 -2) · 사원
 * (여러 줄이면 '정재원 외 1건') · 수당항목 · 근무기록, 최신순. 버튼 신규(F2) · 선택삭제('삭제하시겠습니까?') · Excel.
 * [전표일자]를 누르면 근무입력이 그 전표로 열린다. 조건 판은 접혀 있고 [Search(F3)]로 편다 — 기준일자 · 사원 · 수당항목
 * (여러 개 고르는 코드도움, 전표 줄 하나라도 맞으면 보인다). 프로젝트 조건(근무 전표에 프로젝트가 없다)은 없다.
 * 2026-10-13 다시 잼: 여러 줄 전표의 [근무기록] 은 <b>첫 줄</b> 값(2026/10/04 -1 정재원 3.00 + 변종호 6.00 → 3.00),
 * 번호 칸(form-checkbox-numbered) · 머리 굵기 400 · 기간 '2026/01/01 ~2026/12/31'. [선택삭제] 는 고른 줄이 없어도 눌리고
 * '리스트에 선택된 자료가 없습니다.' 알림, 고르면 '삭제하겠습니까?' → 안내 없이 줄이 사라진다.
 * 오른쪽 위 [이력] 을 누르면 '근무조회 이력조회'(features/workrecord WorkHistoryView) — 버튼줄은 Excel 만, [전체] 알약으로 돌아온다.
 */
export default function WorkListPage() {
  const nav = useNavigate()
  const [historyMode, setHistoryMode] = useState(false)
  const [range, setRange] = useState(thisYear())
  const [shownRange, setShownRange] = useState(range)
  const [empCond, setEmpCond] = useState<string[]>([])
  const [itemCond, setItemCond] = useState<string[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [payItems, setPayItems] = useState<PayItem[]>([])
  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees/all').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<PayItem[]>('/pay-settings/items').then((r) => setPayItems(r.data.filter((i) => i.kind === 'ALLOWANCE'))).catch(() => setPayItems([]))
  }, [])
  const [rows, setRows] = useState<SlipRow[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '근무조회', [rows.length, empCond.length, itemCond.length])

  function load() {
    setError('')
    api.get<SlipRow[]>('/work-records', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShownRange(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  const keyOf = (r: SlipRow) => `${r.slipDate}/${r.slipNo}`
  const shown = rows.filter((r) => (r.lines ?? []).some((l) =>
    (empCond.length === 0 || empCond.includes(String(l.employeeId))) && (itemCond.length === 0 || itemCond.includes(String(l.payItemId)))))

  async function deleteChecked() {
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const r of shown.filter((x) => checked.has(keyOf(x)))) {
        await api.delete(`/work-records/${r.slipDate}/${r.slipNo}`)
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = shown.length > 0 && shown.every((r) => checked.has(keyOf(r)))

  return (
    <EcListShell
      title={historyMode ? '근무조회 이력조회' : '근무조회'}
      searchable={false}
      onNew={historyMode ? undefined : () => nav('/hr/work-input')}
      actions={historyMode ? [{ label: 'Excel' }] : [
        // 원본 E090105(2026-10-13)는 고른 줄이 없어도 눌리고 '리스트에 선택된 자료가 없습니다.' 알림 — 셸이 띄운다(selected)
        { label: '선택삭제', onClick: deleteChecked, selected: checked.size },
        { label: 'Excel' },
      ]}
    >
      <div className="flex items-center justify-between mb-[8px]">
        <div className="ec-pills">
          <button type="button" className={`ec-pill${historyMode ? '' : ' active'}`} onClick={() => { setHistoryMode(false); load() }}>전체</button>
        </div>
        <div className="ec-pills">
          <button type="button" className={`ec-pill${historyMode ? ' active' : ''}`} onClick={() => setHistoryMode(true)}>이력</button>
        </div>
      </div>
      {historyMode ? <WorkHistoryView /> : (<>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[150px]", value: range.from, onChange: (e) => setRange({ ...range, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", value: range.to, onChange: (e) => setRange({ ...range, to: e.target.value }) }} />
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={employees.map((e) => ({ value: String(e.id), code: e.code, name: e.name }))} />
        </EcCond>
        <EcCond label="수당항목">
          <CodePickerField label="수당항목" hideLabel fill multiple placeholder="수당항목" values={itemCond} onChangeMulti={(v) => setItemCond(v)}
                           items={payItems.map((i) => ({ value: String(i.id), code: i.code, name: i.name }))} />
        </EcCond>
        <li className="flex flex-wrap items-center gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
          <EcPeriodPicks labels={WORK_LIST_PICKS} currentFrom={range.from} onPick={setRange} />
        </li>
      </ul>
      <div className="text-right text-ec-hint mb-[4px]">{shownRange.from.replace(/-/g, '/')} ~{shownRange.to.replace(/-/g, '/')}</div>
      <table ref={tableRef} className="w-full text-left ec-report-head400">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <NumCheck tone="plain" no="" label="전체 선택" on={allChecked}
                        onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map(keyOf)))} />
            </th>
            <th>전표일자</th>
            <th>사원</th>
            <th>수당항목</th>
            <th className="text-right">근무기록</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={keyOf(r)}>
              <td className="text-center">
                <NumCheck tone="plain" no={i + 1} label="선택" on={checked.has(keyOf(r))}
                         onChange={() => {
                         const next = new Set(checked)
                         if (next.has(keyOf(r))) next.delete(keyOf(r)); else next.add(keyOf(r))
                         setChecked(next)
                       }} />
              </td>
              <td>
                <a href="#" onClick={(e) => { e.preventDefault(); nav(`/hr/work-input?date=${r.slipDate}&no=${r.slipNo}`) }}>
                  {r.slipDate.replace(/-/g, '/')} -{r.slipNo}
                </a>
              </td>
              <td>{r.employeeLabel}</td>
              <td>{r.payItemLabel}</td>
              <td className="text-right">{Number(r.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </>)}
    </EcListShell>
  )
}
