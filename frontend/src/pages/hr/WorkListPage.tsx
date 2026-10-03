import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'

interface SlipRow { slipDate: string; slipNo: number; employeeLabel: string; payItemLabel: string; quantity: number }

const thisYear = () => {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/**
 * 관리 &gt; 근무기록 &gt; <b>근무조회</b> (원본 E090105).
 *
 * <p>2026-10-03 loginaa 실측: [전체] 알약 · 기간 올해(2026/01/01 ~ 2026/12/31) · 격자 전표일자(2026/10/03 -2) · 사원
 * (여러 줄이면 '정재원 외 1건') · 수당항목 · 근무기록, 최신순. 버튼 신규(F2) · 선택삭제('삭제하시겠습니까?') · Excel.
 * [전표일자]를 누르면 근무입력이 그 전표로 열린다. 이력 · 조건 판(Search(F3))은 아직 없다.
 */
export default function WorkListPage() {
  const nav = useNavigate()
  const [{ from, to }, setRange] = useState(thisYear())
  const [rows, setRows] = useState<SlipRow[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '근무조회', [rows.length])

  function load() {
    setError('')
    api.get<SlipRow[]>('/work-records', { params: { from, to } })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [from, to])

  const keyOf = (r: SlipRow) => `${r.slipDate}/${r.slipNo}`

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('삭제하시겠습니까?')) return
    try {
      for (const r of rows.filter((x) => checked.has(keyOf(x)))) {
        await api.delete(`/work-records/${r.slipDate}/${r.slipNo}`)
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = rows.length > 0 && rows.every((r) => checked.has(keyOf(r)))

  return (
    <EcListShell
      title="근무조회"
      searchable={false}
      onNew={() => nav('/hr/work-input')}
      actions={[
        { label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 },
        { label: 'Excel' },
      ]}
    >
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
            <th>전표일자</th>
            <th>사원</th>
            <th>수당항목</th>
            <th className="text-right">근무기록</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={keyOf(r)}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(keyOf(r))}
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
    </EcListShell>
  )
}
