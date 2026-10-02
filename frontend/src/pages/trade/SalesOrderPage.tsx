import { resolveSpecialPrice } from '../../features/price/specialPrice'
import { useEffect, useMemo, useState, type FormEvent, useRef} from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Item, Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { partnerCodeItems } from '../../utils/codeItems'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import EcPeriodPicks, { ORDER_LIST_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { dateText } from '../../utils/dateText'

type OrderStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
const STATUS_LABEL: Record<OrderStatus, string> = { RECEIVED: '접수', IN_PROGRESS: '진행중', COMPLETED: '완료', CANCELED: '취소' }
const STATUS_COLOR: Record<OrderStatus, string> = { RECEIVED: 'var(--ec-warn)', IN_PROGRESS: 'var(--ec-blue)', COMPLETED: 'var(--ec-success)', CANCELED: 'var(--ec-text-hint)' }
const NEXT: Record<OrderStatus, OrderStatus | null> = { RECEIVED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: null, CANCELED: null }

interface OrderLine { itemId: number; itemName: string; unit: string; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }
interface SalesOrder {
  id: number; orderNo: string; partnerId: number; partnerName: string
  orderDate: string; dueDate: string | null; status: OrderStatus; statusName: string
  /** 수주의 [창고]·[프로젝트]·[담당자]. 견적에서 전환하면 그 값이 따라온다. */
  warehouseId?: number | null
  warehouseName: string | null
  projectId?: number | null
  projectName: string | null
  /** 원본 [기타]의 [수정일자순(정렬)] 축. */
  updatedAt?: string | null
  employeeName: string | null
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null; lines: OrderLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())
interface LineInput { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '' })

/**
 * 오더관리(수주) — 원본 영업관리 &gt; 주문서 &gt; <b>주문서조회</b>(E040204) 자리. 2026-10-03 loginaa 실측(자료가 든 판):
 * 기간 기본 <b>최근30일(+1개월)</b>, 열 일자-No. · 거래처명 · 사원(담당)명 · 품목명 · 납기일자 · 주문금액합계 · 진행상태 · 생성한전표 · 인쇄,
 * 위 탭 전체 · 결재중 · C-Portal · 미확인 · 확인 · 진행중 · 완료. 우리 상태 탭은 접수 · 진행중 · 완료 · 취소다(결재 · 확인 단계가 없다).
 * 창고 · 프로젝트는 원본 목록에 없는 열이지만 수주에서 정한 값을 볼 데가 여기뿐이라 뒤에 남긴다.
 */
export default function SalesOrderPage() {
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  /* 원본 조건 [창고] · [프로젝트] · [거래처] · [품목코드] · [기타](수정일자순). */
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL')

  const [partnerId, setPartnerId] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [dueDate, setDueDate] = useState('')
  const [taxable, setTaxable] = useState(true)
  const [remark, setRemark] = useState('')
  const [fWarehouse, setFWarehouse] = useState('')
  const [fProject, setFProject] = useState('')
  const [fEmployee, setFEmployee] = useState('')
  const pickers = useCondPickers(['warehouses', 'projects', 'employees', 'partners', 'items'])
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])
  /** 줄의 품목 코드도움 — 코드·이름·검색어로 찾고 규격을 옆에 보인다. 사용중단 품목은 뺀다. */
  const itemPicks = useMemo(() => items.filter((it) => it.active !== false)
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword })), [items])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])

  async function load() {
    try {
      const [o, p, i] = await Promise.all([
        api.get<SalesOrder[]>('/sales-orders', { params: { from, to } }),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
      ])
      setOrders(o.data); setPartners(p.data); setItems(i.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value) {
        const it = itemById.get(value)
        if (it && !next[idx].unitPrice) next[idx] = { ...next[idx], unitPrice: String(it.unitPrice) }
        if (!next[idx].quantity) next[idx] = { ...next[idx], quantity: '1' }
        // 거래처의 특별단가가 있으면 덮는다(50회차 — 수주는 특별단가를 몰랐다).
        void resolveSpecialPrice('SALES', value, partnerId).then((p) => {
          if (p != null) setLines((cur) => cur.map((l, i) => (i === idx ? { ...l, unitPrice: String(p) } : l)))
        })
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }

  const computed = lines.map((l) => {
    const supply = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)
    const vat = taxable ? Math.round(supply * 0.1) : 0
    return { supply, vat, total: supply + vat }
  })
  const totals = computed.reduce((a, c) => ({ supply: a.supply + c.supply, vat: a.vat + c.vat, total: a.total + c.total }), { supply: 0, vat: 0, total: 0 })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (validLines.length === 0) return setError('품목·수량·단가를 1줄 이상 입력하세요.')
    try {
      const res = await api.post<SalesOrder>('/sales-orders', {
        partnerId: Number(partnerId), orderDate, dueDate: dueDate || undefined,
        warehouseId: fWarehouse ? Number(fWarehouse) : undefined,
        projectId: fProject ? Number(fProject) : undefined,
        employeeId: fEmployee ? Number(fEmployee) : undefined,
        taxable, remark: remark || undefined, lines: validLines,
      })
      setOk(`${res.data.orderNo} 수주 등록 완료 (합계 ${won(res.data.totalAmount)}원)`)
      setLines([emptyLine()]); setRemark(''); setDueDate('')
      setFWarehouse(''); setFProject(''); setFEmployee('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function advance(o: SalesOrder) {
    const next = NEXT[o.status]
    if (!next) return
    try { await api.patch(`/sales-orders/${o.id}/status`, { status: next }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function cancel(o: SalesOrder) {
    if (!confirm(`${o.orderNo} 주문을 취소할까요?`)) return
    try { await api.patch(`/sales-orders/${o.id}/status`, { status: 'CANCELED' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(o: SalesOrder) {
    if (!confirm(`${o.orderNo} 주문을 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await api.delete(`/sales-orders/${o.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shownRows = orders
    .filter((o) => statusFilter === 'ALL' || o.status === statusFilter)
    .filter((o) => !whCond || String(o.warehouseId) === whCond)
    .filter((o) => !projCond || String(o.projectId) === projCond)
    .filter((o) => !partnerCond || String(o.partnerId) === partnerCond)
    .filter((o) => !itemCond || o.lines.some((l) => String(l.itemId) === itemCond))
    .filter((o) => !keyword || o.partnerName.includes(keyword) || o.orderNo.includes(keyword))

  /* 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(shownRows, {
    수주일: (o) => o.orderDate,
    거래처: (o) => o.partnerName,
  })
  /* [수정일자순]을 켜면 고친 시각이 늦은 것부터 — 머리 정렬보다 먼저다(원본도 조건 판에서 고른다). */
  const shown = byUpdated ? [...shownRows].sort((a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 0)) : sort.sorted

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: 'var(--ec-bg-page)', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '주문서조회', [])

  return (
    <EcListShell
      title="주문서조회"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '수주등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-ec-hint">매출처로부터 받은 주문(수주) 관리 · 접수 → 진행중 → 완료. 실제 출고는 판매입력에서.</p>

      <Modal open={showForm} title="주문서입력" width={900} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10 }}>
          <table className="w-full text-left mb-[8px] max-w-[820px]">
            <tbody>
              <tr>
                <th style={th}>매출처 *</th>
                <td>
                  {/* 긴 드롭다운이었다 — 4회차에 다른 입력 화면 15곳은 코드도움으로 바꿨는데 여기만 남아 있었다(9회차). */}
                  <CodePickerField label="매출처" hideLabel width={240} emptyLabel="선택 안 함" placeholder="매출처 선택"
                                   value={partnerId} onChange={(v) => {
                                     // 거래처를 고르면 담긴 품목의 특별단가를 다시 찾는다(품목을 먼저 담아도 걸리게).
                                     setPartnerId(v)
                                     lines.forEach((l, i) => {
                                       if (l.itemId) void resolveSpecialPrice('SALES', l.itemId, v).then((p) => {
                                         if (p != null) setLines((cur) => cur.map((x, j) => (j === i ? { ...x, unitPrice: String(p) } : x)))
                                       })
                                     })
                                   }}
                                   items={partnerCodeItems(customers)} />
                </td>
                <th style={th}>부가세</th>
                <td>
                  <select className={inputCls} value={taxable ? 'Y' : 'N'} onChange={(e) => setTaxable(e.target.value === 'Y')} style={{ width: 120 }}>
                    <option value="Y">과세 (10%)</option><option value="N">면세</option>
                  </select>
                </td>
              </tr>
              <tr>
                {/*
                  수주의 [창고]·[프로젝트]·[담당자]. 견적에서 전환하면 그 값이 따라오는데,
                  <b>수주를 직접 만들면 정할 데가 없어</b> 미출하현황의 그 조건들이 헛돌았다.
                */}
                <th style={th}>창고</th>
                <td>
                  <CodePickerField label="창고" hideLabel width={170} emptyLabel="선택 안 함"
                                   value={fWarehouse} onChange={setFWarehouse}
                                   items={pickers.warehouses} />
                </td>
                <th style={th}>프로젝트</th>
                <td>
                  <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="선택 안 함"
                                   value={fProject} onChange={setFProject}
                                   items={pickers.projects} />
                </td>
              </tr>
              <tr>
                <th style={th}>담당자</th>
                <td>
                  <CodePickerField label="담당자" hideLabel width={170} emptyLabel="선택 안 함"
                                   value={fEmployee} onChange={setFEmployee}
                                   items={pickers.employees.map((x) => ({ ...x, value: String(x.id) }))} />
                </td>
                <td colSpan={2}></td>
              </tr>
              <tr>
                <th style={th}>수주일자</th>
                <td><input type="date" className={inputCls} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>납기일자</th>
                <td><input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
            </tbody>
          </table>

          <table ref={tableRef} className="w-full text-left table-fixed">
            <thead>
              <tr>
                <th className="w-[34px]"></th><th>품목</th>
                <th className="w-[110px] text-right">수량</th>
                <th className="w-[130px] text-right">단가</th>
                <th className="w-[130px] text-right">공급가액</th>
                <th className="w-[110px] text-right">부가세</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td className="text-center text-ec-hint">{idx + 1}</td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                                     value={String(l.itemId)} onChange={(v) => updateLine(idx, 'itemId', v)}
                                     items={itemPicks} />
                  </td>
                  <td><input type="number" className={`${inputCls} text-right`} style={{ width: '100%' }} value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} /></td>
                  <td><input type="number" className={`${inputCls} text-right`} style={{ width: '100%' }} value={l.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)} /></td>
                  <td className="text-right">{won(computed[idx].supply)}</td>
                  <td className="text-right text-ec-hint">{won(computed[idx].vat)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold bg-ec-page">
                <td colSpan={4} className="text-right">합계</td>
                <td className="text-right">{won(totals.supply)}</td>
                {/* 부가세 열 아래에 부가세 포함 합계가 서 있었다(23회차) — 열마다 제 합을, 총액은 따로 한 줄. */}
                <td className="text-right">{won(totals.vat)}</td>
              </tr>
              <tr className="font-bold bg-ec-page">
                <td colSpan={4} className="text-right">합계금액 (부가세 포함)</td>
                <td colSpan={2} className="text-right text-ec-blue">{won(totals.total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-[8px] flex items-center gap-[8px]">
            <input className={inputCls} placeholder="비고" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ flex: 1, maxWidth: 400 }} />
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
          </div>
          {error && <p className="mt-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}
          {ok && <p className="mt-2 rounded bg-ec-success-bg px-3 py-2 text-sm text-ec-success">{ok}</p>}
        </form>
      )}</Modal>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={ORDER_LIST_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      {/* 상태 필터 */}
      <div className="flex gap-[2px] mb-[8px]">
        {(['ALL', 'RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: statusFilter === s ? 'var(--ec-blue)' : '#fff', color: statusFilter === s ? '#fff' : 'var(--ec-text)', fontWeight: statusFilter === s ? 700 : 400,
          }}>{s === 'ALL' ? '전체' : STATUS_LABEL[s]} ({s === 'ALL' ? orders.length : orders.filter((o) => o.status === s).length})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            {/* 원본 주문서조회 차례: 일자-No. · 거래처명 · 사원(담당)명 · 품목명 · 납기일자 · 주문금액합계 · 진행상태 (2026-10-03 실측). */}
            <th className="cursor-pointer" onClick={() => sort.toggle('수주일')}>일자-No. {sort.mark('수주일')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('거래처')}>거래처명 {sort.mark('거래처')}</th>
            <th className="w-[90px]">사원(담당)명</th><th>품목명</th><th>납기일자</th>
            <th className="text-right">주문금액합계</th>
            <th className="text-center">진행상태</th>
            {/* 정할 수는 있는데 <b>목록에서 볼 수가 없으면</b> 반쪽이다 — 안 정한 수주는 빈칸이다. */}
            <th className="w-[100px]">창고</th><th className="w-[110px]">프로젝트</th>
            <th className="text-center">처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o, i) => (
            <tr key={o.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{dateText(o.orderDate)} {o.orderNo}</td>
              <td>{o.partnerName}</td>
              <td>{o.employeeName ?? ''}</td>
              <td>{o.lines[0]?.itemName}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td>{dateText(o.dueDate) || ''}</td>
              <td className="text-right">{won(o.totalAmount)}</td>
              <td style={{ textAlign: 'center', color: STATUS_COLOR[o.status], fontWeight: 700 }}>{o.statusName}</td>
              <td className="text-ec-label">{o.warehouseName ?? ''}</td>
              <td className="text-ec-label">{o.projectName ?? ''}</td>
              <td className="text-center whitespace-nowrap">
                {NEXT[o.status] && <button className="no-ec" onClick={() => advance(o)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>→ {STATUS_LABEL[NEXT[o.status]!]}</button>}
                {o.status !== 'COMPLETED' && o.status !== 'CANCELED' && <button className="no-ec" onClick={() => cancel(o)} style={{ border: 'none', background: 'none', color: 'var(--ec-danger)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>취소</button>}
                <button className="no-ec" onClick={() => remove(o)} style={{ border: 'none', background: 'none', color: 'var(--ec-danger)', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
