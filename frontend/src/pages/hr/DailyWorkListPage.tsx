import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../utils/periods'

interface Line { id: number; workDate: string; workerCode: string; workerName: string; payItem: string; quantity: number }
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
 * [전표일자]를 누르면 근무입력이 그 전표로 열린다. 이력 · 조건 판(Search(F3))은 없다.
 */
export default function DailyWorkListPage() {
  const nav = useNavigate()
  const [{ from, to }, setRange] = useState(monthToToday())
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일용근로 근무조회', [rows.length])

  function load() {
    setError('')
    api.get<Row[]>('/hr/daily-work-entries', { params: { from, to } })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [from, to])

  const keyOf = (r: Row) => `${r.slipDate}/${r.slipNo}`

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('삭제하시겠습니까?')) return
    try {
      const slips = new Map(rows.filter((r) => checked.has(keyOf(r))).map((r) => [keyOf(r), r]))
      for (const r of slips.values()) await api.delete(`/hr/daily-work-entries/${r.slipDate}/${r.slipNo}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = rows.length > 0 && rows.every((r) => checked.has(keyOf(r)))

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
      <div className="flex items-center justify-end gap-[6px] mb-[6px]">
        <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setRange({ from: e.target.value, to })} />
        ~
        <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setRange({ from, to: e.target.value })} />
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map(keyOf)))} />
            </th>
            <th className="text-center">전표일자</th>
            <th className="text-center">근무일자</th>
            <th>사원</th>
            <th>수당항목</th>
            <th className="text-right">근무기록</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
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
