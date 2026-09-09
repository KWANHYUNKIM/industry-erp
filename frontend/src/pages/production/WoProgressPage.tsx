import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { useItemFlags } from '../../utils/useInactiveItems'
import { dateText } from '../../utils/dateText'

/**
 * 생산관리 > 작업지시서별진행현황 — 작업지시 하나가 어디까지 갔는지 네 갈래로 본다.
 *
 * <p><b>2026-09-09 원본(E040414) 실측 — 조건은 스물아홉이다</b>(사본은 열하나였다).
 * 빠져 있던 열여덟 가운데 여덟은 그 자리에서 만들었다 — 거래처그룹1 · 품목코드(하위품목) ·
 * 품목구분 · 품목그룹1 · 납기일자 · 적요 · 진행상태 · 최초작성자.
 * <b>뒤 넷은 서버가 이미 보내던 값</b>인데(WorkOrderResponse 의 dueDate·remark·
 * statusName·createdBy) 이 화면이 받아 두지 않아 걸 수가 없었다 — 값이 없어서가 아니다.
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 생산진행현황 | 불출진행현황 | 원재료투입비교표 | 작업진행현황
 *   기준일(영업주기)(금월(~오늘)) · 작업지시No. · 창고 · 거래처 · 품목 · 담당자
 *
 * <p>우리 화면은 <b>생산진행 하나</b>뿐이었고 조건 판도 없었다. 작업지시 444건이 통째로
 * 쏟아졌고, "자재는 얼마나 나갔나"·"BOM 대로 들어갔나"·"작업은 얼마나 됐나" 는
 * 아예 볼 수가 없었다.
 *
 * <p>네 갈래를 각각 다른 자료로 만든다:
 *   생산진행    /work-orders 의 지시·생산·잔여
 *   불출진행    /material-issues 를 작업지시로 모은다
 *   원재료투입  BOM 소요(지시수량 × BOM 수량) vs 실제 투입(불출 + 생산전표의 소모자재)
 *   작업진행    /work-results 를 작업지시로 모은다
 *
 * <p>[거래처]·[담당자]는 예전에 "작업지시에 그 값이 없어" 만들지 않았는데, 이제 있다
 * (원본 작업지시서입력 머리의 [납품처]·[담당자]). 담당자 <b>이름</b>은 서버가 못 붙인다 —
 * production 은 hr 을 참조할 수 없어(hr → accounting → production 순환) id 만 온다.
 *
 * <p>[거래처관리담당자]는 거래처 마스터의 담당자를 보는 조건이다. 작업지시에서 거래처를
 * 타고 그 값을 받아 와야 해서 미뤄 뒀는데, 거래처 목록을 한 번 더 받아 <b>거래처명 →
 * 담당자</b> 로 이으면 된다. 작업지시에 담당자 id 를 새로 달 필요는 없다.
 *
 * <p>작업지시의 [담당자](사원)와 <b>다른 값</b>이다 — 이쪽은 그 거래처를 맡은 영업담당자다.
 * 둘을 한 조건으로 합치면 "누구 것을 보는가" 가 뒤섞인다.
 */
type Mode = '생산진행현황' | '불출진행현황' | '원재료투입비교표' | '작업진행현황'
const MODES = ['생산진행현황', '불출진행현황', '원재료투입비교표', '작업진행현황'] as const

type WoStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'
interface WorkOrder {
  id: number
  orderNo: string
  orderDate: string
  productId: number
  productCode: string
  productName: string
  productUnit: string
  warehouseId: number
  warehouseName: string
  /**
   * 납품처·담당자. 원본 조건 판의 [거래처]·[담당자]가 이 값을 본다.
   * 예전에는 작업지시에 그 값이 없어 두 조건을 만들 수 없었다.
   * 담당자 <b>이름</b>은 서버가 못 붙인다 — production 은 hr 을 참조할 수 없다.
   */
  partnerName: string | null
  employeeId: number | null
  plannedQty: number
  producedQty: number
  remainingQty: number
  status: WoStatus
  statusName: string
  /*
   * 아래 넷은 <b>서버가 진작 보내고 있었는데</b> 이 화면이 받아 두지 않았다
   * (WorkOrderResponse 의 productCategoryName · dueDate · remark · createdBy).
   * 그래서 원본 조건 [품목구분]·[납기일자]·[적요]·[최초작성자]를 걸 축이 없었다 —
   * 값이 없어서가 아니라 <b>받아 두지 않아서</b> 못 걸던 것이다.
   */
  productCategoryName: string | null
  dueDate: string | null
  remark: string | null
  createdBy: string | null
}
interface Issue { id: number; workOrderId: number; itemId: number; itemCode: string; itemName: string; qty: number; issueDate: string }
/** 생산전표의 소모자재. 필드 이름이 불출(itemId)과 달리 componentId 다 — 실제 응답을 보고 맞췄다. */
interface ProdMaterial { componentId: number; componentCode: string; componentName: string; quantity: number }
/*
 * 생산전표. 원본 격자의 <b>[생산]</b> 네 칸(공장·생산공정·일자·수량)이 이 줄을 본다.
 * <code>fromWarehouseName</code>(생산된공장)·<code>prodNo</code>·<code>productId</code> 는
 * <b>서버가 진작 보내던 값</b>인데 이 화면이 받아 두지 않아 그 네 칸을 못 그리고 있었다.
 */
interface Production {
  id: number; prodNo: string; workOrderId: number; productId: number
  productionDate: string; producedQty: number
  fromWarehouseName: string | null; warehouseName: string
  materials: ProdMaterial[]
}
/** BOR(작업소요시간) 한 줄 — 품목이 <b>어느 생산공정</b>에서 만들어지는지가 여기 있다. */
interface BorRow { productId: number; processName: string; seq: number }
/** 창고별 재고 한 줄. 원본 격자의 [현재고]는 창고를 가리지 않은 <b>품목 합</b>이다. */
interface StockRow { itemId: number; quantity: number }
interface WorkResult { id: number; workOrderId: number | null; process: string; goodQty: number; defectQty: number; workTimeMin: number; workDate: string }
interface BomLine { componentId: number; componentCode: string; componentName: string; quantity: number }
interface Bom { productId: number; lines: BomLine[] }

const num = (n: number) => n.toLocaleString('ko-KR')

export default function WoProgressPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'partners', 'warehouses', 'employees'])
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다 —
   * 결재를 안 받을 자료까지 도장칸을 달고 나가면 종이가 한 칸씩 밀린다.
   */
  const [signBox, setSignBox] = useState(false)
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [results, setResults] = useState<WorkResult[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [bors, setBors] = useState<BorRow[]>([])
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [mode, setMode] = useState<Mode>('생산진행현황')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [orderNo, setOrderNo] = useState('')
  const [item, setItem] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  /** 원본 [거래처관리담당자]. 거래처 마스터의 담당자다 — 작업지시의 담당자(사원)와 다르다. */
  const [partnerManager, setPartnerManager] = useState('')
  const [managerOf, setManagerOf] = useState<Map<string, string>>(new Map())
  const [emp, setEmp] = useState('')
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])
  /*
   * 2026-09-09 원본(E040414) 실측으로 드러난 조건들. 아래는 <b>줄이 이미 들고 있는 값</b>이라
   * 그 자리에서 만들 수 있었다 — 지어낸 것은 하나도 없다.
   */
  const [partnerGroup, setPartnerGroup] = useState('')
  const pgroup = usePartnerGroups()
  const [category, setCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const { categoryOf, groupOf, categories, groups } = useItemFlags()
  /** 원본 [품목코드(하위품목)] — 그 <b>자재를 쓰는</b> 작업지시만 본다. BOM 을 이미 받아 두었다. */
  const [component, setComponent] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  /**
   * 원본 [진행상태]는 <b>결재 상태</b>(전체·결재중·미확인·확인)이고 <b>[확인]만 켜져</b> 있다.
   * 우리 작업지시의 진행상태는 <b>생산 진척</b>(계획·진행·완료)이라 <b>다른 축</b>이다 —
   * 우리 값에 '확인' 이 없으므로 기본값을 원본과 맞출 길이 없다. 지어내지 않고 [전체]로 둔다.
   */
  const [statusCond, setStatusCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [wo, mi, pr, wr, bm, emps, parts, br, st] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders'),
        api.get<Issue[]>('/material-issues'),
        api.get<Production[]>('/productions'),
        api.get<WorkResult[]>('/work-results'),
        api.get<Bom[]>('/boms'),
        api.get<{ id: number; name: string }[]>('/employees'),
        api.get<{ name: string; manager: string | null }[]>('/partners'),
        /* 원본 격자의 [생산공정]·[현재고]. 둘 다 이미 있는 자료인데 안 받아 오고 있었다. */
        api.get<BorRow[]>('/bor'),
        api.get<StockRow[]>('/stock'),
      ])
      setOrders(wo.data); setIssues(mi.data); setProductions(pr.data)
      setResults(wr.data); setBoms(bm.data); setEmployees(emps.data)
      setBors(br.data); setStocks(st.data)
      // 거래처명 → 관리담당자. 작업지시에는 거래처명만 오므로 이름으로 잇는다.
      setManagerOf(new Map(parts.data.map((p) => [p.name, p.manager ?? ''])))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setMode('생산진행현황'); setOrderNo(''); setItem(''); setWarehouse('')
    setPartner(''); setPartnerManager(''); setEmp('')
    setPartnerGroup(''); setCategory(''); setItemGroup(''); setComponent('')
    setDueFrom(''); setDueTo(''); setRemarkCond(''); setStatusCond(''); setAuthorCond('')
  }

  /** 품목 → 그 품목의 BOM 자재 이름들. [품목코드(하위품목)] 이 이 값을 본다. */
  const bomOf = useMemo(() => {
    const m = new Map<number, string>()
    for (const b of boms) {
      m.set(b.productId, b.lines.map((l) => `${l.componentCode} ${l.componentName}`).join(' | '))
    }
    return m
  }, [boms])

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다. */
  const empName = (id: number | null) =>
    id == null ? '' : (employees.find((x) => x.id === id)?.name ?? '')

  const shown = useMemo(() => orders.filter((o) => {
    if (o.orderDate < from || o.orderDate > to) return false
    if (orderNo && !o.orderNo.includes(orderNo)) return false
    if (item && !`${o.productCode} ${o.productName}`.includes(item)) return false
    if (warehouse && !(o.warehouseName ?? '').includes(warehouse)) return false
    if (partner && !(o.partnerName ?? '').includes(partner)) return false
    if (partnerManager
      && !(managerOf.get(o.partnerName ?? '') ?? '').includes(partnerManager)) return false
    if (emp && !empName(o.employeeId).includes(emp)) return false
    if (partnerGroup && pgroup.groupOfName(o.partnerName) !== partnerGroup) return false
    if (category && (o.productCategoryName ?? categoryOf(o.productId)) !== category) return false
    if (itemGroup && groupOf(o.productId) !== itemGroup) return false
    if (component && !(bomOf.get(o.productId) ?? '').includes(component)) return false
    if (dueFrom && (!o.dueDate || o.dueDate < dueFrom)) return false
    if (dueTo && (!o.dueDate || o.dueDate > dueTo)) return false
    if (remarkCond && !(o.remark ?? '').includes(remarkCond)) return false
    if (statusCond && o.statusName !== statusCond) return false
    if (authorCond && (o.createdBy ?? '') !== authorCond) return false
    return true
  }).sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id - a.id)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [orders, from, to, orderNo, item, warehouse, partner, emp, employees,
    partnerGroup, pgroup, category, itemGroup, categoryOf, groupOf, component, bomOf,
    dueFrom, dueTo, remarkCond, statusCond, authorCond])

  /** 작업지시별 불출 집계. */
  const issueBy = useMemo(() => {
    const m = new Map<number, { count: number; qty: number; last: string; items: Map<number, { name: string; qty: number }> }>()
    for (const i of issues) {
      const cur = m.get(i.workOrderId) ?? { count: 0, qty: 0, last: '', items: new Map() }
      cur.count += 1
      cur.qty += i.qty
      if (i.issueDate > cur.last) cur.last = i.issueDate
      const it = cur.items.get(i.itemId) ?? { name: `[${i.itemCode}] ${i.itemName}`, qty: 0 }
      it.qty += i.qty
      cur.items.set(i.itemId, it)
      m.set(i.workOrderId, cur)
    }
    return m
  }, [issues])

  /** 작업지시별 생산전표의 소모자재 집계 — 실제 투입의 나머지 절반. */
  const consumedBy = useMemo(() => {
    const m = new Map<number, Map<number, { name: string; qty: number }>>()
    for (const p of productions) {
      const cur = m.get(p.workOrderId) ?? new Map()
      for (const mt of p.materials) {
        const it = cur.get(mt.componentId) ?? { name: `[${mt.componentCode}] ${mt.componentName}`, qty: 0 }
        it.qty += mt.quantity
        cur.set(mt.componentId, it)
      }
      m.set(p.workOrderId, cur)
    }
    return m
  }, [productions])

  /** 작업지시별 작업내역 집계. */
  const resultBy = useMemo(() => {
    const m = new Map<number, { count: number; good: number; defect: number; time: number; last: string }>()
    for (const r of results) {
      if (r.workOrderId == null) continue
      const cur = m.get(r.workOrderId) ?? { count: 0, good: 0, defect: 0, time: 0, last: '' }
      cur.count += 1
      cur.good += r.goodQty
      cur.defect += r.defectQty
      cur.time += r.workTimeMin
      if (r.workDate > cur.last) cur.last = r.workDate
      m.set(r.workOrderId, cur)
    }
    return m
  }, [results])

  const bomBy = useMemo(() => new Map(boms.map((b) => [b.productId, b.lines])), [boms])

  /** 원재료투입비교 — 자재 한 줄씩. 소요 = 지시수량 × BOM 수량, 투입 = 불출 + 소모. */
  const compareLines = useMemo(() => {
    const out: {
      key: string; orderNo: string; product: string
      material: string; required: number; used: number
    }[] = []
    for (const o of shown) {
      const lines = bomBy.get(o.productId) ?? []
      const used = new Map<number, { name: string; qty: number }>()
      for (const [id, v] of issueBy.get(o.id)?.items ?? new Map()) used.set(id, { name: v.name, qty: v.qty })
      for (const [id, v] of consumedBy.get(o.id) ?? new Map()) {
        const cur = used.get(id) ?? { name: v.name, qty: 0 }
        cur.qty += v.qty
        used.set(id, cur)
      }
      const seen = new Set<number>()
      for (const l of lines) {
        seen.add(l.componentId)
        out.push({
          key: `${o.id}-${l.componentId}`, orderNo: o.orderNo,
          product: `[${o.productCode}] ${o.productName}`,
          material: `[${l.componentCode}] ${l.componentName}`,
          required: l.quantity * o.plannedQty,
          used: used.get(l.componentId)?.qty ?? 0,
        })
      }
      // BOM 에 없는데 들어간 자재도 보여 준다 — 숨기면 "왜 재고가 줄었지" 를 못 찾는다.
      for (const [id, v] of used) {
        if (seen.has(id)) continue
        out.push({
          key: `${o.id}-x${id}`, orderNo: o.orderNo,
          product: `[${o.productCode}] ${o.productName}`,
          material: v.name, required: 0, used: v.qty,
        })
      }
    }
    return out
  }, [shown, bomBy, issueBy, consumedBy])

  /** 품목 → 생산공정. BOR 의 첫 작업(작업순서가 가장 앞선 줄)이 그 품목의 공정이다. */
  const processOf = useMemo(() => {
    const m = new Map<number, { seq: number; name: string }>()
    for (const b of bors) {
      const cur = m.get(b.productId)
      if (!cur || b.seq < cur.seq) m.set(b.productId, { seq: b.seq, name: b.processName })
    }
    return (id: number) => m.get(id)?.name ?? ''
  }, [bors])

  /** 품목 → 현재고(창고 합). */
  const onHandOf = useMemo(() => {
    const m = new Map<number, number>()
    for (const s of stocks) m.set(s.itemId, (m.get(s.itemId) ?? 0) + s.quantity)
    return (id: number) => m.get(id) ?? 0
  }, [stocks])

  /** 품목 → 조회기간 안의 생산전표. 원본 [생산] 네 칸이 이것을 본다. */
  const prodOf = useMemo(() => {
    const m = new Map<number, Production[]>()
    for (const pd of productions) {
      if (pd.productionDate < from || pd.productionDate > to) continue
      const a = m.get(pd.productId) ?? []
      a.push(pd)
      m.set(pd.productId, a)
    }
    for (const a of m.values()) a.sort((x, y) => (x.productionDate < y.productionDate ? -1 : 1))
    return m
  }, [productions, from, to])

  /**
   * <b>원본 격자의 줄</b> — 작업지시 하나를 <b>BOM 줄까지 펴서</b> 만든다.
   * 지시한 제품이 첫 줄이고(필요수량 = 지시수량), 그 밑에 BOM 자재가
   * <b>지시수량 × BOM 수량</b>만큼 필요한 줄로 따라붙는다.
   * 원본과 같게 <b>품목으로 묶고</b> 묶음마다 [코드 / 이름  계] 줄을 하나 둔다.
   */
  const progressRows = useMemo(() => {
    type Need = { orderNo: string; date: string; itemId: number; code: string; name: string; qty: number }
    const needs: Need[] = []
    for (const o of shown) {
      needs.push({ orderNo: o.orderNo, date: o.orderDate, itemId: o.productId,
        code: o.productCode, name: o.productName, qty: o.plannedQty })
      for (const l of bomBy.get(o.productId) ?? []) {
        needs.push({ orderNo: o.orderNo, date: o.orderDate, itemId: l.componentId,
          code: l.componentCode, name: l.componentName, qty: l.quantity * o.plannedQty })
      }
    }
    const byItem = new Map<number, Need[]>()
    for (const n of needs) {
      const a = byItem.get(n.itemId) ?? []
      a.push(n)
      byItem.set(n.itemId, a)
    }
    type Row = {
      key: string; sub: boolean; orderNo: string; label: string
      process: string; bomDate: string; required: number
      factory: string; prodProcess: string; prodDate: string; prodNo: string; produced: number
      unmade: number; onHand: number
    }
    const out: Row[] = []
    const order = [...byItem.entries()].sort((a, b) => {
      const ca = a[1][0].code, cb = b[1][0].code
      return ca < cb ? -1 : ca > cb ? 1 : 0
    })
    for (const [itemId, list] of order) {
      const proc = processOf(itemId)
      const onHand = onHandOf(itemId)
      /*
       * 생산전표는 <b>품목</b>에 붙지 작업지시 줄마다 붙지 않는다. 그래서 그 품목의
       * 기간 생산을 한 번만 세고, 묶음의 <b>첫 줄</b>에만 적는다 —
       * 줄마다 적으면 같은 생산이 여러 번 더해져 합계가 부푼다.
       */
      const pds = prodOf.get(itemId) ?? []
      const produced = pds.reduce((n, x) => n + x.producedQty, 0)
      const factory = [...new Set(pds.map((x) => x.fromWarehouseName || x.warehouseName))].join(', ')
      const last = pds[pds.length - 1]
      let sum = 0
      list.forEach((n, i) => {
        sum += n.qty
        out.push({
          key: `${itemId}-${n.orderNo}-${i}`, sub: false,
          orderNo: n.orderNo, label: `[${n.code}] ${n.name}`,
          process: proc, bomDate: n.date, required: n.qty,
          factory: i === 0 ? factory : '',
          prodProcess: i === 0 && pds.length ? proc : '',
          prodDate: i === 0 && last ? last.productionDate : '',
          prodNo: i === 0 && last ? last.prodNo : '',
          produced: i === 0 ? produced : 0,
          /* 생산은 묶음의 첫 줄에만 적히므로, 미생산도 줄마다 그 줄 기준으로 낸다. */
          unmade: n.qty - (i === 0 ? produced : 0), onHand,
        })
      })
      out.push({
        key: `${itemId}-sum`, sub: true, orderNo: '',
        label: `${list[0].code} / ${list[0].name}  계`,
        process: '', bomDate: '', required: sum,
        factory: '', prodProcess: '', prodDate: '', prodNo: '', produced,
        unmade: sum - produced, onHand,
      })
    }
    return out
  }, [shown, bomBy, processOf, onHandOf, prodOf])

  const progTotals = useMemo(() => ({
    required: progressRows.filter((r) => !r.sub).reduce((n, r) => n + r.required, 0),
    produced: progressRows.filter((r) => !r.sub).reduce((n, r) => n + r.produced, 0),
    unmade: progressRows.filter((r) => !r.sub).reduce((n, r) => n + r.unmade, 0),
  }), [progressRows])

  const totals = useMemo(() => ({
    planned: shown.reduce((n, o) => n + o.plannedQty, 0),
    produced: shown.reduce((n, o) => n + o.producedQty, 0),
    issued: shown.reduce((n, o) => n + (issueBy.get(o.id)?.qty ?? 0), 0),
    good: shown.reduce((n, o) => n + (resultBy.get(o.id)?.good ?? 0), 0),
    defect: shown.reduce((n, o) => n + (resultBy.get(o.id)?.defect ?? 0), 0),
  }), [shown, issueBy, resultBy])

  /* 지금 보고 있는 [구분]이 재는 값을 그린다. */
  const chartRows = useMemo(() => {
    if (mode === '원재료투입비교표') {
      return compareLines.map((l) => ({
        label: `${l.orderNo} / ${l.material}`, value: l.used - l.required,
      }))
    }
    if (mode === '불출진행현황') {
      return shown.map((o) => ({
        label: `${o.orderNo} ${o.productName}`, value: issueBy.get(o.id)?.qty ?? 0,
      }))
    }
    return shown.map((o) => ({
      label: `${o.orderNo} ${o.productName}`, value: o.plannedQty - o.producedQty,
    }))
  }, [mode, shown, compareLines, issueBy])

  return (
    <EcListShell
      title="작업지시서별진행현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        dateLabel="기준일(영업주기)"
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
      >
        <EcCond label="작업지시No." pick>
          <input className="ec-input" placeholder="작업지시번호 일부" value={orderNo}
                 onChange={(e) => setOrderNo(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        {/* 원본 차례: [거래처] 다음이 [거래처그룹1]이다(2026-09-09 실측). */}
        <EcCond label="거래처그룹1" pick>
          <CodePickerField label="거래처그룹1" hideLabel width={160} emptyLabel="전체"
                           value={partnerGroup} onChange={setPartnerGroup}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        {/*
          원본 [품목코드(하위품목)] — [품목]이 <b>만드는 것</b>을 고르는 데 견줘
          이쪽은 <b>쓰는 자재</b>로 고른다. "이 원재료가 들어가는 지시가 지금 몇 건인가" 는
          BOM 을 눈으로 뒤져야 알 수 있었다. 이 화면은 BOM 을 이미 받아 두고 있다.
        */}
        <EcCond label="품목코드(하위품목)" pick>
          <CodePickerField label="품목코드(하위품목)" hideLabel width={200} emptyLabel="전체"
                           value={component} onChange={setComponent}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분">
          <select className="ec-input" value={category} style={{ width: 130 }}
                  onChange={(e) => setCategory(e.target.value)}>
            <option value="">전체</option>
            {categories.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1">
          <select className="ec-input" value={itemGroup} style={{ width: 150 }}
                  onChange={(e) => setItemGroup(e.target.value)}>
            <option value="">전체</option>
            {groups.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        {/* 원본 [거래처관리담당자]. 그 거래처를 맡은 영업담당자다. */}
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체"
                           value={emp} onChange={(v) => setEmp(v)}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} emptyLabel="전체"
                           value={partnerManager} onChange={(v) => setPartnerManager(v)}
                           items={pickers.employees} />
        </EcCond>
        {/*
          원본 차례: [거래처관리담당자] 다음이 <b>납기일자 · 오더관리번호 · 적요 ·
          진행상태 · 최초작성자</b> 다(2026-09-09 실측). 아래 넷은 <b>서버가 이미 보내던 값</b>인데
          이 화면이 받아 두지 않아 걸 수가 없었다.
        */}
        <EcCond label="납기일자">
          <input type="date" className="ec-input" value={dueFrom}
                 onChange={(e) => setDueFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={dueTo}
                 onChange={(e) => setDueTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="진행상태" pick>
          <CodePickerField label="진행상태" hideLabel width={130} emptyLabel="전체"
                           value={statusCond} onChange={setStatusCond}
                           items={[...new Set(orders.map((o) => o.statusName))].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={140} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(orders.map((o) => o.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="결재방표시">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        작업지시 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        지시수량 <b>{num(totals.planned)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        생산수량 <b style={{ color: 'var(--ec-blue-dark)' }}>{num(totals.produced)}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        원본 [그래프로 보기]. 이 화면이 재는 것은 <b>얼마나 남았나</b> 다 —
        지시수량이 아니라 <b>미생산 잔량(지시−생산)</b>을 그린다. 지시수량을 그리면
        이미 다 만든 지시가 제일 큰 막대로 남아 눈길을 끈다.
        원재료투입비교표는 자재별 <b>초과투입</b>(투입−소요)을 그린다.
      */}
      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 작업지시가 없습니다." />
      ) : mode === '불출진행현황' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>품목명</th>
              <th style={{ width: 100, textAlign: 'right' }}>지시수량</th>
              <th style={{ width: 100, textAlign: 'right' }}>불출건수</th>
              <th style={{ width: 110, textAlign: 'right' }}>불출수량</th>
              <th style={{ width: 120 }}>최근불출일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((o, i) => {
              const g = issueBy.get(o.id)
              return (
                <tr key={o.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
                  <td>[{o.productCode}] {o.productName}</td>
                  <td style={{ textAlign: 'right' }}>{num(o.plannedQty)}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g?.count ?? 0)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: g ? '#a5561b' : '#c9ced6' }}>{num(g?.qty ?? 0)}</td>
                  <td style={{ fontFamily: 'monospace', color: g ? undefined : '#c9ced6' }}>{g?.last ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right' }}>{num(totals.planned)}</td>
              <td></td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totals.issued)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '원재료투입비교표' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>생산품목</th>
              <th>원재료</th>
              <th style={{ width: 110, textAlign: 'right' }}>소요(BOM)</th>
              <th style={{ width: 110, textAlign: 'right' }}>투입</th>
              <th style={{ width: 110, textAlign: 'right' }}>차이</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : compareLines.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : compareLines.map((l, i) => {
              const diff = l.used - l.required
              return (
                <tr key={l.key}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{l.orderNo}</td>
                  <td>{l.product}</td>
                  <td style={{ color: l.required === 0 ? '#a5561b' : undefined }}>
                    {l.material}{l.required === 0 ? ' (BOM 밖)' : ''}
                  </td>
                  <td style={{ textAlign: 'right' }}>{num(l.required)}</td>
                  <td style={{ textAlign: 'right' }}>{num(l.used)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: diff > 0 ? '#c60a2e' : diff < 0 ? '#1c7c3c' : '#8a929c' }}>
                    {diff > 0 ? '+' : ''}{num(diff)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : mode === '작업진행현황' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170 }}>작업지시번호</th>
              <th>품목명</th>
              <th style={{ width: 90, textAlign: 'right' }}>작업건수</th>
              <th style={{ width: 100, textAlign: 'right' }}>양품</th>
              <th style={{ width: 100, textAlign: 'right' }}>불량</th>
              <th style={{ width: 110, textAlign: 'right' }}>작업시간(분)</th>
              <th style={{ width: 120 }}>최근작업일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((o, i) => {
              const g = resultBy.get(o.id)
              return (
                <tr key={o.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{o.orderNo}</td>
                  <td>[{o.productCode}] {o.productName}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g?.count ?? 0)}</td>
                  <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{num(g?.good ?? 0)}</td>
                  <td style={{ textAlign: 'right', color: (g?.defect ?? 0) > 0 ? '#c60a2e' : '#8a929c' }}>{num(g?.defect ?? 0)}</td>
                  <td style={{ textAlign: 'right' }}>{num(g?.time ?? 0)}</td>
                  <td style={{ fontFamily: 'monospace', color: g ? undefined : '#c9ced6' }}>{g?.last ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{num(totals.good)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{num(totals.defect)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          {/*
            <b>작업지시서별진행현황(E040414) [생산진행현황] 2026-09-09 원본 격자 실측</b>(자료 12줄).
            원본 머리는 <b>두 줄</b>이다 —
            위: [작업지시서번호 · 품목 · <b>BOM기준</b>(3칸) · <b>생산</b>(4칸) · 미생산 · 현재고],
            아래: [생산공정 · 일자 · 필요수량] / [공장 · 생산공정 · 일자 · 수량].

            <p>즉 원본은 작업지시 <b>한 줄</b>이 아니라 <b>BOM 줄까지 편</b> 표다. 실측한 줄이
            그대로 보여 준다 — 작업지시 하나(2026/03/12 -2)가 [AQD · AQD 몸체 · AQD 컨트롤러]
            세 줄로 펴지고, 품목마다 <b>[코드 / 이름  계]</b> 줄이 하나씩 붙는다.
            우리 표는 작업지시 <b>한 줄 요약</b>이라 일곱 칸이 통째로 없었고, 그래서
            "무엇이 얼마나 모자라나" 를 이 화면에서 볼 수가 없었다. 이번에 그 모양으로 바꿨다.

            <p>일곱 칸은 모두 <b>이미 있는 자료</b>였다 —
            [생산공정]은 <b>BOR</b>(품목이 거치는 작업)의 첫 공정,
            [BOM기준 일자]는 작업지시일, [필요수량]은 지시수량 × BOM 수량,
            [공장]·[일자]·[수량]은 <b>생산전표</b>(fromWarehouseName · prodNo · producedQty),
            [현재고]는 <code>/stock</code> 의 품목 합이다. 하나도 지어내지 않았다.

            <p>[생산]쪽 <b>[생산공정]</b>만은 생산전표가 공정을 안 적어서 <b>그 품목의 BOR 공정</b>을
            쓴다 — 원본 실측에서도 두 칸이 같은 값이었다(완제품공정/완제품공정). 다른 값이 될 수
            있는 자리라면 비워 두었을 텐데, 우리 자료에서는 공정이 품목에 붙는다.

            <p>[지시수량]·[완료수량]·[진행률]·[상태]는 <b>뺐다</b>. 줄이 품목 단위가 되면서
            작업지시 단위 값이 줄마다 되풀이돼 뜻이 흐려진다 —
            그 한 줄 요약은 <b>작업지시서현황</b>이 따로 있다.
          */}
          <thead>
            <tr>
              <th style={{ width: 34 }} rowSpan={2}></th>
              <th style={{ width: 150, textAlign: 'center' }} rowSpan={2}>작업지시서번호</th>
              <th rowSpan={2}>품목</th>
              <th colSpan={3} style={{ textAlign: 'center' }}>BOM기준</th>
              <th colSpan={4} style={{ textAlign: 'center' }}>생산</th>
              <th style={{ width: 90, textAlign: 'right' }} rowSpan={2}>미생산</th>
              <th style={{ width: 90, textAlign: 'right' }} rowSpan={2}>현재고</th>
            </tr>
            <tr>
              <th style={{ width: 110 }}>생산공정</th>
              <th style={{ width: 100, textAlign: 'center' }}>일자</th>
              <th style={{ width: 90, textAlign: 'right' }}>필요수량</th>
              <th style={{ width: 110 }}>공장</th>
              <th style={{ width: 110 }}>생산공정</th>
              <th style={{ width: 130, textAlign: 'center' }}>일자</th>
              <th style={{ width: 90, textAlign: 'right' }}>수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : progressRows.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : progressRows.map((r, i) => (r.sub ? (
              <tr key={r.key} style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>{r.label}</td>
                <td colSpan={2}></td>
                <td style={{ textAlign: 'right' }}>{num(r.required)}</td>
                <td colSpan={3}></td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(r.produced)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.unmade)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.onHand)}</td>
              </tr>
            ) : (
              <tr key={r.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{r.orderNo}</td>
                <td>{r.label}</td>
                <td>{r.process}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{dateText(r.bomDate)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.required)}</td>
                <td>{r.factory}</td>
                <td>{r.prodProcess}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{r.prodDate ? `${dateText(r.prodDate)} ${r.prodNo}` : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.produced ? num(r.produced) : ''}</td>
                <td style={{ textAlign: 'right', color: r.unmade > 0 ? '#c60a2e' : '#8a929c' }}>{num(r.unmade)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.onHand)}</td>
              </tr>
            )))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right' }}>{num(progTotals.required)}</td>
              <td colSpan={3}></td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(progTotals.produced)}</td>
              <td style={{ textAlign: 'right' }}>{num(progTotals.unmade)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}
