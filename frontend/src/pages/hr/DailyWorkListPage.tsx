import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../utils/periods'

interface Line { id: number; workDate: string; workerId: number; workerCode: string; workerName: string; payItem: string; quantity: number }
interface Row extends Line { slipDate: string; slipNo: number }

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
 */
export default function DailyWorkListPage() {
  const nav = useNavigate()
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
  const shown = rows.filter((r) => (!useWorkDate || (r.workDate >= workRange.from && r.workDate <= workRange.to))
    && (workerCond.length === 0 || workerCond.includes(String(r.workerId)))
    && (itemCond.length === 0 || itemCond.includes(r.payItem))
    && (deptCond.length === 0 || deptCond.includes(String(deptOf.get(r.workerId) ?? ''))))
  useTableColumnCheck(tableRef, '일용근로 근무조회', [shown.length])

  const keyOf = (r: Row) => `${r.slipDate}/${r.slipNo}`

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('삭제하시겠습니까?')) return
    try {
      const slips = new Map(shown.filter((r) => checked.has(keyOf(r))).map((r) => [keyOf(r), r]))
      for (const r of slips.values()) await api.delete(`/hr/daily-work-entries/${r.slipDate}/${r.slipNo}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = shown.length > 0 && shown.every((r) => checked.has(keyOf(r)))

  return (
    <EcListShell
      title="일용근로 근무조회"
      searchable={false}
      onNew={() => nav('/hr/daily-work-input')}
      actions={[
        { label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      <div className="ec-pills mb-[8px]"><button type="button" className="ec-pill active">전체</button></div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="근무일자">
          {useWorkDate && (
            <>
              <input type="date" className="ec-input w-[150px]" aria-label="근무일자 시작" value={workRange.from} onChange={(e) => setWorkRange({ ...workRange, from: e.target.value })} />
              ~
              <input type="date" className="ec-input w-[150px]" aria-label="근무일자 끝" value={workRange.to} onChange={(e) => setWorkRange({ ...workRange, to: e.target.value })} />
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
      <div className="text-right text-ec-hint mb-[4px]">{shownRange.from.replace(/-/g, '/')} ~ {shownRange.to.replace(/-/g, '/')}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked}
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
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(keyOf(r))}
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
              <td className="text-center">{r.workDate.replace(/-/g, '/')}</td>
              <td>{r.workerName}</td>
              <td>{r.payItem}</td>
              <td className="text-right">{Number(r.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
