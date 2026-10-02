import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { aggregate, groupCodes, GROUP_CODE_LABEL, type AggregatableRow, type GroupKey } from '../../utils/statusAggregate'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { subtotalBy } from '../../utils/subtotalBy'
import { STATUS_PICKS, periodOf, comparePeriodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Warehouse } from '../../types/api'
import { stockCostMapFromLast, sumStockValue } from '../../utils/stockValue'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { dateText } from '../../utils/dateText'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'

/**
 * 생산관리 > 생산입고현황 — 생산입고 전표(/api/productions)를 기간·조건으로 본다.
 *
 * <p>예전에는 이 화면이 <b>작업지시 목록</b>(/api/work-orders)을 그대로 보여 줬다.
 * 지시수량·입고수량·잔여수량을 나열하는, 사실상 작업지시서현황이었다.
 * 원본 화면 사본으로 대조해 보니 생산입고현황은 <b>입고된 전표</b>를 보는 자리다.
 *
 * <p>원본 조건 판 실측:
 *   [구분] 내역 | 집계 | 라인별 · 일자(금월(~오늘)) · 창고 · 프로젝트 · 품목 · 담당자 · 적요
 * 우리는 조건 판이 아예 없었다(검색어 한 칸이 전부).
 *
 * <p>[프로젝트]는 예전에 "생산입고에 그 값이 없어" 만들지 않았는데, 이제 있다.
 * 판매·구매·비용·출하·정산이 모두 프로젝트를 다는데 생산입고만 남아 있었다 —
 * 프로젝트별 손익을 보려면 <b>그 프로젝트로 무엇을 만들었나</b>도 알아야 한다.
 *
 * <p>원본 결과 열 실측(사본): 일자-No. · <b>출고창고명</b> · <b>입고창고명</b> ·
 * 품목명[규격명] · 수량 · <b>생산금액</b> · <b>적요</b>.
 * 우리는 창고가 한 칸이었고 금액과 적요가 없었다 — 몇 개 들어왔는지만 보이고
 * 그게 얼마짜리인지는 이 화면에서 알 수 없었다.
 *
 * <p>생산금액은 생산수량 × 그 품목의 <b>평가단가</b>다. 단가는 재고평가와 같은 규칙을
 * 쓴다(마지막 입고단가 → 품목 구매단가). 판매단가로 매기면 아직 팔지도 않은 이익이
 * 생산금액에 얹힌다. 단가를 모르는 전표는 <b>합계에서 빼고 몇 건인지 밝힌다</b> —
 * 0 으로 세면 그 전표가 공짜로 만들어진 것이 된다.
 */
/*
 * 원본 [구분] 은 ◉내역 ○집계 두 개이고, 내역 아래 선택상자가 일별 · 월별 · 라인별(기본) · 전표별 · … 이다(2026-10-02 loginaa
 * 생산입고현황 실측). 예전 우리 [라인별](소모자재까지 펼친 표)은 원본에 없는 갈래였다 — 소모는 생산입고/소모현황 I 이 본다.
 */
type Mode = '내역' | '집계'
const MODES = ['내역', '집계'] as const

interface Material {
  itemId: number
  itemCode: string
  itemName: string
  quantity: number
}

interface Production {
  /** 넣은 화면 — 원본 생산입고 I·II·III. */
  entryType?: 'I' | 'II' | 'III'
  id: number
  /** 진행상태 — 결재중·미확인·확인(2026-10-02 생겼다). */
  confirmStatus?: 'UNCONFIRMED' | 'IN_APPROVAL' | 'CONFIRMED'
  prodNo: string
  workOrderId: number
  workOrderNo: string
  productId: number
  productCode: string
  productName: string
  /** 원본 열 이름이 [품목명[규격명]] 이다 — 이름만으로는 같은 이름의 다른 규격을 못 가린다. */
  productSpec: string | null
  productUnit: string
  warehouseId: number
  warehouseName: string
  fromWarehouseId: number | null
  fromWarehouseName: string | null
  projectId: number | null
  projectName: string | null
  producedQty: number
  productionDate: string
  createdBy: string | null
  note: string | null
  /**
   * 원본 [품목구분]·[담당자]. 둘 다 <code>ProductionResponse</code> 가 진작 싣는데
   * 이 화면이 받아 두지 않았다 — <b>[담당자] 칸이 작성자를 거르고 있었다.</b>
   * 원본은 [담당자](전표의 담당 사원)와 [최초작성자](만든 계정)를 따로 묻는다.
   */
  productCategoryName: string | null
  employeeId: number | null
  materials: Material[]
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function ReceiptStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'projects', 'employees'])
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다 —
   * 결재를 안 받을 자료까지 도장칸을 달고 나가면 종이가 한 칸씩 밀린다.
   */
  const [signBox, setSignBox] = useState(false)
  const [rows, setRows] = useState<Production[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<{ itemId: number; unitPrice: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouseId, setWarehouseId] = useState('')
  const [item, setItem] = useState('')
  const [worker, setWorker] = useState('')
  const [project, setProject] = useState('')
  /**
   * 원본 생산입고현황 조건 실측(사본): 구분 · 일자 · 프로젝트 · 품목 · 담당자 · <b>적요</b> ·
   * 채무번호. 적요가 빠져 있었다 — 왜 그렇게 입고했는지 적어 두고도 그 말로는 못 찾았다.
   * (채무번호는 외주 매입과 잇는 값이라 우리에게 없다.)
   */
  const [note, setNote] = useState('')
  /*
   * 2026-09-08 에 원본(E040410)의 조건 판을 재니 <b>서른둘</b>이다(사본에는 열하나).
   * 접힌 줄은 없다.
   *
   * <p>만든 것 여섯: 보내는창고 · 받는창고 · 품목구분 · 품목그룹1 · 규격 · 최초작성자.
   * <b>[창고]의 뜻과 [담당자]의 값도 고쳤다</b> — 생산불출현황과 같은 두 잘못이
   * 이 화면에도 그대로 있었다.
   */
  const [fromWh, setFromWh] = useState('')
  const [toWh, setToWh] = useState('')
  const [itemCategory, setItemCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [specCond, setSpecCond] = useState('')
  /** 원본 조건 [진행상태] — 전체 · 결재중 · 미확인 · 확인. */
  const [statusCond, setStatusCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [entryCond, setEntryCond] = useState('')
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])
  const mgmt = useItemMgmt()
  /** 담당자 이름. production 은 hr 을 참조할 수 없어 id 만 온다 — 화면이 붙인다. */
  const empName = (id: number | null) =>
    id == null ? '' : (employees.find((x) => x.id === id)?.name ?? '')
  const [mode, setMode] = useState<Mode>('내역')
  /** ◉내역 아래 선택상자 — 라인별(기본, 생산 줄마다) · 전표별(전표 한 장이 한 줄). */
  /**
   * 원본 ○집계 — [집계조건1]·[집계조건2](2026-10-02 loginaa 실측, 생산불출현황과 같은 판). 조건1 품목별 · 조건2 없음이면
   * 예전 품목별 표를 그대로 쓴다.
   */
  /* 원본 후보(2026-10-02 실측)는 생산불출현황과 같다: 일별 … 연별 · 생산입고 · 담당자 · 보낸창고명(생산공장) · 받는창고명(입고창고) ·
     관리항목 · 품목 · 품목그룹1·2·3 · 프로젝트 · 프로젝트그룹1·2. 관리항목·품목그룹2·3·프로젝트그룹은 전역 예외. */
  const AGG_KEYS = ['품목별', '일별', '주차별', '월별', '분기별', '반기별', '연별', '전표별', '담당자별', '보낸창고별', '받는창고별', '품목그룹1별', '프로젝트별'] as const
  /** 원본 ○집계의 [비교기간] — 그 기간의 생산입고를 따로 받아 수량·생산금액을 견준다(생산불출현황과 같은 판). */
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const [prevRows, setPrevRows] = useState<Production[] | null>(null)
  const prevRange = comparePeriodOf(from, to, compare)
  useEffect(() => {
    if (!prevRange) { setPrevRows(null); return }
    api.get<Production[]>('/productions', { params: prevRange }).then((r) => setPrevRows(r.data)).catch(() => setPrevRows(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevRange?.from, prevRange?.to])
  const [agg1, setAgg1] = useState<GroupKey>('품목별')
  const [agg2, setAgg2] = useState<GroupKey | ''>('')
  /** 원본 집계 [기타] 의 [비율표시] — 묶음마다 수량이 전체의 몇 % 인가. */
  const [ratio, setRatio] = useState(false)
  /** 원본 집계 [기타] 의 [가로보기] — 조건2 값을 열로 펼친다(조건1 이 줄, 칸은 수량). 조건2 가 있을 때만 뜻이 있다. */
  const [pivot, setPivot] = useState(false)
  /** 원본 집계 [기타] 의 [코드포함] — 묶음 이름 앞에 코드 열을 세운다(코드가 있는 축만). */
  const [codeIncl, setCodeIncl] = useState(false)
  /* 조건2 를 켜면 열이 하나 는다 — 렌더된 표를 직접 잰다. */
  const aggRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(aggRef, '생산입고현황 집계', [agg2, mode, ratio, pivot, codeIncl, agg1])
  const [lineView, setLineView] = useState<'라인별' | '전표별' | '품목별' | '일별' | '월별' | '전표별품목별' | '담당자별'>('라인별')
  const [view, setView] = useState<'표' | '그래프'>('표')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [prod, wh, it, pu, emps] = await Promise.all([
        api.get<Production[]>('/productions', { params: { from: from || undefined, to: to || undefined } }),
        api.get<Warehouse[]>('/warehouses'),
        api.get<Item[]>('/items'),
        /*
         * <b>마지막 입고단가만 받는다.</b> 이 화면이 구매로 하는 일은 평가단가 지도
         * 하나를 만드는 것뿐인데 구매 전표를 통째로 받고 있었다(실측 984KB).
         * /purchases/item-prices 는 품목당 한 줄만 낸다 — 2026-09-10 에 만든 자리인데
         * 이 화면이 안 옮겨져 있었다.
         */
        api.get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices'),
        api.get<{ id: number; name: string }[]>('/employees'),
      ])
      setEmployees(emps.data)
      setItems(it.data)
      setPurchases(pu.data)
      setRows([...prod.data].sort((a, b) =>
        (a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id)))
      setWarehouses(wh.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [from, to])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setWarehouseId(''); setItem(''); setWorker(''); setMode('내역'); setProject(''); setNote('')
    setFromWh(''); setToWh(''); setItemCategory(''); setItemGroup(''); setSpecCond(''); setAuthorCond('')
  }

  const shown = useMemo(() => rows.filter((r) => {
    if (r.productionDate < from || r.productionDate > to) return false
    /* [창고] — 보내는·받는 어느 쪽이든 걸린다(생산불출현황과 같은 규칙). */
    if (warehouseId && String(r.warehouseId) !== warehouseId
        && String(r.fromWarehouseId ?? '') !== warehouseId) return false
    /* 이름은 겹칠 수 있다 — id 로 거른다(QA 9회차). */
    if (fromWh && String(r.fromWarehouseId ?? '') !== fromWh) return false
    if (toWh && String(r.warehouseId) !== toWh) return false
    if (item && String(r.productId) !== item) return false
    /* [담당자]는 전표의 담당 사원이다 — 만든 계정([최초작성자])과 다른 사람이다. */
    if (worker && !empName(r.employeeId).includes(worker)) return false
    if (authorCond && (r.createdBy ?? '') !== authorCond) return false
    if (entryCond && (r.entryType ?? 'I') !== entryCond) return false
    if (itemCategory && (r.productCategoryName ?? '') !== itemCategory) return false
    if (itemGroup && mgmt.groupOf(r.productId) !== itemGroup) return false
    if (specCond && !(r.productSpec ?? '').includes(specCond)) return false
    if (statusCond && r.confirmStatus !== statusCond) return false
    if (project && String(r.projectId) !== project) return false
    if (note && !(r.note ?? '').includes(note)) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, from, to, warehouseId, item, worker, project, note,
       fromWh, toWh, itemCategory, itemGroup, specCond, authorCond, statusCond, entryCond, employees, mgmt.groupOptions])

  /** 집계 — 품목 단위로 입고수량을 모은다. */
  /*
   * 원본 [정렬/소계기준]. 우리는 <b>품목으로만</b> 묶었는데, 같은 입고를
   * 창고별·프로젝트별로 보고 싶은 사람이 따로 있다.
   */
  const SUBTOTALS = ['품목', '입고창고', '출고창고', '프로젝트'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('품목')

  const byItem = useMemo(() => {
    const keyOf = (r: Production) => (
      subtotal === '입고창고' ? r.warehouseName
        : subtotal === '출고창고' ? (r.fromWarehouseName ?? r.warehouseName)
          : subtotal === '프로젝트' ? r.projectName
            : r.productName)
    return subtotalBy(shown, keyOf, { qty: (r) => r.producedQty }).map((g) => ({
      key: g.label,
      // 코드 칸은 품목으로 묶을 때만 뜻이 있다 — 창고·프로젝트에는 코드가 없다.
      code: subtotal === '품목' ? (g.rows[0]?.productCode ?? '') : '',
      name: g.label,
      unit: subtotal === '품목' ? (g.rows[0]?.productUnit ?? '') : '',
      qty: g.sums.qty,
      count: g.count,
    })).sort((a, b) => b.qty - a.qty)
  }, [shown, subtotal])


  const totalQty = shown.reduce((n, r) => n + r.producedQty, 0)

  /* 원본 [데이터 보기형식] · [그래프로 보기]. 지금 보고 있는 [구분]을 따라 그린다. */
  const chartRows = useMemo(() =>
    mode === '집계'
      ? byItem.map((r) => ({ label: r.name, value: r.qty }))
      : shown.map((r) => ({ label: `${r.productionDate} ${r.productName}`, value: r.producedQty })),
    [mode, byItem, shown])

  /** 품목별 평가단가. 재고평가와 같은 규칙을 쓴다 — 화면마다 따로 매기면 한쪽만 어긋난다. */
  const cost = useMemo(() => stockCostMapFromLast(items, purchases), [items, purchases])
  /** 집계 — 생산 줄을 집계용 모양으로 옮겨 조건1·2 로 묶는다. 금액은 생산금액(단가 모르는 줄은 더하지 않는다). */
  const toAgg = (r: typeof shown[number]): AggregatableRow => ({
    date: r.productionDate, docNo: r.prodNo, partner: '', itemName: r.productName, qty: r.producedQty,
    supply: cost.get(r.productId) == null ? 0 : r.producedQty * cost.get(r.productId)!, vat: 0,
    /* 집계의 warehouseName 은 '보낸' 쪽이다 — 생산입고에선 생산공장, 받는 쪽(입고창고)은 toWarehouseName. */
    warehouseName: r.fromWarehouseName ?? '', projectName: r.projectName ?? null,
    taxable: true, employeeName: empName(r.employeeId) || null, managementItemName: null,
    toWarehouseName: r.warehouseName, itemGroupName: mgmt.groupOf(r.productId) || null,
  })
  const aggRows = useMemo(() => aggregate(shown.map(toAgg), agg1, agg2),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [shown, agg1, agg2, cost, employees, mgmt.groupOptions])
  /** 묶음의 코드 — 품목은 생산품 코드, 창고는 받는창고 코드, 담당자·프로젝트는 마스터 코드. */
  const codeOf = (r: typeof shown[number], key: GroupKey) =>
    key === '품목별' ? r.productCode
      : key === '보낸창고별' ? (warehouses.find((w) => w.id === r.fromWarehouseId) as { code?: string } | undefined)?.code
      : key === '받는창고별' ? (warehouses.find((w) => w.id === r.warehouseId) as { code?: string } | undefined)?.code
      : key === '담당자별' ? pickers.employees.find((e) => e.id === r.employeeId)?.code
      : key === '프로젝트별' ? pickers.projects.find((p) => p.id === r.projectId)?.code
      : ''
  /** [코드포함] — 켜졌고 그 축에 코드가 있으면 열 이름, 아니면 undefined(열을 안 세운다). */
  const code1 = codeIncl ? GROUP_CODE_LABEL[agg1] : undefined
  const code2 = codeIncl && agg2 ? GROUP_CODE_LABEL[agg2] : undefined
  const codes1 = useMemo(() => code1 ? groupCodes(shown, agg1, toAgg, codeOf) : new Map<string, string>(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [code1, shown, agg1, employees, warehouses, pickers.employees, pickers.projects])
  const codes2 = useMemo(() => code2 && agg2 ? groupCodes(shown, agg2, toAgg, codeOf) : new Map<string, string>(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [code2, shown, agg2, employees, warehouses, pickers.employees, pickers.projects])
  /** 내역의 줄 — 라인별이면 생산 줄 그대로, 전표별이면 번호로 묶어 첫 품목 외 n건 · 수량 합 · 금액 합(단가 모르는 줄이 있으면 모름). */
  const listRows = useMemo(() => {
    const amt = (r: Production) => { const c = cost.get(r.productId); return c == null ? null : r.producedQty * c }
    const one = (r: Production) => ({ ...r, slipAmount: amt(r), matCount: r.materials.length })
    if (lineView === '라인별') return shown.map(one)
    /* 품목별 — 같은 품목(생산된공장·받는창고도 같은 것)을 한 줄로, 일자-No. 는 처음 것(원본 생산불출현황 품목별과 같은 모양). */
    /* 일별 · 월별 — 그날(그달) 줄을 한 줄로, 일자만 찍고(No. 없음) 창고·품목은 처음 줄 것, 수량·금액은 합
       (원본 실측 2026-10-02: 9/3 줄 인텔 코어 270 · 43,110,000 = 그날 세 자재의 합). */
    const keyOf = (r: Production) => lineView === '품목별' ? `${r.productId}|${r.fromWarehouseId}|${r.warehouseId}`
      : lineView === '일별' ? r.productionDate : lineView === '월별' ? r.productionDate.slice(0, 7)
      /* 전표별품목별 — 한 전표 안의 같은 품목을 한 줄로. 담당자별 — 담당자 하나가 한 줄, 일자-No.·품목은 처음 줄 것을 둔다
         (원본 실측 2026-10-02: 담당자가 같은 불출 전부가 9/3 -2 인텔 코어 줄 하나로 1,269 · 105,205,500). */
      : lineView === '전표별품목별' ? `${r.prodNo}|${r.productId}` : lineView === '담당자별' ? String(r.employeeId ?? '') : r.prodNo
    const m = new Map<string, Production[]>()
    shown.forEach((r) => m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]))
    return [...m.values()].map((ls) => ({ ...ls[0],
      ...(lineView === '일별' || lineView === '월별' ? { prodNo: '', workOrderNo: null, productionDate: lineView === '월별' ? ls[0].productionDate.slice(0, 7).replace('-', '/') : ls[0].productionDate } : {}),
      productName: lineView === '전표별' && ls.length > 1 ? `${ls[0].productName} 외 ${ls.length - 1}건` : ls[0].productName,
      productSpec: lineView === '전표별' && ls.length > 1 ? null : ls[0].productSpec,
      producedQty: ls.reduce((n, r) => n + r.producedQty, 0),
      slipAmount: ls.some((r) => amt(r) == null) ? null : ls.reduce((n, r) => n + (amt(r) ?? 0), 0),
      matCount: ls.reduce((n, r) => n + r.materials.length, 0),
    }))
  }, [shown, lineView, cost])

  /** 생산금액 합계. 단가를 모르는 전표는 빼고 몇 건인지 함께 돌려준다. */
  const amount = useMemo(() => sumStockValue(
    shown.map((r) => ({ quantity: r.producedQty, unitCost: cost.get(r.productId) ?? null })),
  ), [shown, cost])

  return (
    <EcListShell
      title="생산입고현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      {/* 원본은 기간 줄을 [일자]라고 부른다(사본 실측) — 기본값 [기준일자]가 아니다. */}
      <EcStatusPanel
        dateLabel="일자"
        compare={mode === '집계' ? compare : undefined} onCompareChange={mode === '집계' ? setCompare : undefined}
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        modeExtra={mode === '집계' ? (
          <span style={{ display: 'inline-flex', gap: 6, marginLeft: 6, alignItems: 'center', fontSize: 12 }}>
            집계조건1
            <select className="ec-input" value={agg1} onChange={(e) => setAgg1(e.target.value as GroupKey)} style={{ width: 100 }}>
              {AGG_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            집계조건2
            <select className="ec-input" value={agg2} onChange={(e) => setAgg2(e.target.value as GroupKey | '')} style={{ width: 100 }}>
              <option value="">없음</option>
              {AGG_KEYS.filter((k) => k !== agg1).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <input type="checkbox" checked={ratio} onChange={(e) => setRatio(e.target.checked)} /> 비율표시
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: agg2 ? undefined : '#9aa1ab' }}
                   title="집계조건2 를 고르면 그 값을 열로 펼칩니다">
              <input type="checkbox" checked={pivot} disabled={!agg2} onChange={(e) => setPivot(e.target.checked)} /> 가로보기
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <input type="checkbox" checked={codeIncl} onChange={(e) => setCodeIncl(e.target.checked)} /> 코드포함
            </label>
          </span>
        ) : mode === '내역' ? (
          <select className="ec-input" value={lineView} onChange={(e) => setLineView(e.target.value as '라인별' | '전표별' | '품목별' | '일별' | '월별' | '전표별품목별' | '담당자별')}
                  style={{ width: 110, marginLeft: 6 }}>
            <option value="라인별">라인별</option>
            <option value="전표별">전표별</option>
            <option value="품목별">품목별</option>
            <option value="일별">일별</option>
            <option value="월별">월별</option>
            <option value="전표별품목별">전표별품목별</option>
            <option value="담당자별">담당자별</option>
          </select>
        ) : undefined}
        view={view} onViewChange={setView}
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouseId} onChange={(v) => setWarehouseId(v)}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측, 서른둘): 구분 · 일자 · 창고 · (창고계층그룹) ·
          <b>보내는창고</b> · (…) · <b>받는창고</b> · (…) · 프로젝트 · (프로젝트그룹1/2) ·
          품목 · <b>품목구분 · 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · 담당자 ·
          적요 · (채무번호 · 오더관리번호) · <b>규격</b> · (거래구분 · 생산입고구분 ·
          진행상태) · <b>최초작성자</b> · (최종수정자 · 양식) · 적용양식 · 양식구분 ·
          정렬/소계기준 · 데이터 보기형식.
        */}
        <EcCond label="보내는창고" pick>
          <CodePickerField label="보내는창고" hideLabel width={170} emptyLabel="전체"
                           value={fromWh} onChange={setFromWh}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="받는창고" pick>
          <CodePickerField label="받는창고" hideLabel width={170} emptyLabel="전체"
                           value={toWh} onChange={setToWh}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={140} emptyLabel="전체"
                           value={itemCategory} onChange={setItemCategory}
                           items={[...new Set(rows.map((r) => r.productCategoryName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체"
                           value={itemGroup} onChange={setItemGroup}
                           items={mgmt.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        {/*
          <b>[담당자]가 작성자를 거르고 있었다.</b> 원본은 [담당자](전표의 담당 사원)와
          [최초작성자](만든 계정)를 따로 묻는다 — 골라도 걸리는 값이 서로 달랐다.
        */}
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체"
                           value={worker} onChange={(v) => setWorker(v)}
                           items={employees.map((e) => ({ value: e.name, name: e.name }))} />
        </EcCond>
        {/* 원본 조건의 [적요]. 왜 그렇게 입고했는지 적어 두고도 그 말로는 못 찾았다. */}
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={note}
                 onChange={(e) => setNote(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="규격">
          <ItemSuggestInput field="spec" value={specCond}
                            onChange={(v) => setSpecCond(v)} width={140} />
        </EcCond>
        {/* 원본 조건 [생산입고구분] — 생산입고 I·II·III 중 어느 화면으로 넣은 전표인가. */}
        <EcCond label="생산입고구분">
          <select className="ec-input" value={entryCond} onChange={(e) => setEntryCond(e.target.value)} style={{ width: 120 }}>
            <option value="">전체</option>
            <option value="I">생산입고 I</option>
            <option value="II">생산입고 II</option>
            <option value="III">생산입고 III</option>
          </select>
        </EcCond>
        <EcCond label="진행상태">
          <select className="ec-input" value={statusCond} onChange={(e) => setStatusCond(e.target.value)} style={{ width: 120 }}>
            <option value="">전체</option>
            <option value="IN_APPROVAL">결재중</option>
            <option value="UNCONFIRMED">미확인</option>
            <option value="CONFIRMED">확인</option>
          </select>
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={140} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
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
        입고 전표 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{shown.length}</b>건
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        입고수량 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(totalQty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        생산금액 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(Math.round(amount.value))}</b>
        {amount.unknown > 0 && (
          <span style={{ marginLeft: 6, color: '#c07a00' }}>※ 단가 미정 {amount.unknown}건 제외</span>
        )}
      </div>
      {mode === '집계' && prevRange && prevRows && (() => {
        const prev = prevRows.filter((r) => (!warehouseId || String(r.warehouseId) === warehouseId || String(r.fromWarehouseId ?? '') === warehouseId)
          && (!item || String(r.productId) === item))
        const amt = (r: Production) => { const c = cost.get(r.productId); return c == null ? 0 : r.producedQty * c }
        const pq = prev.reduce((n, r) => n + r.producedQty, 0)
        const pa = prev.reduce((n, r) => n + amt(r), 0)
        const pct = (a: number, b: number) => (b > 0 ? ` (${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%)` : '')
        return (
          <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
            비교기간({prevRange.from.replace(/-/g, '/')} ~ {prevRange.to.replace(/-/g, '/')})
            수량 {num(pq)} → {num(totalQty)}{pct(totalQty, pq)} · 생산금액 {num(Math.round(pa))} → {num(Math.round(amount.value))}{pct(amount.value, pa)}
          </div>
        )
      })()}

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 생산입고가 없습니다." />
      ) : mode === '집계' && agg2 && pivot ? (() => {
        const cols = [...new Set(aggRows.map((g) => g.g2))].sort()
        const rowsBy = new Map<string, Map<string, number>>()
        aggRows.forEach((g) => { const m = rowsBy.get(g.g1) ?? new Map<string, number>(); m.set(g.g2, (m.get(g.g2) ?? 0) + g.qty); rowsBy.set(g.g1, m) })
        const lines = [...rowsBy.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        return (
          <table ref={aggRef} className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                {code1 && <th style={{ width: 120 }}>{code1}</th>}
                <th>{agg1} \ {agg2}</th>
                {cols.map((c) => <th key={c} style={{ textAlign: 'right' }}>{c}</th>)}
                <th style={{ textAlign: 'right' }}>합계</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(([k, m], i) => (
                <tr key={k}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  {code1 && <td style={{ fontFamily: 'monospace' }}>{codes1.get(k)}</td>}
                  <td>{k}</td>
                  {cols.map((c) => <td key={c} style={{ textAlign: 'right' }}>{m.get(c) ? num(m.get(c)!) : ''}</td>)}
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{num([...m.values()].reduce((a, v) => a + v, 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={code1 ? 3 : 2} style={{ textAlign: 'right' }}>합계</td>
                {cols.map((c) => <td key={c} style={{ textAlign: 'right' }}>{num(aggRows.filter((g) => g.g2 === c).reduce((a, g) => a + g.qty, 0))}</td>)}
                <td style={{ textAlign: 'right' }}>{num(totalQty)}</td>
              </tr>
            </tfoot>
          </table>
        )
      })() : mode === '집계' && (agg1 !== '품목별' || agg2) ? (
        <table ref={aggRef} className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              {code1 && <th style={{ width: 120 }}>{code1}</th>}
              <th>{agg1}</th>
              {code2 && <th style={{ width: 120 }}>{code2}</th>}
              {agg2 && <th>{agg2}</th>}
              <th style={{ width: 100, textAlign: 'right' }}>건수</th>
              <th style={{ width: 130, textAlign: 'right' }}>입고수량</th>
              {ratio && <th style={{ width: 80, textAlign: 'right' }}>비율(%)</th>}
              <th style={{ width: 140, textAlign: 'right' }}>생산금액</th>
            </tr>
          </thead>
          <tbody>
            {aggRows.length === 0 ? (
              <tr><td colSpan={(agg2 ? 6 : 5) + (ratio ? 1 : 0) + (code1 ? 1 : 0) + (code2 ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : aggRows.map((g, i) => (
              <tr key={`${g.g1}|${g.g2}`}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                {code1 && <td style={{ fontFamily: 'monospace' }}>{codes1.get(g.g1)}</td>}
                <td>{g.g1}</td>
                {code2 && <td style={{ fontFamily: 'monospace' }}>{codes2.get(g.g2)}</td>}
                {agg2 && <td>{g.g2}</td>}
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{num(g.qty)}</td>
                {ratio && <td style={{ textAlign: 'right', color: '#5a626e' }}>{totalQty ? (Math.round((g.qty / totalQty) * 1000) / 10).toFixed(1) : '0.0'}</td>}
                <td style={{ textAlign: 'right' }}>{num(Math.round(g.supply))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={(agg2 ? 3 : 2) + (code1 ? 1 : 0) + (code2 ? 1 : 0)} style={{ textAlign: 'right' }}>합계 ({aggRows.length}묶음)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</td>
              {ratio && <td style={{ textAlign: 'right' }}>100.0</td>}
              <td style={{ textAlign: 'right' }}>{num(Math.round(aggRows.reduce((n, g) => n + g.supply, 0)))}</td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 140 }}>{subtotal === '품목' ? '품목코드' : '코드'}</th>
              <th>{subtotal === '품목' ? '품목명' : subtotal}</th>
              <th style={{ width: 100, textAlign: 'right' }}>건수</th>
              <th style={{ width: 130, textAlign: 'right' }}>입고수량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((g, i) => (
              <tr key={g.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.code}</td>
                <td>{g.name}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {num(g.qty)} {g.unit}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계 ({byItem.length}건 묶음)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ textAlign: 'center', width: 180 }}>일자-No.</th>
              <th style={{ width: 150 }}>작업지시번호</th>
              <th style={{ width: 120 }}>출고창고명</th>
              <th style={{ width: 120 }}>입고창고명</th>
              <th>품목명[규격명]</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 130, textAlign: 'right' }}>생산금액</th>
              <th style={{ width: 90, textAlign: 'right' }}>소모자재</th>
              <th style={{ width: 110 }}>담당자</th>
              <th style={{ width: 150 }}>적요</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : listRows.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : listRows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(r.productionDate)} {r.prodNo}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.workOrderNo}</td>
                <td style={{ color: r.fromWarehouseName ? undefined : '#c9ced6' }}>
                  {r.fromWarehouseName ?? r.warehouseName}
                </td>
                <td>{r.warehouseName}</td>
                <td>{r.productName}{r.productSpec ? `[${r.productSpec}]` : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>
                  {num(r.producedQty)} {r.productUnit}
                </td>
                <td style={{ textAlign: 'right', color: r.slipAmount == null ? '#c9ced6' : undefined }}>
                  {r.slipAmount == null ? '-' : num(Math.round(r.slipAmount))}
                </td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.matCount}</td>
                <td>{r.createdBy ?? ''}</td>
                <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{num(Math.round(amount.value))}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}
