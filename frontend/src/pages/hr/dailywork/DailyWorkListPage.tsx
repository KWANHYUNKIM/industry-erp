import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../../components/EcListShell'
import EcPeriodPicks, { INQUIRY_PICKS } from '../../../components/EcPeriodPicks'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import { ymd } from '../../../utils/periods'
import { ecConfirm } from '../../../components/EcDialog'
import NumCheck from '../../../components/NumCheck'
import DailyWorkHistoryView from '../../../features/dailypay/components/DailyWorkHistoryView'
import { EcDateRange } from '../../../components/ui/EcDateInput'

interface Line { id: number; lineNo: number; workDate: string; workerId: number; workerCode: string; workerName: string; payItem: string; quantity: number }
interface Row extends Line { slipDate: string; slipNo: number }
/** 근무조회 한 줄 = 전표 하나. 사원 '잠깐만 외 1건', 근무일자 · 수당항목 · 근무기록은 첫 줄 값(원본 E020751 2026-10-14). */
interface SlipRow { slipDate: string; slipNo: number; first: Row; lines: Row[] }


const monthToToday = () => {
  const d = new Date()
  return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(d) }
}

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 근무기록 &gt; <b>일용근로 근무조회</b> (원본 E020751).
 *
 * <p>2026-10-03 loginaa 실측: [전체] 알약 · 기간 금월(2026/10/01 ~ 2026/10/03) · 격자 전표일자(2026/10/03 -1) · 근무일자 · 사원 ·
 * 수당항목 · 근무기록, 줄마다 한 행 최신순. 버튼 신규(F2) · 선택삭제('삭제하시겠습니까?') · Excel.
 * [전표일자]를 누르면 근무입력이 그 전표로 열린다.
 * 조건 판은 접혀 있고 [Search(F3)]로 편다(원본 실측) — 기준일자(전표일자) · 근무일자([사용]) · 사원 · 수당항목 · 부서 ·
 * 프로젝트그룹1, 빠른선택 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일. 프로젝트그룹1(근무 전표에 프로젝트가 없다) · 이력은 없다.
 * 2026-10-14 다시 잼: 줄은 <b>전표마다 한 행</b>이다 — QA관리-일조 2.00(10/14) + 나일당 0.50(10/13) 전표가
 * '2026/10/14 -2 · (첫 줄 근무일자) · QA관리-일조 외 1건 · 일근무 · 2.00'(근무기록은 합 2.5 가 아니라 첫 줄 값). 번호 칸(form-checkbox-numbered),
 * 기간 '2026/10/01 ~2026/10/14'. [선택삭제]는 고른 줄이 없으면 '리스트에 선택된 자료가 없습니다.' 알림, 고르면 '삭제하겠습니까?' → 안내 없이 사라진다.
 * 오른쪽 위 [이력](근무조회 이력조회 — 열 작업일자 · 전표번호 · 행위 · 사원명 · 수당항목 · 근무기록 · 작업자 · 이력(H), 지운 전표도 '삭제' 로 남는다)은
 * daily_work_entry_histories 가 남기고 features/dailypay DailyWorkHistoryView 가 그린다. 버튼줄은 Excel 만, [전체] 알약으로 돌아온다.
 */
export default function DailyWorkListPage() {
  const nav = useNavigate()
  const [historyMode, setHistoryMode] = useState(false)
  const [range, setRange] = useState(monthToToday())
  const [shownRange, setShownRange] = useState(range)
  const [useWorkDate, setUseWorkDate] = useState(false)
  const [workRange, setWorkRange] = useState(range)
  const [workerCond, setWorkerCond] = useState<string[]>([])
  const [itemCond, setItemCond] = useState<string[]>([])
  const [deptCond, setDeptCond] = useState<string[]>([])
  const [workers, setWorkers] = useState<{ id: number; code: string; name: string; departmentId: number | null }[]>([])
  const [depts, setDepts] = useState<{ id: number; code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof workers>('/hr/daily-workers').then((r) => setWorkers(r.data)).catch(() => setWorkers([]))
    api.get<typeof depts>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)

  function load() {
    setError('')
    api.get<Row[]>('/hr/daily-work-entries', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShownRange(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  const deptOf = new Map(workers.map((w) => [w.id, w.departmentId]))
  const lineOk = (r: Row) => (!useWorkDate || (r.workDate >= workRange.from && r.workDate <= workRange.to))
    && (workerCond.length === 0 || workerCond.includes(String(r.workerId)))
    && (itemCond.length === 0 || itemCond.includes(r.payItem))
    && (deptCond.length === 0 || deptCond.includes(String(deptOf.get(r.workerId) ?? '')))
  const keyOf = (r: { slipDate: string; slipNo: number }) => `${r.slipDate}/${r.slipNo}`
  // 전표마다 묶는다 — 줄 차례는 lineNo(입력 차례). 조건은 줄 하나라도 맞으면 그 전표가 보인다(급여 근무조회 E090105 와 같다).
  const slips: SlipRow[] = []
  const byKey = new Map<string, SlipRow>()
  for (const r of [...rows].sort((a, b) => a.lineNo - b.lineNo || a.id - b.id)) {
    const k = keyOf(r)
    const s = byKey.get(k)
    if (s) s.lines.push(r)
    else { const n = { slipDate: r.slipDate, slipNo: r.slipNo, first: r, lines: [r] }; byKey.set(k, n); slips.push(n) }
  }
  const order = new Map(rows.map((r, i) => [keyOf(r), i]))
  slips.sort((a, b) => (order.get(keyOf(a)) ?? 0) - (order.get(keyOf(b)) ?? 0))
  const shown = slips.filter((s) => s.lines.some(lineOk))
  useTableColumnCheck(tableRef, '일용근로 근무조회', [shown.length])

  async function deleteChecked() {
    if (checked.size === 0 || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const r of shown.filter((x) => checked.has(keyOf(x)))) await api.delete(`/hr/daily-work-entries/${r.slipDate}/${r.slipNo}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = shown.length > 0 && shown.every((r) => checked.has(keyOf(r)))

  return (
    <EcListShell
      title={historyMode ? '근무조회 이력조회' : '일용근로 근무조회'}
      searchable={false}
      onNew={historyMode ? undefined : () => nav('/hr/daily-work-input')}
      actions={historyMode ? [{ label: 'Excel' }] : [
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
      {historyMode ? <DailyWorkHistoryView /> : (<>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[150px]", value: range.from, onChange: (e) => setRange({ ...range, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", value: range.to, onChange: (e) => setRange({ ...range, to: e.target.value }) }} />
        </EcCond>
        <EcCond label="근무일자">
          {useWorkDate && (
            <>
              <EcDateRange from={{ className: "ec-input w-[150px]", 'aria-label': "근무일자 시작", value: workRange.from, onChange: (e) => setWorkRange({ ...workRange, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", 'aria-label': "근무일자 끝", value: workRange.to, onChange: (e) => setWorkRange({ ...workRange, to: e.target.value }) }} />
            </>
          )}
          <label className="inline-flex items-center gap-[4px] ml-[6px]">
            <input type="checkbox" checked={useWorkDate} onChange={(e) => { setUseWorkDate(e.target.checked); if (e.target.checked) setWorkRange(range) }} /> 사용
          </label>
        </EcCond>
        <EcCond label="사원">
          <CodePickerField label="사원" hideLabel fill multiple placeholder="사원" values={workerCond} onChangeMulti={(v) => setWorkerCond(v)}
                           items={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
        </EcCond>
        <EcCond label="수당항목">
          <CodePickerField label="수당항목" hideLabel fill multiple placeholder="수당항목" values={itemCond} onChangeMulti={(v) => setItemCond(v)}
                           items={[{ value: '일근무', code: '02', name: '일근무' }]} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={depts.map((d) => ({ value: String(d.id), code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        <li className="flex flex-wrap items-center gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
          <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={range.from} onPick={setRange} />
        </li>
      </ul>
      <div className="text-right text-ec-hint mb-[4px]">{shownRange.from.replace(/-/g, '/')} ~{shownRange.to.replace(/-/g, '/')}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <NumCheck tone="plain" no="" label="전체 선택" on={allChecked}
                        onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map(keyOf)))} />
            </th>
            <th className="text-center">전표일자</th>
            <th className="text-center">근무일자</th>
            <th>사원</th>
            <th>수당항목</th>
            <th className="text-right">근무기록</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
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
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); nav(`/hr/daily-work-input?date=${r.slipDate}&no=${r.slipNo}`) }}>
                  {r.slipDate.replace(/-/g, '/')} -{r.slipNo}
                </a>
              </td>
              <td className="text-center">{r.first.workDate.replace(/-/g, '/')}</td>
              <td>{r.first.workerName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
              <td>{r.first.payItem}</td>
              <td className="text-right">{Number(r.first.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </>)}
    </EcListShell>
  )
}
