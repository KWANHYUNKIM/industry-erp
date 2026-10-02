import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const qty = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 계획을 세운 발주서 — 우리 단계는 요청 → 계획 → 단가확정 → 발주확정 → 입고전환으로 건너뛸 수 없다(PurchaseOrderService). */
const PLANNED_ON: PurchaseOrderStatus[] = ['PLANNED', 'PRICED', 'ORDERED', 'RECEIVED']
const done = (s: PurchaseOrderStatus) => s === 'ORDERED' || s === 'RECEIVED'
type Tab = '전체' | '진행중' | '완료'

interface Row {
  key: string; date: string; no: string; partner: string; item: string
  qty: number; price: number | null; supply: number; vat: number; status: PurchaseOrderStatus
}

/**
 * 재고 I &gt; 구매관리 &gt; 발주계획 &gt; <b>발주계획조회</b>(C000076) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>) · 창고 · 프로젝트 · 거래처코드 · 품목코드 · 조회구분(<b>건별</b> | 전표별) ·
 * 수량(<b>전체</b> | 수량0 | 수량0 아님). 열: 일자-No. · 거래처코드명 · 품목명 · 수량(100.00) · 단가 · 금액 · 부가세 · 합계 · 최종수정자 ·
 * 종결여부 · 진행상태. 위 탭 전체 · 확인 · 진행중 · 완료.
 *
 * <p>우리는 발주계획을 따로 전표로 두지 않고 발주서가 [발주계획] 단계를 지난다 — 계획 단계에 들어선(PLANNED 이상) 발주서가 계획이다.
 * 계획 · 단가확정이면 '진행중', 발주확정 · 입고전환이면 계획이 발주로 넘어간 것이라 '완료'이고 종결여부에 '종결'을 찍는다.
 * 건별은 품목 줄마다, 전표별은 발주서 한 장에 한 줄(품목 '외 n건', 단가 빈칸). 최종수정자는 고친 사람을 남기지 않아 열이 없다.
 */
export default function PurchasePlanListPage() {
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
  const [tab, setTab] = useState<Tab>('전체')
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<PurchaseOrder[]>('/purchase-orders', { params: { from, to } })
      setOrders(r.data)
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
      .filter((o) => tab === '전체' || (tab === '완료') === done(o.status))
      .sort((a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo)))
    const out: Row[] = []
    for (const o of plans) {
      const lines = o.lines.filter((l) => !item || String(l.itemId) === item)
      if (lines.length === 0) continue
      if (unit === '건별') {
        for (const l of lines) out.push({ key: `${o.id}-${l.id}`, date: o.orderDate, no: o.orderNo, partner: o.partnerName, item: l.itemName,
          qty: Number(l.quantity), price: Number(l.unitPrice), supply: Number(l.supplyAmount), vat: Number(l.vatAmount), status: o.status })
      } else {
        out.push({ key: `${o.id}`, date: o.orderDate, no: o.orderNo, partner: o.partnerName,
          item: `${lines[0].itemName}${lines.length > 1 ? ` 외 ${lines.length - 1}건` : ''}`,
          qty: lines.reduce((a, l) => a + Number(l.quantity), 0), price: null,
          supply: lines.reduce((a, l) => a + Number(l.supplyAmount), 0), vat: lines.reduce((a, l) => a + Number(l.vatAmount), 0), status: o.status })
      }
    }
    return out.filter((r) => zero === '전체' || (zero === '수량0') === (r.qty === 0))
  }, [orders, from, to, warehouse, project, partner, item, unit, zero, tab])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '발주계획조회', [rows.length])

  const radios = <T extends string>(name: string, opts: readonly T[], v: T, set: (x: T) => void) => opts.map((o) => (
    <label key={o} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="radio" name={name} checked={v === o} onChange={() => set(o)} /> {o}
    </label>
  ))

  return (
    <EcListShell
      title="발주계획조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setWarehouse(''); setProject(''); setPartner(''); setItem(''); setUnit('건별'); setZero('전체') } },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
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

      <div className="flex gap-[2px] mb-[8px]">
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: tab === t ? 'var(--ec-blue)' : '#fff', color: tab === t ? '#fff' : 'var(--ec-text)', fontWeight: tab === t ? 700 : 400,
          }}>{t}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="text-center">일자-No.</th>
            <th>거래처코드명</th>
            <th>품목명</th>
            <th className="text-right">수량</th>
            <th className="text-right">단가</th>
            <th className="text-right">금액</th>
            <th className="text-right">부가세</th>
            <th className="text-right">합계</th>
            <th className="text-center">종결여부</th>
            <th className="text-center">진행상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.key}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center">{dateText(r.date)} {r.no}</td>
              <td>{r.partner}</td>
              <td>{r.item}</td>
              <td className="text-right">{qty(r.qty)}</td>
              <td className="text-right">{r.price == null ? '' : won(r.price)}</td>
              <td className="text-right">{won(r.supply)}</td>
              <td className="text-right">{won(r.vat)}</td>
              <td className="text-right">{won(r.supply + r.vat)}</td>
              <td className="text-center">{done(r.status) ? '종결' : ''}</td>
              <td className="text-center">{done(r.status) ? '완료' : '진행중'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
