import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster, PayItem } from '../../types/api'
import { ymd } from '../../utils/periods'

interface Row { workDate: string; employeeId: string; payItemId: string; quantity: string }
const blank = (): Row => ({ workDate: '', employeeId: '', payItemId: '', quantity: '' })
const BLANK_ROWS = 3

interface SlipLine { workDate: string; employeeId: number; payItemId: number; quantity: number }
interface Slip { slipDate: string; slipNo: number; lines: SlipLine[] }

/**
 * 관리 &gt; 근무기록 &gt; <b>근무입력</b> (원본 E090113).
 *
 * <p>2026-10-03 loginaa 에서 넣고 지워 본 그대로:
 * <ul>
 *   <li>머리 [일자](오늘) + 격자: 근무일자 · 사원 · 수당항목 · 단위 · 근무기록, 끝에 근무기록 합계줄.
 *       사원 · 수당항목은 코드로 고르고, 단위는 수당항목의 지급유형(변동(시간) …)이 찍힌다.</li>
 *   <li>근무일자가 비면 '근무일자를 확인바랍니다.' 로 막힌다. 저장하면 폼이 비워진다(▲ 저장/신규).</li>
 *   <li>버튼 저장(F8) · 다시 작성 · 리스트(근무조회) · 웹자료올리기.</li>
 * </ul>
 * 저장한 근무기록은 급여계산이 그 달 변동수당으로 셈한다(근무시간 × 단가). 근무조회의 [전표일자]를 누르면 이 화면이 그 전표로 열린다.
 * 격자 [찾기(F3)] · [정렬] · [조건별 불러오기] · 웹자료올리기 · 저장/내용유지는 아직 없다.
 */
export default function WorkInputPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editDate = params.get('date')
  const editNo = params.get('no')
  const [slipDate, setSlipDate] = useState(editDate ?? ymd(new Date()))
  const [rows, setRows] = useState<Row[]>(Array.from({ length: BLANK_ROWS }, blank))
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '근무입력', [rows.length])

  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
    api.get<PayItem[]>('/pay-settings/items')
      .then((r) => setItems(r.data.filter((i) => i.kind === 'ALLOWANCE' && i.active)))
      .catch(() => setItems([]))
  }, [])

  function reset() {
    if (editDate && editNo) {
      api.get<Slip>(`/work-records/${editDate}/${editNo}`).then((r) => {
        const got = r.data.lines.map((l) => ({
          workDate: l.workDate, employeeId: String(l.employeeId), payItemId: String(l.payItemId), quantity: String(l.quantity),
        }))
        setSlipDate(r.data.slipDate)
        setRows([...got, ...Array.from({ length: Math.max(1, BLANK_ROWS - got.length) }, blank)])
      }).catch((e) => setError(extractErrorMessage(e)))
    } else {
      setRows(Array.from({ length: BLANK_ROWS }, blank))
    }
  }
  useEffect(() => { reset() }, [editDate, editNo])

  function edit(i: number, patch: Partial<Row>) {
    setRows((rs) => {
      const next = rs.map((r, j) => (j === i ? { ...r, ...patch } : r))
      // 마지막 줄에 적기 시작하면 빈 줄을 하나 더 둔다
      return next[next.length - 1].employeeId || next[next.length - 1].payItemId ? [...next, blank()] : next
    })
  }

  async function save() {
    setError('')
    const filled = rows.filter((r) => r.employeeId || r.payItemId || r.quantity)
    if (filled.length === 0) { setError('근무기록을 한 줄 이상 넣으세요.'); return }
    for (const r of filled) {
      if (!r.workDate) { setError('근무일자를 확인바랍니다.'); return }
      if (!r.employeeId) { setError('사원을 선택 바랍니다.'); return }
      if (!r.payItemId) { setError('수당항목을 선택 바랍니다.'); return }
      if (!r.quantity || Number(r.quantity) <= 0) { setError('근무기록을 입력 바랍니다.'); return }
    }
    const body = {
      slipDate,
      lines: filled.map((r) => ({ workDate: r.workDate, employeeId: Number(r.employeeId), payItemId: Number(r.payItemId), quantity: Number(r.quantity) })),
    }
    try {
      if (editDate && editNo) {
        await api.put(`/work-records/${editDate}/${editNo}`, body)
        nav('/hr/work-list')
      } else {
        const r = await api.post<Slip>('/work-records', body)
        setNotice(`${r.data.slipDate.replace(/-/g, '/')} -${r.data.slipNo} 저장`)
        window.setTimeout(() => setNotice(''), 2500)
        setRows(Array.from({ length: BLANK_ROWS }, blank))   // 원본 기본은 저장/신규 — 폼을 비운다
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0)

  return (
    <EcListShell
      title="근무입력"
      searchable={false}
      actions={[
        { label: '저장(F8)', onClick: save, primary: true },
        { label: '다시 작성', onClick: reset },
        { label: '리스트', onClick: () => nav('/hr/work-list') },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}
      <ul className="ec-form mb-[8px]">
        <li>
          <span className="title">일자</span>
          <div className="form">
            {editDate ? <span>{slipDate.replace(/-/g, '/')} -{editNo}</span>
              : <input type="date" className="ec-input w-[150px]" value={slipDate} onChange={(e) => setSlipDate(e.target.value)} />}
          </div>
        </li>
      </ul>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[160px]">근무일자</th>
            <th>사원</th>
            <th>수당항목</th>
            <th className="w-[120px] text-center">단위</th>
            <th className="w-[120px] text-right">근무기록</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const it = items.find((x) => String(x.id) === r.payItemId)
            return (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td><input type="date" className="ec-input w-full" value={r.workDate} onChange={(e) => edit(i, { workDate: e.target.value })} /></td>
                <td>
                  <CodePickerField label="사원" hideLabel fill placeholder="사원" emptyLabel="선택 해제"
                                   value={r.employeeId} onChange={(v) => edit(i, { employeeId: v })}
                                   items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
                <td>
                  <CodePickerField label="수당항목" hideLabel fill placeholder="수당항목" emptyLabel="선택 해제"
                                   value={r.payItemId} onChange={(v) => edit(i, { payItemId: v })}
                                   items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
                <td className="text-center">{it?.payMethodName ?? ''}</td>
                <td>
                  <input className="ec-input w-full text-right" inputMode="decimal" value={r.quantity}
                         onChange={(e) => edit(i, { quantity: e.target.value.replace(/[^0-9.]/g, '') })} />
                </td>
              </tr>
            )
          })}
          <tr>
            <td colSpan={5}></td>
            <td className="text-right font-bold">{total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </EcListShell>
  )
}
