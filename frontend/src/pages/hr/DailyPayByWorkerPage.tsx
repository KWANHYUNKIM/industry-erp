import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { lastDay, monthRange, slashYm, won, type DailyReportLine } from '../../features/dailypay/report'

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 급여작업 &gt; <b>일용근로 사원별급여조회</b> (원본 E020135).
 *
 * <p>2026-10-03 loginaa 실측: [전체] · [미발송] 알약, 기간 전월+금월(2026/09/01 ~ 2026/10/31), 격자 귀속연월 · 사원코드 · 성명 ·
 * 지급총액 · 공제(전체) · 공제총액 · 실지급액 · 인쇄. 버튼 Email · 인쇄 · 선택삭제 · Excel. 빈 목록 '등록된 데이터가 없습니다.'
 * 공제(전체)는 소득세 · 지방소득세를 잇는다. [미발송] · Email · 명세서 인쇄는 없다(명세 메일을 보내지 않는다).
 */
export default function DailyPayByWorkerPage() {
  const [range, setRange] = useState(monthRange('전월+금월'))
  const [rows, setRows] = useState<DailyReportLine[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일용근로 사원별급여조회', [rows.length])

  function load() {
    setError('')
    api.get<DailyReportLine[]>('/hr/daily-pay-ledgers/lines', { params: { from: range.from, to: range.to } })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [range.from, range.to])

  async function deleteChecked() {
    if (checked.size === 0 || !window.confirm('삭제하시겠습니까?')) return
    try {
      for (const id of checked) await api.delete(`/hr/daily-pay-ledgers/lines/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.lineId))

  return (
    <EcListShell title="일용근로 사원별급여조회" searchable={false}
                 actions={[{ label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 }, { label: 'Excel' }]}>
      <div className="ec-pills mb-[8px]"><button type="button" className="ec-pill active">전체</button></div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="flex items-center justify-end gap-[6px] mb-[6px]">
        <input type="month" className="ec-input w-[140px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        ~
        <input type="month" className="ec-input w-[140px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <span className="text-ec-hint">{range.from.replace('-', '/')}/01 ~ {lastDay(range.to).replace(/-/g, '/')}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.lineId)))} />
            </th>
            <th className="text-center">귀속연월</th>
            <th>사원코드</th>
            <th>성명</th>
            <th className="text-right">지급총액</th>
            <th>공제(전체)</th>
            <th className="text-right">공제총액</th>
            <th className="text-right">실지급액</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => {
            const ded = Number(r.incomeTax) + Number(r.localTax)
            return (
              <tr key={r.lineId}>
                <td className="text-center">
                  <input type="checkbox" checked={checked.has(r.lineId)}
                         onChange={() => { const n = new Set(checked); if (n.has(r.lineId)) n.delete(r.lineId); else n.add(r.lineId); setChecked(n) }} />
                </td>
                <td className="text-center">{slashYm(r.payMonth)} -{r.seq}</td>
                <td>{r.workerCode}</td>
                <td>{r.workerName}</td>
                <td className="text-right">{won(r.grossPay)}</td>
                <td>{ded ? `소득세 ${won(r.incomeTax)} · 지방소득세 ${won(r.localTax)}` : ''}</td>
                <td className="text-right">{ded ? won(ded) : ''}</td>
                <td className="text-right">{won(r.netPay)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
