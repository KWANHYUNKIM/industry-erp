import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import { dateNo } from '../../../utils/dateNo'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import EcNumInput from '../../../components/EcNumInput'
import Modal from '../../../components/Modal'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import { useCondPickers } from '../../../utils/useCondPickers'
import PurchaseRequestForm, { copyLine, type PurchaseLineSeed } from '../../../features/purchaserequest/PurchaseRequestForm'
import PlanQtyAdjustModal, { type AdjustLine } from '../../../features/purchaseplan/PlanQtyAdjustModal'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../types/api'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import { fmtAmount } from '../../../utils/format'

const qty = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/**
 * 발주계획 — 따로 된 전표(PLANNED 행)다. 발주서는 그 줄을 베낀 다른 행이고 계획은 진행중 그대로다(원본 E040315 2026-10-20 실측).
 * 단가확정(PRICED)은 단가요청이 아직 계획 행 위에서 도는 예전 흐름이라 같이 본다.
 */
const PLANNED_ON: PurchaseOrderStatus[] = ['PLANNED', 'PRICED']
type SrcLine = { sourceLineId?: number | null }
/** 발주로 넘어간 계획 — 발주서가 이미 그 값을 보고 있어 격자에서 못 고친다(서버도 막는다). */
const ordered = (s: PurchaseOrderStatus) => s === 'ORDERED' || s === 'RECEIVED'
type Tab = '전체' | '확인' | '진행중' | '완료'

interface Row {
  key: string; orderId: number; lineId: number | null; date: string; no: string; partner: string; item: string
  qty: number; price: number | null; supply: number; vat: number; status: PurchaseOrderStatus
  updatedBy: string | null; closed: boolean
}
const done = (r: Row) => r.closed || ordered(r.status)

/**
 * 재고 I &gt; 구매관리 &gt; 발주계획 &gt; <b>발주계획조회</b>(C000076) — 2026-10-03 · 10-13 loginaa 실측(자료가 든 판, 직접 CRUD).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>) · 창고 · 프로젝트 · 거래처코드 · 품목코드 · 조회구분(<b>건별</b> | 전표별) ·
 * 수량(<b>전체</b> | 수량0 | 수량0 아님). 열: 일자-No. · 거래처코드명 · 품목명 · 수량 · 단가 · 금액 · 부가세 · 합계 · 최종수정자 ·
 * 종결여부 · 진행상태. 위 알약 '전체 · 확인 ▸ 진행중 – 완료', 열면 <b>진행중</b>.
 *
 * <p>10-13 실측(QA재고1 계획 포장재 7개를 넣어 고치고 지움):
 * <ul>
 *   <li>수량 · 단가 칸은 입력칸이다. 고치면 금액 · 부가세 · 합계가 바로 바뀌고(7 → 9: 450 · 45 · 495) <b>칸을 벗어나면 저장</b>된다.</li>
 *   <li>[종결여부] '종결' 을 누르면 확인 창 없이 <b>그 품목 줄만</b> 완료 탭으로 간다. 완료 탭에서는 그 칸이 주황 '취소'
 *       (rgb(246,136,45))로 바뀌고 누르면 진행중으로 돌아온다. 하단 [종결] 도 완료 탭에서는 [종결취소].</li>
 *   <li>[진행상태] '조회' → '발주번호확인' 창(No. · 발주번호). 발주서가 없으면 안내 두 줄.</li>
 *   <li>하단: 신규(F2) · 수량조정 · 다른전표생성 ▴(발주서) · 메신저 · 종결 · 선택삭제 · Excel. 전체 탭은 신규 · 메신저 · 선택삭제 · Excel.
 *       고른 것 없이 누르면 '리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.', 선택삭제는 '삭제하겠습니까?'.</li>
 *   <li>[수량조정] 은 계산 창이다 — 입력수량 + 품목별 · 창고별 안전재고 + 미판매 + 미불출 − 보유재고 − 미입고(음수면 0) → 발주확정수량
 *       (PlanQtyAdjustModal). 메신저는 우리에게 없다.</li>
 * </ul>
 *
 * <p>우리는 발주계획을 따로 전표로 두지 않고 발주서가 [발주계획] 단계를 지난다 — 계획 단계에 들어선(PLANNED 이상) 발주서가 계획이다.
 * 줄 종결은 purchase_order_lines.plan_closed, 발주확정 · 입고전환으로 넘어간 것도 완료로 본다(발주번호확인에 그 번호).
 * 원본은 한 계획 안에서 줄마다 거래처가 다르다 — 우리도 줄 거래처가 있으면 그것을 찍는다.
 */
export default function PurchasePlanListPage() {
  const navigate = useNavigate()
  const pickers = useCondPickers(['warehouses', 'projects', 'partners', 'items'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [unit, setUnit] = useState<'건별' | '전표별'>('건별')
  const [zero, setZero] = useState<'전체' | '수량0' | '수량0 아님'>('전체')
  const [tab, setTab] = useState<Tab>('진행중')
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, { qty?: string; price?: string }>>({})
  const [orderOf, setOrderOf] = useState<Row | null>(null)
  const [form, setForm] = useState<{ key: number; order: PurchaseOrder } | null>(null)
  const [adjust, setAdjust] = useState<AdjustLine[] | null>(null)
  /** [다른전표생성 ▴] 판 · 그 판에서 고른 '발주서입력' 창. */
  const [otherMenu, setOtherMenu] = useState<{ left: number; bottom: number } | null>(null)
  const [orderSeed, setOrderSeed] = useState<{ key: number; lines: PurchaseLineSeed[]; warehouseId: number | null } | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<PurchaseOrder[]>('/purchase-orders', { params: { from, to } })
      setOrders(r.data)
      setDrafts({})
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const rows = useMemo(() => {
    const plans = orders
      .filter((o) => PLANNED_ON.includes(o.status))
      .filter((o) => o.orderDate >= from && o.orderDate <= to)
      .filter((o) => !warehouse || String(o.warehouseId) === warehouse)
      .filter((o) => !project || String(o.projectId) === project)
      .filter((o) => !partner || String(o.partnerId) === partner)
      .sort((a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo)))
    const out: Row[] = []
    for (const o of plans) {
      const lines = o.lines.filter((l) => !item || String(l.itemId) === item)
      if (lines.length === 0) continue
      const base = { orderId: o.id, date: o.orderDate, no: o.orderNo, status: o.status, updatedBy: o.updatedBy ?? o.createdBy }
      if (unit === '건별') {
        for (const l of lines) {
          const lp = l as typeof l & { partnerName?: string | null }
          out.push({ ...base, key: `${o.id}-${l.id}`, lineId: l.id, partner: lp.partnerName || o.partnerName, item: l.itemName,
            qty: Number(l.quantity), price: Number(l.unitPrice), supply: Number(l.supplyAmount), vat: Number(l.vatAmount), closed: l.planClosed })
        }
      } else {
        out.push({ ...base, key: `${o.id}`, lineId: null, partner: o.partnerName,
          item: `${lines[0].itemName}${lines.length > 1 ? ` 외 ${lines.length - 1}건` : ''}`,
          qty: lines.reduce((a, l) => a + Number(l.quantity), 0), price: null,
          supply: lines.reduce((a, l) => a + Number(l.supplyAmount), 0), vat: lines.reduce((a, l) => a + Number(l.vatAmount), 0),
          closed: lines.every((l) => l.planClosed) })
      }
    }
    return out
      .filter((r) => zero === '전체' || (zero === '수량0') === (r.qty === 0))
      .filter((r) => tab === '전체' || tab === '확인' || (tab === '완료') === done(r))
  }, [orders, from, to, warehouse, project, partner, item, unit, zero, tab])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '발주계획조회', [rows.length])

  const radios = <T extends string>(name: string, opts: readonly T[], v: T, set: (x: T) => void) => opts.map((o) => (
    <label key={o} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="radio" name={name} checked={v === o} onChange={() => set(o)} /> {o}
    </label>
  ))

  /** 격자에서 바로 고칠 수 있나 — 건별 줄이고 아직 발주로 안 넘어갔을 때. */
  const editable = (r: Row) => r.lineId != null && !ordered(r.status)
  const draftNum = (r: Row, k: 'qty' | 'price', v: number) => {
    const d = drafts[r.key]?.[k]
    return d === undefined ? v : Number(d) || 0
  }
  /** 고치는 중인 값으로 금액 · 부가세를 바로 다시 센다(원본도 칸을 벗어나기 전에 바뀐다). */
  const live = (r: Row) => {
    if (!drafts[r.key]) return { supply: r.supply, vat: r.vat }
    const supply = Math.round(draftNum(r, 'qty', r.qty) * draftNum(r, 'price', r.price ?? 0))
    const o = orders.find((x) => x.id === r.orderId)
    return { supply, vat: o?.taxable === false ? 0 : Math.round(supply * 0.1) }
  }

  async function patchLine(r: Row, body: { quantity?: number; unitPrice?: number; closed?: boolean }) {
    try {
      await api.patch(`/purchase-orders/${r.orderId}/lines/${r.lineId}/plan`, body)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  /** 원본: 칸을 벗어나면 저장. 바뀐 것이 없으면 아무것도 안 보낸다. */
  async function commit(r: Row, k: 'qty' | 'price') {
    const d = drafts[r.key]?.[k]
    if (d === undefined) return
    const v = Number(d) || 0
    if (v === (k === 'qty' ? r.qty : r.price)) return
    await patchLine(r, k === 'qty' ? { quantity: v } : { unitPrice: v })
    void load()
  }
  async function setClosed(list: Row[], closed: boolean) {
    await Promise.all(list.filter((r) => r.lineId != null && !ordered(r.status)).map((r) => patchLine(r, { closed })))
    setChecked(new Set())
    void load()
  }

  const picked = rows.filter((r) => checked.has(r.key))
  const needPick = () => { void ecAlert('리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.'); return false }
  async function removeChecked() {
    if (picked.length === 0) return needPick()
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    /* 우리 계획은 발주서 한 장이다 — 고른 줄이 든 전표를 지운다(원본에서 여러 줄 전표의 한 줄만 고른 경우는 못 재 봤다). */
    const ids = [...new Set(picked.map((r) => r.orderId))]
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/purchase-orders/${id}`)))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    if (failed.length > 0) setError(`${failed.length}건을 지우지 못했습니다: ${extractErrorMessage(failed[0].reason)}`)
    setChecked(new Set())
    void load()
  }
  function openEdit(r: Row) {
    const o = orders.find((x) => x.id === r.orderId)
    if (o) setForm({ key: Date.now(), order: o })
  }

  /** [수량조정] — 고른 건별 줄을 계산 창에 올린다. 발주로 넘어간 줄은 못 고친다. */
  function openAdjust() {
    if (picked.length === 0) return needPick()
    const out: AdjustLine[] = []
    for (const r of picked) {
      if (r.lineId == null || !editable(r)) continue
      const o = orders.find((x) => x.id === r.orderId)
      const l = o?.lines.find((x) => x.id === r.lineId)
      if (!o || !l) continue
      out.push({ orderId: o.id, lineId: l.id, orderDate: o.orderDate, orderNo: o.orderNo, itemId: l.itemId, itemCode: l.itemCode,
        itemName: l.itemName, spec: l.spec, inputQty: Number(l.inputQuantity ?? l.quantity), qty: Number(l.quantity),
        warehouseId: o.warehouseId, warehouseName: o.warehouseName, calcDate: l.planCalcDate })
    }
    if (out.length > 0) setAdjust(out)
  }

  /**
   * [다른전표생성 › 발주서 › 1장라인별] — 고른 계획 줄을 한 장의 '발주서입력' 창에 베낀다(원본 2026-10-20 실측: 줄 L001 · 6 · 100 ·
   * [발주계획] 20261020 · [No.] 2, 입고창고 그대로, 거래처는 머리에서 고른다). 계획은 진행중 그대로다.
   */
  function makeOrder() {
    setOtherMenu(null)
    const lines: PurchaseLineSeed[] = []
    let warehouseId: number | null = null
    for (const r of picked) {
      const o = orders.find((x) => x.id === r.orderId)
      if (!o) continue
      warehouseId = warehouseId ?? o.warehouseId ?? null
      for (const l of o.lines) if (r.lineId == null || l.id === r.lineId) lines.push(copyLine(o, l))
    }
    if (lines.length > 0) setOrderSeed({ key: Date.now(), lines, warehouseId })
  }
  /** 이 계획 줄(전표별이면 그 계획의 줄 전부)을 베낀 발주서들 — 원본 '발주번호확인'. */
  const ordersOf = (r: Row) => {
    const plan = orders.find((x) => x.id === r.orderId)
    const ids = new Set((plan?.lines ?? []).filter((l) => r.lineId == null || l.id === r.lineId).map((l) => l.id))
    return orders.filter((o) => !PLANNED_ON.includes(o.status) && o.status !== 'REQUESTED'
      && o.lines.some((l) => ids.has((l as typeof l & SrcLine).sourceLineId ?? -1)))
  }

  const closeBtn = tab === '완료'
    ? { label: '종결취소', onClick: () => (picked.length === 0 ? needPick() : void setClosed(picked, false)) }
    : { label: '종결', onClick: () => (picked.length === 0 ? needPick() : void setClosed(picked, true)) }

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="발주계획조회"
      searchable={false}
      onNew={() => navigate('/sales/purchase-plan-input')}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setWarehouse(''); setProject(''); setPartner(''); setItem(''); setUnit('건별'); setZero('전체') } },
        ...(tab === '전체' ? [] : [
          { label: '수량조정', onClick: openAdjust },
          { label: '다른전표생성', onClick: () => {
            if (picked.length === 0) return needPick()
            const b = [...document.querySelectorAll<HTMLButtonElement>('.ec-footer button')].find((x) => x.textContent?.trim() === '다른전표생성')
            const r = b?.getBoundingClientRect()
            setOtherMenu({ left: r?.left ?? 200, bottom: r ? window.innerHeight - r.top + 4 : 48 })
          } },
          closeBtn,
        ]),
        { label: '선택삭제', onClick: () => void removeChecked(), selected: picked.length },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처코드" pick>
          <CodePickerField label="거래처코드" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="조회구분">{radios('plan-unit', ['건별', '전표별'] as const, unit, setUnit)}</EcCond>
        <EcCond label="수량">{radios('plan-zero', ['전체', '수량0', '수량0 아님'] as const, zero, setZero)}</EcCond>
      </ul>

      {/* 원본 제목 옆 알약: 전체 · 확인 ▸ 진행중 – 완료 (열면 진행중) */}
      <div className="ec-pills mb-[8px]">
        {([['전체', '전체'], ['확인', '확인 ▸'], ['진행중', '진행중'], ['완료', '완료']] as const).map(([k, label]) => (
          <button key={k} type="button" className={`ec-pill no-ec${tab === k ? ' active' : ''}`}
            onClick={() => { setTab(k); setChecked(new Set()) }}>{label}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={rows.length > 0 && rows.every((r) => checked.has(r.key))}
                onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.key)) : new Set())} />
            </th>
            <th className="text-center">일자-No.</th>
            <th>거래처코드명</th>
            <th>품목명</th>
            <th className="w-[90px] text-right">수량</th>
            <th className="w-[90px] text-right">단가</th>
            <th className="text-right">금액</th>
            <th className="text-right">부가세</th>
            <th className="text-right">합계</th>
            <th>최종수정자</th>
            <th className="text-center">종결여부</th>
            <th className="text-center">진행상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={13} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => {
            const v = live(r)
            return (
              <tr key={r.key}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td className="text-center">
                  <input type="checkbox" aria-label="선택" checked={checked.has(r.key)}
                    onChange={(e) => setChecked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(r.key); else n.delete(r.key); return n })} />
                </td>
                <td className="text-center">
                  {/* 원본: 누르면 발주계획입력(수정) 창. 발주로 넘어간 것은 발주서 쪽에서 고친다. */}
                  {r.status === 'PLANNED'
                    ? <a className="ec-link" onClick={() => openEdit(r)}>{dateNo(r.date, r.no)}</a>
                    : dateNo(r.date, r.no)}
                </td>
                <td>{r.partner}</td>
                <td>{r.item}</td>
                <td className="text-right">
                  {editable(r)
                    ? <EcNumInput className="ec-input w-full h-[25.2px] px-[1.8px] text-right" aria-label="수량"
                        value={drafts[r.key]?.qty ?? String(r.qty)}
                        onValue={(x) => setDrafts((d) => ({ ...d, [r.key]: { ...d[r.key], qty: x } }))}
                        onBlur={() => void commit(r, 'qty')} />
                    : qty(r.qty)}
                </td>
                <td className="text-right">
                  {editable(r)
                    ? <EcNumInput className="ec-input w-full h-[25.2px] px-[1.8px] text-right" aria-label="단가"
                        value={drafts[r.key]?.price ?? String(r.price ?? 0)}
                        onValue={(x) => setDrafts((d) => ({ ...d, [r.key]: { ...d[r.key], price: x } }))}
                        onBlur={() => void commit(r, 'price')} />
                    : r.price == null ? '' : fmtAmount(r.price)}
                </td>
                <td className="text-right">{fmtAmount(v.supply)}</td>
                <td className="text-right">{fmtAmount(v.vat)}</td>
                <td className="text-right">{fmtAmount(v.supply + v.vat)}</td>
                <td>{r.updatedBy ?? ''}</td>
                <td className="text-center">
                  {/* 원본: 진행중 줄은 파란 '종결', 종결한 줄은 주황 '취소' — 누르면 확인 없이 바로. */}
                  {r.lineId == null || ordered(r.status)
                    ? (done(r) ? <span className="text-[var(--ec-plan-reopen)]">완료</span> : '')
                    : r.closed
                      ? <a className="ec-link text-[var(--ec-plan-reopen)]" onClick={() => void setClosed([r], false)}>취소</a>
                      : <a className="ec-link" onClick={() => void setClosed([r], true)}>종결</a>}
                </td>
                <td className="text-center"><a className="ec-link" onClick={() => setOrderOf(r)}>조회</a></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Modal open={orderOf != null} error={error} title="발주번호확인" width={760} onClose={() => setOrderOf(null)}>{orderOf && (<>
        <table className="w-full">
          <thead><tr><th className="w-[50%] text-center">No.</th><th className="text-center">발주번호</th></tr></thead>
          <tbody>
            {/* 원본: [No.] 는 줄 번호가 아니라 그 계획의 번호, [발주번호] 는 파란 링크(누르면 발주서) — 2026-10-20 실측 '2026/10/20 -2 | 2026/10/20 -1'. */}
            {ordersOf(orderOf).length > 0
              ? ordersOf(orderOf).map((o) => (
                <tr key={o.id}><td className="text-center">{dateNo(orderOf.date, orderOf.no)}</td>
                  <td className="text-center"><a className="ec-link" onClick={() => navigate('/sales/purchase-orders')}>{dateNo(o.orderDate, o.orderNo)}</a></td></tr>
              ))
              : <tr><td colSpan={2} className="ec-empty">
                  발주서가 작성되지 않았습니다.<br />
                  [구매관리] &gt; [발주서입력]에서 [계획] 버튼을 통해 발주서를 작성하면 연결된 발주서 번호를 확인 할 수 있습니다.
                </td></tr>}
          </tbody>
        </table>
        <div className="mt-[10px]"><button type="button" className="ec-btn" onClick={() => setOrderOf(null)}>닫기</button></div>
      </>)}</Modal>

      {otherMenu && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setOtherMenu(null)} />
          {/* 원본 판 '발주서' 줄: 거래처별납기일자별라인별 · 거래처별납기일자별품목별 · 1장라인별 · 1장품목별 · 직접설정 */}
          <div className="ec-menu fixed" style={otherMenu} role="menu" aria-label="다른전표생성">
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 발주서</div>
            <button disabled title="아직 없습니다 — 1장라인별을 쓰세요.">거래처별납기일자별라인별</button>
            <button disabled title="아직 없습니다 — 1장라인별을 쓰세요.">거래처별납기일자별품목별</button>
            <button onClick={makeOrder}>1장라인별</button>
            <button disabled title="아직 없습니다 — 1장라인별을 쓰세요.">1장품목별</button>
            <button disabled title="아직 없습니다 — 1장라인별을 쓰세요.">직접설정</button>
          </div>
        </>
      )}
      {orderSeed && (
        <PurchaseRequestForm key={orderSeed.key} editing={null} order seed={orderSeed}
          onClose={() => setOrderSeed(null)}
          onSaved={() => { setOrderSeed(null); setChecked(new Set()); void load() }} />
      )}
      {adjust && (
        <PlanQtyAdjustModal lines={adjust} onClose={() => setAdjust(null)}
          onSaved={() => { setAdjust(null); setChecked(new Set()); void load() }} />
      )}
      {form && (
        <PurchaseRequestForm key={form.key} editing={form.order} plan
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); void load() }}
          onDeleted={() => { setForm(null); void load() }} />
      )}
    </EcListShell>
  )
}
