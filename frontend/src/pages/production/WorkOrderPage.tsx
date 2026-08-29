import { useEffect, useState, type FormEvent, useRef} from 'react'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Warehouse, WorkOrder } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import Modal from '../../components/Modal'
import { Link } from 'react-router-dom'
import { printDocuments } from '../../utils/printDocument'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'

const inputCls = 'ec-input'

/**
 * 원본 작업지시서조회의 탭 실측(사본): 전체 · 결재중 · 미확인 · 확인 · 진행중 · 완료.
 * 결재중·미확인·확인은 결재/확인 흐름이 작업지시에 없어 만들지 않는다 —
 * 눌러도 늘 빈 목록인 탭은 있는 것만 못하다.
 */
const TABS = ['전체', '대기', '진행중', '완료'] as const
type Tab = typeof TABS[number]
const TAB_STATUS: Record<string, string> = { 대기: 'PLANNED', 진행중: 'IN_PROGRESS', 완료: 'COMPLETED' }

/**
 * 원본 작업지시서조회의 마지막 세 열은 그 지시의 현황으로 가는 <b>바로가기</b>다
 * (작업지시서별불출현황 · 작업지시서별생산현황 · 작업지시서별작업현황).
 * 우리 화면에는 지시를 골라 놓고 그 지시가 어떻게 굴러갔는지 볼 길이 없었다.
 */
const LINKS = [
  { label: '불출', to: '/production/issue-status', title: '작업지시서별불출현황' },
  { label: '생산', to: '/production/receipt-status', title: '작업지시서별생산현황' },
  { label: '작업', to: '/production/work-result-status', title: '작업지시서별작업현황' },
]

const today = () => ymd(new Date())

/**
 * 원본 작업지시서조회 격자의 마지막 열 <b>[인쇄]</b> — 그 지시 한 건을 작업지시서로 찍는다.
 * 작업지시에는 금액이 없다(무엇을 얼마나 만들라는 지시다) — 금액 칸을 안 그린다.
 */
async function printOne(o: WorkOrder, empName: (id: number | null) => string) {
  await printDocuments([{
    title: '작 업 지 시 서',
    docNo: o.orderNo,
    docDate: o.orderDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '납품처', value: o.partnerName },
      { label: '담당자', value: o.employeeId ? empName(o.employeeId) : null },
      { label: '창고', value: o.warehouseName },
      { label: '납기일자', value: o.dueDate },
      { label: '진행상태', value: o.statusName },
    ],
    remark: o.remark,
    lines: [{
      itemCode: o.productCode, itemName: o.productName, unit: o.productUnit,
      quantity: o.plannedQty, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
    }],
  }])
}

const statusColor = (s: string) =>
  s === 'COMPLETED' ? '#1c7c3c' : s === 'IN_PROGRESS' ? '#b6791b' : '#7a828c'

/** 원본은 일자와 번호를 '2026/07/16 -1' 로 한 칸에 적는다(판매조회·견적서와 같은 규칙). */
const dateNo = (o: { orderDate: string; orderNo: string }) => {
  const seq = o.orderNo.split('-').pop() ?? ''
  return `${o.orderDate.replace(/-/g, '/')} -${Number(seq) || seq}`
}

/*
 * 원본 작업지시서조회는 <b>기준일자</b>를 들고 [최근30일(+1개월)] 로 열린다(사본 실측 —
 * 달 스핀박스가 06·08 셋이라 앞으로 한 달까지 본다). 작업지시는 <b>앞으로 할 일</b>이라
 * 오늘까지만 보면 아직 안 온 납기의 지시가 빠진다.
 * 
 * <p>우리는 기간 칸이 <b>아예 없어서</b> 지시가 쌓이면 목록만 길어졌다.
 */
const initP = periodOf('최근30일(+1개월)')!

export default function WorkOrderPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    productId: '', warehouseId: '', plannedQty: '', orderDate: today(), dueDate: '',
    partnerId: '', employeeId: '', remark: '',
  })
  const [tab, setTab] = useState<Tab>('전체')
  /*
   * 원본 작업지시서조회의 조건 차례는 <b>작업지시No. · 창고 · 거래처 · 품목</b> 이다
   * (사본 실측). 거래처·품목이 없었는데 둘 다 이미 목록에 실려 오고 있었다.
   */
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const condPickers = useCondPickers(['partners', 'items', 'warehouses'])
  /* 원본 작업지시서조회 조건 차례: 작업지시No. · <b>창고</b> · 거래처 · 품목.
     창고는 목록에 찍히는데 그것으로 거를 수가 없었다. */
  const [whCond, setWhCond] = useState('')
  /* 원본 조건 차례의 맨 앞 <b>[작업지시No.]</b>. 번호를 알아도 눈으로 찾아야 했다. */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [orderNoCond, setOrderNoCond] = useState('')
  /** 납품처·담당자. 담당자 이름은 서버가 못 붙여서 여기서 붙인다. */
  const [partners, setPartners] = useState<{ id: number; code: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: number; code: string; name: string }[]>([])

  async function load() {
    setLoading(true)
    try {
      const [o, i, w, pt, emp] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ id: number; code: string; name: string }[]>('/partners'),
        api.get<{ id: number; code: string; name: string }[]>('/employees'),
      ])
      setOrders(o.data)
      setItems(i.data)
      setWarehouses(w.data)
      setPartners(pt.data)
      setEmployees(emp.data)
      setForm((f) => ({ ...f, warehouseId: f.warehouseId || (w.data[0] ? String(w.data[0].id) : '') }))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다 — 지워진 사원이면 빈칸이다. */
  const empName = (id: number | null) =>
    id == null ? '-' : (employees.find((x) => x.id === id)?.name ?? '-')

  const shown = orders.filter((o) => (tab === '전체' || o.status === TAB_STATUS[tab])
    && (!from || o.orderDate >= from) && (!to || o.orderDate <= to)
    && (!orderNoCond || o.orderNo.includes(orderNoCond))
    && (!whCond || o.warehouseName === whCond)
    && (!partnerCond || (o.partnerName ?? '').includes(partnerCond))
    && (!itemCond || o.productName.includes(itemCond)))

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.productId) return setError('제품을 선택하세요.')
    try {
      await api.post('/work-orders', {
        productId: Number(form.productId),
        warehouseId: Number(form.warehouseId),
        plannedQty: Number(form.plannedQty),
        orderDate: form.orderDate,
        dueDate: form.dueDate || undefined,
        partnerId: form.partnerId ? Number(form.partnerId) : null,
        employeeId: form.employeeId ? Number(form.employeeId) : null,
        remark: form.remark || undefined,
      })
      setForm((f) => ({ ...f, productId: '', plannedQty: '', dueDate: '', partnerId: '', employeeId: '', remark: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    지시번호: (o) => o.orderNo,
  })


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '작업지시서조회', [])

  return (
    <EcListShell
      title="작업지시서조회"
      onNew={() => setShowForm(true)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="ec-pills" style={{ marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* 원본 조건 차례: 작업지시No. · 창고 · 거래처 · 품목 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 첫째 <b>[기준일자]</b> — 단추는 조회 묶음(…·종료일)이다(사본 실측). */}
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="작업지시No.">
          <input className="ec-input" value={orderNoCond} placeholder="작업지시No."
                 onChange={(e) => setOrderNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={condPickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={condPickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={condPickers.items} />
        </EcCond>
      </ul>

      <Modal open={showForm} title="작업지시 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 작업지시</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">제품 *</label>
              <CodePickerField label="제품" hideLabel fill placeholder="선택하세요" emptyLabel="선택 해제"
                               value={form.productId} onChange={(v) => set('productId', v)}
                               items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">창고 *</label>
              {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측 525칸, 예외 없음) — 드롭다운은 항목이 늘면 못 찾는다. */}
              <CodePickerField label="창고 *" hideLabel fill placeholder="창고"
                               emptyLabel="선택"
                               value={form.warehouseId} onChange={(v) => set('warehouseId', v)}
                               items={warehouses.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">지시수량 *</label>
              <input type="number" step="any" className={inputCls} value={form.plannedQty} onChange={(e) => set('plannedQty', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">일자</label>
              <input type="date" className={inputCls} value={form.orderDate} onChange={(e) => set('orderDate', e.target.value)} />
            </div>
            {/* 원본 작업지시서입력 머리: 작업지시No. · 일자 · 납품처 · 담당자 · 납기일자 */}
            <div>
              <label className="mb-1 block text-sm text-slate-600">납품처</label>
              {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측) — 창고·거래처·사원은
                  몇백 개가 되므로 드롭다운으로는 코드로도 이름으로도 못 찾는다. */}
              <CodePickerField label="납품처" hideLabel fill placeholder="납품처" emptyLabel="선택 안 함"
                               value={form.partnerId} onChange={(v) => set('partnerId', v)}
                               items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측) — 창고·거래처·사원은
                  몇백 개가 되므로 드롭다운으로는 코드로도 이름으로도 못 찾는다. */}
              <CodePickerField label="담당자" hideLabel fill placeholder="담당자" emptyLabel="선택 안 함"
                               value={form.employeeId} onChange={(v) => set('employeeId', v)}
                               items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">납기일자</label>
              <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">비고</label>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}</Modal>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/*
              원본 작업지시서조회의 첫 칸은 <b>[일자-No.]</b> 다 — 일자와 번호를 한 칸에 적는다.
              우리는 번호를 맨 앞에, 일자를 저 뒤 [지시일] 로 따로 두어 <b>차례가 어긋나</b> 있었다.
              작업지시서현황에서 이미 같은 방식으로 합쳐 두었으니 여기도 맞춘다.
            */}
            <th style={{ cursor: 'pointer', width: 170 }} onClick={() => sort.toggle('지시번호')}>일자-No. {sort.mark('지시번호')}</th>
            {/* 원본 작업지시서조회의 이름은 [거래처명]·[담당자명]·[생산수량] 이다(사본 실측). */}
            <th>거래처명</th>
            <th style={{ width: 90 }}>담당자명</th>
            {/* 원본 차례는 거래처명 · 담당자명 · <b>납기일자</b> · 품목명[규격] · 지시수량 · 생산수량 이다. */}
            <th style={{ width: 100 }}>납기일자</th>
            {/*
              원본 차례는 납기일자 <b>다음</b>이 [작업지시No.] 다(사본 실측).
              [일자-No.] 와 다른 칸이다 — 그쪽은 <b>그날 몇 번째</b>인지(2026/07/16 -1)이고
              이쪽은 전표번호 전체다. 우리는 [일자-No.] 한 칸에 날짜와 전표번호를 <b>붙여
              찍고</b> 있어서, 원본을 쓰던 사람이 번호로 훑을 때 눈이 걸렸다.
            */}
            <th style={{ width: 150 }}>작업지시No.</th>
            <th>품목명[규격]</th>
            <th>창고</th>
            <th style={{ textAlign: 'right' }}>지시수량</th>
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>잔여</th>
            {/* 원본의 이름은 [상태]가 아니라 <b>[진행상태]</b> 다(사본 실측). */}
            <th style={{ textAlign: 'center' }}>진행상태</th>
            {/*
              원본은 여기를 <b>세 칸</b>으로 나눈다 — [작업지시서별불출현황]·[작업지시서별생산현황]·
              [작업지시서별작업현황] 이 각각 55px 열이다(사본 실측). 우리는 셋을 한 칸([현황])에
              가운뎃점으로 이어 붙여 두었어서, 열을 세어도 원본과 수가 달랐다.
            */}
            <th style={{ width: 56, textAlign: 'center' }}>작업지시서별불출현황</th>
            <th style={{ width: 56, textAlign: 'center' }}>작업지시서별생산현황</th>
            <th style={{ width: 56, textAlign: 'center' }}>작업지시서별작업현황</th>
            {/* 원본 작업지시서조회의 마지막 열 [인쇄] — 그 지시 한 건을 작업지시서로 찍는다. */}
            <th style={{ width: 60, textAlign: 'center' }}>인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={16} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={16} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : (
            sort.sorted.map((o, idx) => (
              <tr key={o.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateNo(o)}</td>
                <td style={{ color: o.partnerName ? undefined : '#c9ced6' }}>{o.partnerName ?? ''}</td>
                <td style={{ color: o.employeeId ? undefined : '#c9ced6' }}>{empName(o.employeeId)}</td>
                {/* 원본은 이름과 규격을 한 칸에 적는다 — productSpec 은 응답에 오는데 안 쓰고 있었다. */}
                <td style={{ color: o.dueDate ? undefined : '#c9ced6' }}>{dateText(o.dueDate) || ''}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue-dark)' }}>{o.orderNo}</td>
                <td>{o.productName}{o.productSpec ? ` [${o.productSpec}]` : ''}</td>
                <td>{o.warehouseName}</td>
                <td style={{ textAlign: 'right' }}>{o.plannedQty.toLocaleString()} {o.productUnit}</td>
                <td style={{ textAlign: 'right' }}>{o.producedQty.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{o.remainingQty.toLocaleString()}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(o.status), fontWeight: 600 }}>{o.statusName}</span></td>
                {LINKS.map((l) => (
                  <td key={l.to} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <Link to={l.to} title={l.title} style={{ color: 'var(--ec-blue)' }}>{l.label}</Link>
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => printOne(o, empName)} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}
