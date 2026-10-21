import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import GridSortModal from '../../components/GridSortModal'
import ConditionLoadModal from '../../components/ConditionLoadModal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../utils/periods'
import GridFindButton from '../../components/GridFindButton'
import { ecConfirm } from '../../components/EcDialog'
import { DailyWorkSlipHistory } from '../../features/dailypay/components/DailyWorkHistoryView'

interface Worker { id: number; code: string; name: string; dailyWage: number | null; payAmounts?: { itemId: number; amount: number | null }[] }
/** item: 수당항목('02' 일근무 — 원본도 사원을 골라도 비어 있고 따로 고른다). autoAmt: 금액이 일근무 × 근무기록으로 채워진 값(저장하지 않는다). */
interface Row { workDate: string; workerId: string; item: string; quantity: string; amount: string; autoAmt: boolean }
interface SlipLine { workDate: string; workerId: number; payItemId: number | null; quantity: number; amount: number | null }
/** 일용근로 수당등록의 수당(기본 02 일근무 + 더한 항목). 2026-10-21 원본: 더한 수당(QA관리-야간)도 근무입력 수당항목에서 고른다. */
interface PayItem { id: number; code: string; name: string; payMethod: string | null; builtin: boolean }
interface Slip { slipDate: string; slipNo: number; lines: SlipLine[] }
const blank = (): Row => ({ workDate: '', workerId: '', item: '', quantity: '', amount: '', autoAmt: false })
const BLANK_ROWS = 3

/**
 * 관리 &gt; 일용근로급여관리 &gt; 일용근로 근무기록 &gt; <b>일용근로 근무입력</b> (원본 E020138).
 *
 * <p>2026-10-03 loginaa 에서 넣고 지워 본 그대로: 머리 [일자](오늘) + 격자 근무일자 · 사원 · 수당항목 · 단위 · 근무기록 · 금액,
 * 끝에 근무기록 · 금액 합계줄. 사원은 일용근로 사원 목록에서 고르고, 수당항목은 일근무 · 단위 변동(일).
 * 근무일자는 사원을 골라도 비어 있다(달력에서 고른다). 금액은 비워 두면 급여계산이 일근무 × 근무기록으로 셈한다.
 * 저장하면 안내 없이 폼이 비워진다. 버튼 저장(F8) · 다시 작성 · 리스트 · 웹자료올리기(없음).
 * 일용근로 수당등록이 없어 수당항목은 일근무 하나다. 찾기(F3) · 정렬 · 조건별 불러오기는 없다.
 *
 * <p>2026-10-14 다시 잼(원본 QA관리-일근 · 일근무 150,000): 사원을 골라도 수당항목은 비어 있고 따로 고른다(고르면 단위 '변동(일)').
 * 근무기록을 넣으면 금액이 일근무 × 근무기록(2 → 300,000)으로 바로 채워지지만 저장되지 않는다 — 전표를 다시 열면 금액이 비어 있고,
 * 근무기록을 고치면 다시 채워진다(3 → 450,000). 근무일자 · 수당항목이 비면 저장 때 문구 없이 그 칸 테두리만 빨갛다.
 */
export default function DailyWorkInputPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editDate = params.get('date')
  const editNo = params.get('no')
  /** 원본 수정 창 [복사] — 그 전표의 줄을 담은 새 입력 창(일자 그대로, 저장하면 다음 번호 2026/10/13 -2) */
  const copy = params.get('copy')   // 2026-10-14/3 꼴
  const [histOpen, setHistOpen] = useState(false)
  const [slipDate, setSlipDate] = useState(editDate ?? ymd(new Date()))
  const [rows, setRows] = useState<Row[]>(Array.from({ length: BLANK_ROWS }, blank))
  const [workers, setWorkers] = useState<Worker[]>([])
  /** 원본 격자 [정렬](2026-10-04 실측 — 근무입력과 같은 정렬기준 창). 수당항목은 일근무 하나뿐이라 그 축은 늘 같다. */
  const [sortOpen, setSortOpen] = useState(false)
  /** 원본 [조건별 불러오기] — 근무입력과 같은 창. 수당항목은 일근무 하나라 그 열 하나다. */
  const [loadOpen, setLoadOpen] = useState(false)
  const [error, setError] = useState('')
  /** 저장을 눌렀는데 빈 필수칸(근무일자 · 수당항목)이 있었다 — 원본은 문구 없이 그 칸 테두리만 빨강. */
  const [missing, setMissing] = useState(false)
  const [payItems, setPayItems] = useState<PayItem[]>([])
  const items = payItems.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))
  const dayItem = payItems.find((p) => p.builtin)
  const itemOf = (v: string) => payItems.find((p) => String(p.id) === v)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '일용근로 근무입력', [rows.length])

  useEffect(() => {
    api.get<Worker[]>('/hr/daily-workers').then((r) => setWorkers(r.data)).catch(() => setWorkers([]))
    api.get<PayItem[]>('/hr/daily-pay-items', { params: { kind: 'ALLOWANCE' } }).then((r) => setPayItems(r.data)).catch(() => setPayItems([]))
  }, [])

  function reset() {
    setError('')
    setMissing(false)
    const src = editDate && editNo ? `${editDate}/${editNo}` : copy
    if (!src) { setRows(Array.from({ length: BLANK_ROWS }, blank)); return }
    api.get<Slip>(`/hr/daily-work-entries/${src}`).then((r) => {
      if (!editDate) setSlipDate(r.data.slipDate)   // [복사] 는 원본처럼 같은 일자의 다음 번호로 저장된다
      const got = r.data.lines.map((l) => ({
        workDate: l.workDate, workerId: String(l.workerId), item: String(l.payItemId ?? dayItem?.id ?? ''), quantity: String(l.quantity),
        amount: l.amount == null ? '' : String(l.amount), autoAmt: false,
      }))
      setRows([...got, ...Array.from({ length: Math.max(1, BLANK_ROWS - got.length) }, blank)])
    }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { reset() }, [editDate, editNo, copy, dayItem?.id])

  function edit(i: number, patch: Partial<Row>) {
    setRows((rs) => {
      const next = rs.map((r, j) => {
        if (j !== i) return r
        const n = { ...r, ...patch }
        // 원본: 근무기록을 넣으면 금액 = 일근무 × 근무기록(직접 넣은 금액은 그대로). 더한 수당(QA관리-야간)은 채우지 않는다(2026-10-21).
        if ('quantity' in patch && (n.amount === '' || n.autoAmt) && (!n.item || itemOf(n.item)?.builtin)) {
          const wage = workers.find((w) => String(w.id) === n.workerId)?.dailyWage
          const q = Number(n.quantity)
          if (wage != null && q > 0) { n.amount = String(Math.round(wage * q)); n.autoAmt = true }
          else if (n.autoAmt) { n.amount = ''; n.autoAmt = false }
        }
        // 원본(2026-10-21): 변동(직접입력) 수당은 근무기록을 넣으면 금액 = 사원 급여지급사항 내역 × 근무기록(7,000 × 2 → 14,000)이
        // 채워지고 고칠 수 있다 — 그 금액이 근무기록확정(금액) 이 되므로 저장한다(직접입력 칸, autoAmt 아님).
        if ('quantity' in patch && n.item && itemOf(n.item)?.payMethod === '변동(직접입력)') {
          const rate = workers.find((w) => String(w.id) === n.workerId)?.payAmounts?.find((a) => String(a.itemId) === n.item)?.amount
          const q = Number(n.quantity)
          if (rate != null && q > 0) { n.amount = String(Math.round(Number(rate) * q)); n.autoAmt = false }
        }
        if ('amount' in patch) n.autoAmt = false
        return n
      })
      return next[next.length - 1].workerId ? [...next, blank()] : next
    })
  }

  async function save() {
    setError('')
    setMissing(false)
    const filled = rows.filter((r) => r.workerId || r.item || r.quantity)
    if (filled.length === 0) { setError('근무기록을 한 줄 이상 넣으세요.'); return }
    for (const r of filled) {
      if (!r.workDate || !r.item) { setMissing(true); return }   // 원본: 문구 없이 칸 테두리만 빨강
      if (!r.workerId) { setError('사원을 선택 바랍니다.'); return }
      if (!r.quantity || Number(r.quantity) <= 0) { setError('근무기록을 입력 바랍니다.'); return }
    }
    const body = {
      slipDate,
      lines: filled.map((r) => ({ workDate: r.workDate, workerId: Number(r.workerId), payItemId: Number(r.item), quantity: Number(r.quantity), amount: r.amount === '' || r.autoAmt ? null : Number(r.amount) })),
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

  /** 원본 수정 창 [삭제] — '한번 지워진 자료는 복구될 수 없습니다. 삭제하겠습니까?' → 안내 없이 사라진다. */
  async function remove() {
    if (!editDate || !editNo) return
    if (!(await ecConfirm('한번 지워진 자료는 복구될 수 없습니다. 삭제하겠습니까?'))) return
    try {
      await api.delete(`/hr/daily-work-entries/${editDate}/${editNo}`)
      nav('/hr/daily-work-list')
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
      actions={editDate && editNo ? [
        // 원본 수정 창 버튼줄(2026-10-14 실측): 저장(F8) · 복사 · 닫기 · 삭제 · H
        { label: '저장(F8)', onClick: save, primary: true },
        { label: '복사', onClick: () => nav(`/hr/daily-work-input?copy=${editDate}/${editNo}`) },
        { label: '닫기', onClick: () => nav('/hr/daily-work-list') },
        { label: '삭제', onClick: remove },
        { label: 'H', onClick: () => setHistOpen(true) },
      ] : [
        { label: '저장(F8)', onClick: save, primary: true },
        { label: '다시 작성', onClick: reset },
        { label: '리스트', onClick: () => nav('/hr/daily-work-list') },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {histOpen && editDate && editNo && <DailyWorkSlipHistory slipDate={editDate} slipNo={Number(editNo)} onClose={() => setHistOpen(false)} />}
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
        <GridFindButton tableRef={tableRef} />
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setSortOpen(true)}>정렬</button>
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => setLoadOpen(true)}>조건별 불러오기</button>
      </div>
      <ConditionLoadModal open={loadOpen} onClose={() => setLoadOpen(false)}
                          people={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))}
                          items={items}
                          onApply={(lines) => {
                            setRows((rs) => [...rs.filter((r) => r.workerId || r.workDate || r.quantity || r.amount),
                              ...lines.map((l) => ({ workDate: l.workDate, workerId: l.who, item: l.item, quantity: l.quantity, amount: '', autoAmt: false })), blank()])
                            setLoadOpen(false)
                          }} />
      <GridSortModal open={sortOpen} error={error} keys={['근무일자', '사원', '수당항목'] as const} initial={['사원', '수당항목']} rows={rows}
                     keyOf={(r, k) => k === '근무일자' ? r.workDate : k === '사원' ? workers.find((w) => String(w.id) === r.workerId)?.code ?? '' : r.item}
                     isFilled={(r) => !!(r.workerId || r.workDate || r.item || r.quantity || r.amount)}
                     onApply={(sorted) => { setRows(sorted); setSortOpen(false) }} onClose={() => setSortOpen(false)} />
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px]"></th>
              <th className="w-[302px]">근무일자</th>
              <th>사원</th>
              <th className="w-[239px]">수당항목</th>
              <th className="w-[146px] text-center">단위</th>
              <th className="w-[140px] text-right">근무기록</th>
              <th className="w-[140px] text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const used = !!(r.workerId || r.item || r.quantity)
              const badDate = missing && used && !r.workDate
              const badItem = missing && used && !r.item
              return (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td><input type="date" className={`ec-input w-full ${badDate ? 'border-ec-danger' : ''}`} aria-invalid={badDate}
                           value={r.workDate} onChange={(e) => edit(i, { workDate: e.target.value })} /></td>
                <td>
                  <CodePickerField label="사원" hideLabel fill placeholder="사원" emptyLabel="선택 해제"
                                   value={r.workerId} onChange={(v) => edit(i, { workerId: v })}
                                   items={workers.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
                </td>
                <td>
                  <div className={badItem ? 'border border-ec-danger rounded-ec' : ''} aria-invalid={badItem}>
                    <CodePickerField label="수당항목" hideLabel fill placeholder="수당항목" emptyLabel="선택 해제"
                                     value={r.item} onChange={(v) => edit(i, { item: v })} items={items} />
                  </div>
                </td>
                <td className="text-center">{r.item ? itemOf(r.item)?.payMethod ?? '변동(일)' : ''}</td>
                <td>
                  <input className="ec-input w-full text-right" inputMode="decimal" value={r.quantity}
                         onChange={(e) => edit(i, { quantity: e.target.value.replace(/[^0-9.]/g, '') })} />
                </td>
                <td>
                  {/* 원본: 변동(시간) · 변동(지급률) 수당은 금액 칸이 열리지 않는다(근무기록만) */}
                  <input className="ec-input w-full text-right" inputMode="numeric" value={r.amount === '' ? '' : Number(r.amount).toLocaleString('ko-KR')}
                         disabled={['변동(시간)', '변동(지급률)', '고정'].includes(itemOf(r.item)?.payMethod ?? '')}
                         onChange={(e) => edit(i, { amount: e.target.value.replace(/[^0-9]/g, '') })} />
                </td>
              </tr>
              )
            })}
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
