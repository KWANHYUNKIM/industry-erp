import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import GridSortModal from '../../components/GridSortModal'
import ConditionLoadModal from '../../components/ConditionLoadModal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../utils/periods'

interface Worker { id: number; code: string; name: string; dailyWage: number | null }
interface Row { workDate: string; workerId: string; quantity: string; amount: string }
interface SlipLine { workDate: string; workerId: number; quantity: number; amount: number | null }
interface Slip { slipDate: string; slipNo: number; lines: SlipLine[] }
const blank = (): Row => ({ workDate: '', workerId: '', quantity: '', amount: '' })
const BLANK_ROWS = 3

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 근무기록 &gt; <b>일용근로 근무입력</b> (원본 E020138).
 *
 * <p>2026-10-03 loginaa 에서 넣고 지워 본 그대로: 머리 [일자](오늘) + 격자 근무일자 · 사원 · 수당항목 · 단위 · 근무기록 · 금액,
 * 끝에 근무기록 · 금액 합계줄. 사원은 일용근로 사원 목록에서 고르고, 수당항목은 일근무 · 단위 변동(일).
 * 근무일자는 사원을 골라도 비어 있다(달력에서 고른다). 금액은 비워 두면 급여계산이 일근무 × 근무기록으로 셈한다.
 * 저장하면 안내 없이 폼이 비워진다. 버튼 저장(F8) · 다시 작성 · 리스트 · 웹자료올리기(없음).
 * 일용근로 수당등록이 없어 수당항목은 일근무 하나다. 찾기(F3) · 정렬 · 조건별 불러오기는 없다.
 */
export default function DailyWorkInputPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editDate = params.get('date')
  const editNo = params.get('no')
  const [slipDate, setSlipDate] = useState(editDate ?? ymd(new Date()))
  const [rows, setRows] = useState<Row[]>(Array.from({ length: BLANK_ROWS }, blank))
  const [workers, setWorkers] = useState<Worker[]>([])
  /** 원본 격자 [정렬](2026-10-04 실측 — 근무입력과 같은 정렬기준 창). 수당항목은 일근무 하나뿐이라 그 축은 늘 같다. */
  const [sortOpen, setSortOpen] = useState(false)
  /** 원본 [조건별 불러오기] — 근무입력과 같은 창. 수당항목은 일근무 하나라 그 열 하나다. */
  const [loadOpen, setLoadOpen] = useState(false)
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일용근로 근무입력', [rows.length])

  useEffect(() => {
    api.get<Worker[]>('/hr/daily-workers').then((r) => setWorkers(r.data)).catch(() => setWorkers([]))
  }, [])

  function reset() {
    setError('')
    if (!editDate || !editNo) { setRows(Array.from({ length: BLANK_ROWS }, blank)); return }
    api.get<Slip>(`/hr/daily-work-entries/${editDate}/${editNo}`).then((r) => {
      const got = r.data.lines.map((l) => ({
        workDate: l.workDate, workerId: String(l.workerId), quantity: String(l.quantity), amount: l.amount == null ? '' : String(l.amount),
      }))
      setRows([...got, ...Array.from({ length: Math.max(1, BLANK_ROWS - got.length) }, blank)])
    }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { reset() }, [editDate, editNo])

  function edit(i: number, patch: Partial<Row>) {
    setRows((rs) => {
      const next = rs.map((r, j) => (j === i ? { ...r, ...patch } : r))
      return next[next.length - 1].workerId ? [...next, blank()] : next
    })
  }

  async function save() {
    setError('')
    const filled = rows.filter((r) => r.workerId || r.quantity)
    if (filled.length === 0) { setError('근무기록을 한 줄 이상 넣으세요.'); return }
    for (const r of filled) {
      if (!r.workDate) { setError('근무일자를 확인바랍니다.'); return }
      if (!r.workerId) { setError('사원을 선택 바랍니다.'); return }
      if (!r.quantity || Number(r.quantity) <= 0) { setError('근무기록을 입력 바랍니다.'); return }
    }
    const body = {
      slipDate,
      lines: filled.map((r) => ({ workDate: r.workDate, workerId: Number(r.workerId), quantity: Number(r.quantity), amount: r.amount === '' ? null : Number(r.amount) })),
    }
    try {
      if (editDate && editNo) {
        await api.put(`/hr/daily-work-entries/${editDate}/${editNo}`, body)
        nav('/hr/daily-work-list')
      } else {
        await api.post('/hr/daily-work-entries', body)
        setRows(Array.from({ length: BLANK_ROWS }, blank))   // 원본: 안내 없이 폼을 비운다
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const qty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  const amt = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  return (
    <EcListShell
      title="일용근로 근무입력"
      searchable={false}
      actions={[
        { label: '저장(F8)', onClick: save, primary: true },
        { label: '다시 작성', onClick: reset },
        { label: '리스트', onClick: () => nav('/hr/daily-work-list') },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-form mb-[8px]">
        <li>
          <span className="title">일자</span>
          <div className="form">
            {editDate ? <span>{slipDate.replace(/-/g, '/')} -{editNo}</span>
              : <input type="date" className="ec-input w-[150px]" value={slipDate} onChange={(e) => setSlipDate(e.target.value)} />}
          </div>
        </li>
      </ul>
      <div className="flex gap-[6px] mb-[6px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setSortOpen(true)}>정렬</button>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setLoadOpen(true)}>조건별 불러오기</button>
      </div>
      <ConditionLoadModal open={loadOpen} onClose={() => setLoadOpen(false)}
                          people={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))}
                          items={[{ value: '02', code: '02', name: '일근무' }]}
                          onApply={(lines) => {
                            setRows((rs) => [...rs.filter((r) => r.workerId || r.workDate || r.quantity || r.amount),
                              ...lines.map((l) => ({ workDate: l.workDate, workerId: l.who, quantity: l.quantity, amount: '' })), blank()])
                            setLoadOpen(false)
                          }} />
      <GridSortModal open={sortOpen} error={error} keys={['근무일자', '사원', '수당항목'] as const} initial={['사원', '수당항목']} rows={rows}
                     keyOf={(r, k) => k === '근무일자' ? r.workDate : k === '사원' ? workers.find((w) => String(w.id) === r.workerId)?.code ?? '' : ''}
                     isFilled={(r) => !!(r.workerId || r.workDate || r.quantity || r.amount)}
                     onApply={(sorted) => { setRows(sorted); setSortOpen(false) }} onClose={() => setSortOpen(false)} />
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[160px]">근무일자</th>
              <th>사원</th>
              <th>수당항목</th>
              <th className="w-[100px] text-center">단위</th>
              <th className="w-[110px] text-right">근무기록</th>
              <th className="w-[130px] text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td><input type="date" className="ec-input w-full" value={r.workDate} onChange={(e) => edit(i, { workDate: e.target.value })} /></td>
                <td>
                  <CodePickerField label="사원" hideLabel fill placeholder="사원" emptyLabel="선택 해제"
                                   value={r.workerId} onChange={(v) => edit(i, { workerId: v })}
                                   items={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
                </td>
                <td>{r.workerId ? '일근무' : ''}</td>
                <td className="text-center">{r.workerId ? '변동(일)' : ''}</td>
                <td>
                  <input className="ec-input w-full text-right" inputMode="decimal" value={r.quantity}
                         onChange={(e) => edit(i, { quantity: e.target.value.replace(/[^0-9.]/g, '') })} />
                </td>
                <td>
                  <input className="ec-input w-full text-right" inputMode="numeric" value={r.amount === '' ? '' : Number(r.amount).toLocaleString('ko-KR')}
                         onChange={(e) => edit(i, { amount: e.target.value.replace(/[^0-9]/g, '') })} />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5}></td>
              <td className="text-right font-bold">{qty.toFixed(2)}</td>
              <td className="text-right font-bold">{amt.toLocaleString('ko-KR')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
