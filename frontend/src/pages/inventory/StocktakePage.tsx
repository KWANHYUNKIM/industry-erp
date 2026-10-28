import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StagedAdjustment, Warehouse } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcGridToolbar, { EcWebUploadButton } from '../../components/EcGridToolbar'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 재고 I &gt; 기타이동 &gt; 재고조정 &gt; 재고조정진행단계 [단계별재고실사](E040650) — 2026-10-21 loginaa 실측.
 *
 * <p>실사 전표 한 장: 일자 · 창고 · 격자(품목코드 · 품목명 · 규격 · 단위 · 수량) · 아래 [재고조정] 체크 · 저장(F8) · 다시 작성 · 닫기.
 * [재고조정]을 켜고 저장하면 그 일자 재고를 실사수량에 맞춘다(포장김치 제2창고 311 → 실사 7: 재고조정조회 '단계별 · 26/10/20-1 · 304').
 * 끄고 저장하면 아래 확인 뒤 실사만 남는다(재고조정진행단계 장부 · 차이 빈칸). 같은 일자에 간편재고조정이 있으면 창고 · 체크와 상관없이
 * '같은 일자로 입력된 간편재고조정이 있습니다.' 로 막는다(서버가 같은 글로 막는다).
 *
 * <p>재고실사조회에서 입력일자를 누르면 ?slip= 로 열려 <b>단계별실사수정</b> — 일자는 잠기고 [삭제]가 있다.
 * 수정하면 예전 조정을 지우고 새로 맞춘다(7 → 10: 조정 -1 지우고 -2 · 301), 삭제하면 실사와 조정이 같이 지워진다.
 */
const NO_ADJUST_CONFIRM = '현재 [재고조정]에 체크되어 있지 않으며\n\n이 경우, 실사입력한 수량이 재고장부에 반영되지 않습니다.\n\n'
  + '단, 필요한 경우에는 실사전표만 먼저 저장한 후에 조정전표를 별도로 생성할 수 있습니다.\n\n이대로 진행하시겠습니까?'
export const STOCKTAKE_DONE = '요청된 [단계별재고실사] 작업이 완료되었습니다.'

interface Line { itemId: string; qty: string }
interface Slip { slipNo: string; date: string; warehouseId: number; warehouseName: string; employeeId: number | null; adjusted: boolean; lines: StagedAdjustment[] }
const blank = (): Line => ({ itemId: '', qty: '' })
const blankLines = () => [blank(), blank(), blank()]

export default function StocktakePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const slipNo = params.get('slip')
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [date, setDate] = useState(ymd(new Date()))
  const [warehouseId, setWarehouseId] = useState('')
  /* 머리 [담당자] — 사원 id 만 든다(inventory 는 hr 을 모른다). */
  const [employeeId, setEmployeeId] = useState('')
  const pickers = useCondPickers(['employees'])
  const employeeItems = useMemo(() => pickers.employees.map((e) => ({ ...e, value: String(e.id) })), [pickers.employees])
  const tableRef = useRef<HTMLTableElement>(null)
  const [lines, setLines] = useState<Line[]>(blankLines)
  const [adjust, setAdjust] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api.get<Item[]>('/items'), api.get<Warehouse[]>('/warehouses')])
      .then(([i, w]) => { setItems(i.data); setWarehouses(w.data) })
      .catch((e) => void ecAlert(extractErrorMessage(e)))
  }, [])
  useEffect(() => {
    if (!slipNo) return
    api.get<Slip>(`/staged-adjustments/slips/${encodeURIComponent(slipNo)}`)
      .then((r) => {
        setDate(r.data.date)
        setWarehouseId(String(r.data.warehouseId))
        setEmployeeId(r.data.employeeId != null ? String(r.data.employeeId) : '')
        setAdjust(r.data.adjusted)
        const ls = r.data.lines.map((l) => ({ itemId: String(l.itemId), qty: String(Number(l.actualQty)) }))
        setLines([...ls, ...Array.from({ length: Math.max(1, 3 - ls.length) }, blank)])
      })
      .catch((e) => void ecAlert(extractErrorMessage(e)))
  }, [slipNo])

  const itemOf = (id: string) => items.find((x) => String(x.id) === id)
  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), [lines])
  const setLine = (i: number, k: keyof Line, v: string) => setLines((ls) => {
    const n = ls.map((l, j) => (j === i ? { ...l, [k]: v } : l))
    return i === n.length - 1 && v ? [...n, blank()] : n
  })
  const myItems = useMyItemsPick((picked) => setLines((ls) => [...ls.filter((l) => l.itemId || l.qty),
    ...picked.map((m) => ({ ...blank(), itemId: String(m.itemId) })), blank()]))
  const reset = () => { setDate(ymd(new Date())); setWarehouseId(''); setEmployeeId(''); setLines(blankLines()); setAdjust(false) }
  const close = () => navigate('/inventory/staged-progress')

  async function save() {
    if (saving) return
    if (!warehouseId) return void ecAlert('창고를 입력하세요.')
    const filled = lines.filter((l) => l.itemId || l.qty)
    if (filled.length === 0) return void ecAlert('품목을 입력하세요.')
    for (const [i, l] of filled.entries()) {
      if (!l.itemId) return void ecAlert(`${i + 1}번째 줄 품목을 입력하세요.`)
      if (l.qty.trim() === '' || !Number.isFinite(Number(l.qty))) return void ecAlert(`${i + 1}번째 줄 수량을 입력하세요.`)
    }
    if (!adjust && !(await ecConfirm(NO_ADJUST_CONFIRM))) return
    const body = { date, warehouseId: Number(warehouseId), employeeId: employeeId ? Number(employeeId) : null, adjust,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), actualQty: Number(l.qty) })) }
    setSaving(true)
    try {
      if (slipNo) await api.put(`/staged-adjustments/slips/${encodeURIComponent(slipNo)}`, body)
      else await api.post('/staged-adjustments/slips', body)
      navigate('/inventory/staged-progress', { state: { notice: STOCKTAKE_DONE } })
    } catch (e) {
      void ecAlert(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!slipNo || !(await ecConfirm('전표를 삭제하겠습니까?\n- 단계별재고실사'))) return
    try {
      await api.delete(`/staged-adjustments/slips/${encodeURIComponent(slipNo)}`)
      navigate('/inventory/staged-progress', { state: { notice: STOCKTAKE_DONE } })
    } catch (e) {
      void ecAlert(extractErrorMessage(e))
    }
  }

  return (
    <EcListShell title={slipNo ? '단계별실사수정' : '단계별재고실사'} searchable={false} actions={[]}>
      <div className="ec-form mb-[8px]">
        <div className="flex gap-[12px] flex-wrap items-center">
          <label className="flex items-center gap-[6px]">
            <span className="w-[60px]">일자</span>
            <input className="ec-input" type="date" aria-label="일자" value={date} disabled={Boolean(slipNo)}
                   onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex items-center gap-[6px]">
            <span className="w-[60px]">창고</span>
            <CodePickerField pair label="창고" hideLabel width={220} placeholder="창고" emptyLabel="선택 해제"
                             value={warehouseId} onChange={(v) => setWarehouseId(v)}
                             items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
          </label>
          <label className="flex items-center gap-[6px]">
            <span className="w-[60px]">담당자</span>
            <CodePickerField pair label="담당자" hideLabel width={220} placeholder="담당자" emptyLabel="선택 해제"
                             value={employeeId} onChange={(v) => setEmployeeId(v)} items={employeeItems} />
          </label>
        </div>
      </div>
      <EcGridToolbar tableRef={tableRef} onMyItems={myItems.pick} myItemsBusy={myItems.busy}>
        <MyItemsNote note={myItems.note} />
      </EcGridToolbar>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[240px]">품목코드</th>
            <th>품목명</th>
            <th>규격</th>
            <th className="text-center">단위</th>
            <th className="w-[110px] text-right">수량</th>
            <th className="w-[110px]">새로운 항목 추가</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const it = itemOf(l.itemId)
            return (
              <tr key={i} data-line={i + 1}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  <CodePickerField pair label="품목" hideLabel width={220} placeholder="품목코드" emptyLabel="선택 해제"
                                   value={l.itemId} onChange={(v) => setLine(i, 'itemId', v)}
                                   items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, alias: x.searchKeyword, sub: x.spec }))} />
                </td>
                <td>{it?.name ?? ''}</td>
                <td>{it?.spec ?? ''}</td>
                <td className="text-center">{it?.unit ?? ''}</td>
                <td>
                  <input className="ec-input text-right w-[100px]" type="number" step="any" aria-label={`${i + 1}번째 줄 수량`}
                         value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
                </td>
                <td />
              </tr>
            )
          })}
          <tr>
            <td colSpan={5}></td>
            <td className="text-right font-semibold">{total.toLocaleString('ko-KR')}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <EcWebUploadButton />
      <label className="flex items-center gap-[5px] mt-[10px] cursor-pointer">
        <input type="checkbox" aria-label="재고조정" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} /> 재고조정
      </label>
      <div className="flex gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
        {!slipNo && <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>}
        <button type="button" className="ec-btn" onClick={close}>닫기</button>
        {slipNo && <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>}
      </div>
    </EcListShell>
  )
}
