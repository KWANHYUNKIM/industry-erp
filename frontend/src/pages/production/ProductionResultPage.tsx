import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import EcDateField from '../../components/EcDateField'
import EcSlipShell from '../../components/EcSlipShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import type { Item, Production, ProductionEntryType, ProductionMaterial, Warehouse, WorkOrder } from '../../types/api'

/**
 * 원본(이카운트) <b>생산입고 I · II · III</b> 입력 화면. 셋은 뼈대가 같고 소모를 정하는 법만 다르다.
 *
 * <ul>
 *   <li><b>I · BOM기준소모</b> — 머리(일자·담당자·생산된공장·받는창고·프로젝트) 아래 생산품목을 여러 줄.
 *       저장하면 BOM 소요량만큼 생산된공장에서 자재가 빠지고 받는창고로 완제품이 들어간다.</li>
 *   <li><b>II · 소모품목 선택</b> — [생산] · [소모] 두 탭. 소모는 [BOM풀기]로 채우거나 직접 고른다.
 *       <b>소모를 비워 두면 자재는 안 빠진다</b>(원본도 그렇다).</li>
 *   <li><b>III · 공정별</b> — 줄마다 [공정]·[생산된공장]·[받는창고]가 다르다. 하나의 전표에 여러 공정의
 *       제품·반제품을 한 번에 넣을 때 쓴다(원본 도움말 "생산입고3은 언제 사용하나요?").
 *       [소모] 탭에는 [작지수량](BOM 기준)·[추가수량]·[수량]이 있다.</li>
 * </ul>
 *
 * <p>작업지시서는 <b>불러오는 것</b>이지 꼭 있어야 하는 것이 아니다 — [작업지시서] 로 고르면 잔량이 수량으로
 * 들어오고, 저장하면 그 지시의 기생산이 는다. 줄이 몇 개든 전표번호는 하나다.
 *
 * <p><code>?no=PR-…</code> 로 열면 그 전표를 고친다(원본 생산입고조회에서 번호를 누른 것).
 *
 * <p>세 화면이 이 파일 하나를 쓴다(라우터가 type 을 준다). qa/ui-check 가 원본 화면을
 * <code>pages/</code> 의 파일로 대조하므로 features/ 로 빼지 않고 여기 둔다.
 */

const won = (n: number) => (Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '')
const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0 }
const today = () => ymd(new Date())

const TITLES: Record<ProductionEntryType, string> = {
  I: '생산입고I-BOM기준소모',
  II: '생산입고II-소모품목 선택',
  III: '생산입고 III-소모품목 선택',
}

interface ProdLine {
  key: number
  productId: string
  qty: string
  workOrderId: string
  processId: string
  fromWarehouseId: string
  warehouseId: string
  unitPrice: string
  amount: string
  vat: string
  /** 사람이 합계·부가세를 손댔으면 단가×수량으로 덮지 않는다. */
  amountTouched: boolean
  note: string
  laborMinutes: string
}

interface MatLine {
  key: number
  /** 어느 생산품목 줄의 소모인가(ProdLine.key). */
  lineKey: string
  componentId: string
  /** III [작지수량] — BOM 소요량 × 생산수량. 사람이 넣지 않는다. */
  bomQty: string
  /** III [추가수량]. 수량 = 작지수량 + 추가수량. */
  extraQty: string
  qty: string
  note: string
}

let seq = 1
const nextKey = () => seq++
const blankLine = (): ProdLine => ({
  key: nextKey(), productId: '', qty: '', workOrderId: '', processId: '', fromWarehouseId: '', warehouseId: '',
  unitPrice: '', amount: '', vat: '', amountTouched: false, note: '', laborMinutes: '',
})
const blankMat = (lineKey = ''): MatLine => ({
  key: nextKey(), lineKey, componentId: '', bomQty: '', extraQty: '', qty: '', note: '',
})
const BLANK_ROWS = 5
/** 원본 격자 위 탭. I 은 [생산] 하나뿐이다(소모는 BOM 이 정한다). */
const TABS = ['생산', '소모'] as const

export default function ProductionResultPage({ type = 'I' }: { type?: ProductionEntryType }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editNo = params.get('no')

  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [employees, setEmployees] = useState<{ id: number; code: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [processes, setProcesses] = useState<{ id: number; code: string; name: string; active: boolean }[]>([])
  const [orders, setOrders] = useState<WorkOrder[]>([])

  const [date, setDate] = useState(today())
  const [employeeId, setEmployeeId] = useState('')
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [lines, setLines] = useState<ProdLine[]>(() => Array.from({ length: BLANK_ROWS }, blankLine))
  const [mats, setMats] = useState<MatLine[]>(() => Array.from({ length: BLANK_ROWS }, () => blankMat()))
  const [tab, setTab] = useState<(typeof TABS)[number]>('생산')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [woOpen, setWoOpen] = useState(false)
  const [woChecked, setWoChecked] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  /** 원본 [생산] 탭 툴바의 [My품목] — 담아 둔 품목을 생산품목 줄로 붓는다. */
  const myItems = useMyItemsPick((picked) => setLines((ls) => [
    ...ls.filter((l) => l.productId),
    ...picked.map((m) => ({ ...blankLine(), productId: String(m.itemId), qty: String(m.defaultQty) })),
    blankLine(),
  ]))

  useEffect(() => {
    void Promise.all([
      api.get<Item[]>('/items').then((r) => setItems(r.data.filter((i) => i.active))),
      api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data.filter((w) => w.active))),
      api.get<{ id: number; code: string; name: string; active?: boolean }[]>('/employees')
        .then((r) => setEmployees(r.data.filter((e) => e.active !== false))),
      api.get<{ id: number; code: string; name: string }[]>('/projects').then((r) => setProjects(r.data)),
      api.get<{ id: number; code: string; name: string; active: boolean }[]>('/processes')
        .then((r) => setProcesses(r.data.filter((p) => p.active))),
      api.get<WorkOrder[]>('/work-orders').then((r) => setOrders(r.data)),
    ]).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  // ?no= 로 열면 그 전표를 불러온다(고치기).
  useEffect(() => {
    if (!editNo) return
    api.get<Production[]>(`/productions/slips/${encodeURIComponent(editNo)}`).then((r) => {
      const rows = r.data
      if (rows.length === 0) return
      const h = rows[0]
      setDate(h.productionDate)
      setEmployeeId(h.employeeId != null ? String(h.employeeId) : '')
      setProjectId(h.projectId != null ? String(h.projectId) : '')
      setFromWarehouseId(h.fromWarehouseId != null ? String(h.fromWarehouseId) : '')
      setWarehouseId(String(h.warehouseId))
      const ls: ProdLine[] = rows.map((p) => ({
        key: nextKey(), productId: String(p.productId), qty: String(p.producedQty),
        workOrderId: p.workOrderId != null ? String(p.workOrderId) : '',
        processId: p.processId != null ? String(p.processId) : '',
        fromWarehouseId: p.fromWarehouseId != null ? String(p.fromWarehouseId) : '',
        warehouseId: String(p.warehouseId),
        unitPrice: String(p.subcontractUnitPrice ?? ''), amount: String(p.subcontractAmount ?? ''),
        vat: String(p.subcontractVat ?? ''), amountTouched: true,
        note: p.note ?? '', laborMinutes: p.laborMinutes != null ? String(p.laborMinutes) : '',
      }))
      const ms: MatLine[] = []
      rows.forEach((p, i) => p.materials.forEach((m) => ms.push({
        key: nextKey(), lineKey: String(ls[i].key), componentId: String(m.componentId),
        bomQty: '', extraQty: '', qty: String(m.quantity), note: m.note ?? '',
      })))
      setLines([...ls, ...Array.from({ length: Math.max(1, BLANK_ROWS - ls.length) }, blankLine)])
      setMats([...ms, ...Array.from({ length: Math.max(1, BLANK_ROWS - ms.length) }, () => blankMat())])
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [editNo])

  const itemById = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items])
  const whById = useMemo(() => new Map(warehouses.map((w) => [String(w.id), w])), [warehouses])
  const orderById = useMemo(() => new Map(orders.map((o) => [String(o.id), o])), [orders])
  const itemPicks = useMemo(() => items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: i.spec })), [items])
  /** 생산된공장 — 공장·외주를 먼저 보인다(원본 생산불출의 받는공장 검색이 공장만 보인다). */
  const factoryPicks = useMemo(() => [...warehouses]
    .sort((a, b) => Number(a.kind === '창고') - Number(b.kind === '창고'))
    .map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind })), [warehouses])
  const whPicks = useMemo(() => warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind })), [warehouses])
  const processPicks = useMemo(() => processes.map((p) => ({ value: String(p.id), code: p.code, name: p.name })), [processes])

  /** 생산된공장이 외주처면 품목의 [외주비단가]를 기본으로 깐다. 원 미만: 합계 반올림, 부가세 버림. */
  function recompute(l: ProdLine): ProdLine {
    const from = whById.get(l.fromWarehouseId || fromWarehouseId)
    const it = itemById.get(l.productId)
    let unitPrice = l.unitPrice
    if (unitPrice === '' && from?.kind === '외주' && it?.subcontractPrice) unitPrice = String(it.subcontractPrice)
    if (l.amountTouched) return { ...l, unitPrice }
    const amount = Math.round(num(unitPrice) * num(l.qty))
    return { ...l, unitPrice, amount: l.productId ? String(amount) : '', vat: l.productId ? String(Math.floor(amount * 0.1)) : '' }
  }

  function setLine(key: number, patch: Partial<ProdLine>) {
    setLines((ls) => {
      const next = ls.map((l) => (l.key === key ? recompute({ ...l, ...patch }) : l))
      // 마지막 빈 줄을 쓰면 빈 줄을 하나 더 단다(원본 격자처럼 끝없이 적어 내려간다).
      return next[next.length - 1].productId ? [...next, blankLine()] : next
    })
  }
  function setMat(key: number, patch: Partial<MatLine>) {
    setMats((ms) => {
      const next = ms.map((m) => {
        if (m.key !== key) return m
        const n = { ...m, ...patch }
        if (type === 'III' && 'extraQty' in patch && n.bomQty !== '') n.qty = String(num(n.bomQty) + num(n.extraQty))
        return n
      })
      return next[next.length - 1].componentId ? [...next, blankMat()] : next
    })
  }

  const filled = lines.filter((l) => l.productId)
  const lineOptions = filled.map((l, i) => {
    const it = itemById.get(l.productId)
    return { value: String(l.key), label: `${i + 1}. ${it?.code ?? ''} ${it?.name ?? ''}` }
  })

  /** [BOM풀기] — 생산품목마다 BOM 소요량 × 수량으로 [소모]를 다시 채운다. */
  async function explodeBom() {
    setError('')
    const out: MatLine[] = []
    const missing: string[] = []
    for (const l of filled) {
      if (!(num(l.qty) > 0)) continue
      try {
        const r = await api.get<ProductionMaterial[]>(`/productions/bom-preview?productId=${l.productId}&qty=${num(l.qty)}`)
        r.data.forEach((m) => out.push({
          key: nextKey(), lineKey: String(l.key), componentId: String(m.componentId),
          bomQty: String(m.quantity), extraQty: '', qty: String(m.quantity), note: '',
        }))
      } catch {
        missing.push(itemById.get(l.productId)?.name ?? '')
      }
    }
    setMats([...out, ...Array.from({ length: Math.max(1, BLANK_ROWS - out.length) }, () => blankMat())])
    setTab('소모')
    if (missing.length > 0) setError(`BOM 이 없는 품목은 풀지 못했습니다: ${missing.join(', ')}`)
  }

  /** 작업지시서 [잔량적용] — 고른 지시마다 생산품목 한 줄(수량 = 지시수량 − 기생산). */
  function applyOrders() {
    const picked = orders.filter((o) => woChecked.includes(o.id))
    if (picked.length === 0) { setWoOpen(false); return }
    const added: ProdLine[] = picked.map((o) => recompute({
      ...blankLine(), productId: String(o.productId), qty: String(o.remainingQty), workOrderId: String(o.id),
    }))
    setLines((ls) => [...ls.filter((l) => l.productId), ...added, blankLine()])
    // 원본처럼 비어 있는 머리를 지시서에서 채운다(담당자·받는창고).
    const first = picked[0]
    if (!employeeId && first.employeeId != null) setEmployeeId(String(first.employeeId))
    if (!warehouseId && type !== 'III') setWarehouseId(String(first.warehouseId))
    setWoChecked([])
    setWoOpen(false)
  }

  function reset() {
    setDate(today()); setEmployeeId(''); setFromWarehouseId(''); setWarehouseId(''); setProjectId('')
    setLines(Array.from({ length: BLANK_ROWS }, blankLine))
    setMats(Array.from({ length: BLANK_ROWS }, () => blankMat()))
    setTab('생산'); setError(''); setOk('')
    if (editNo) navigate(location.pathname, { replace: true })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (filled.length === 0) return setError('생산품목을 한 줄 이상 넣으세요.')
    if (type !== 'III' && !fromWarehouseId) return setError('생산된공장을 입력바랍니다.')
    if (type !== 'III' && !warehouseId) return setError('받는창고를 입력바랍니다.')
    for (const [i, l] of filled.entries()) {
      if (!(num(l.qty) > 0)) return setError(`${i + 1}번째 줄: 수량을 입력하세요.`)
      if (type === 'III' && !l.fromWarehouseId) return setError(`${i + 1}번째 줄: 생산된공장을 입력바랍니다.`)
      if (type === 'III' && !l.warehouseId) return setError(`${i + 1}번째 줄: 받는창고를 입력바랍니다.`)
    }
    const orphan = mats.find((m) => m.componentId && !filled.some((l) => String(l.key) === m.lineKey))
    if (type !== 'I' && orphan) return setError('[소모] 탭에서 생산품목을 고르지 않은 줄이 있습니다.')
    const body = {
      entryType: type,
      productionDate: date,
      employeeId: employeeId ? Number(employeeId) : null,
      projectId: projectId ? Number(projectId) : null,
      fromWarehouseId: type !== 'III' && fromWarehouseId ? Number(fromWarehouseId) : null,
      warehouseId: type !== 'III' && warehouseId ? Number(warehouseId) : null,
      lines: filled.map((l) => ({
        productId: Number(l.productId),
        workOrderId: l.workOrderId ? Number(l.workOrderId) : null,
        producedQty: num(l.qty),
        processId: l.processId ? Number(l.processId) : null,
        fromWarehouseId: type === 'III' && l.fromWarehouseId ? Number(l.fromWarehouseId) : null,
        warehouseId: type === 'III' && l.warehouseId ? Number(l.warehouseId) : null,
        subcontractUnitPrice: l.unitPrice === '' ? null : num(l.unitPrice),
        subcontractAmount: l.amount === '' ? null : num(l.amount),
        subcontractVat: l.vat === '' ? null : num(l.vat),
        note: l.note || null,
        laborMinutes: l.laborMinutes.trim() === '' ? null : Number(l.laborMinutes),
        materials: type === 'I' ? null : mats
          .filter((m) => m.componentId && m.lineKey === String(l.key) && num(m.qty) > 0)
          .map((m) => ({ componentId: Number(m.componentId), quantity: num(m.qty), note: m.note || null })),
      })),
    }
    setSaving(true)
    try {
      const r = editNo
        ? await api.put<Production[]>(`/productions/slips/${encodeURIComponent(editNo)}`, body)
        : await api.post<Production[]>('/productions/slips', body)
      const no = r.data[0]?.prodNo ?? ''
      const total = r.data.reduce((n, p) => n + Number(p.producedQty), 0)
      reset()
      setOk(`${editNo ? '수정' : '저장'}되었습니다. ${no} · ${r.data.length}줄 · 수량 ${won(total)}`)
      api.get<WorkOrder[]>('/work-orders').then((x) => setOrders(x.data)).catch(() => {})
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeSlip() {
    if (!editNo || !window.confirm(`${editNo} 전표를 삭제합니다. 재고와 작업지시 진척이 되돌아갑니다.`)) return
    try {
      await api.delete(`/productions/slips/${encodeURIComponent(editNo)}`)
      navigate('/production/receipt-inquiry')
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /* 칸이 화면(I·II·III)·탭 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const gridRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(gridRef, TITLES[type], [tab, lines.length, mats.length])

  const openOrders = orders.filter((o) => o.status !== 'COMPLETED' && Number(o.remainingQty) > 0)
  const totalQty = filled.reduce((n, l) => n + num(l.qty), 0)
  const totalAmt = filled.reduce((n, l) => n + num(l.amount), 0)
  const totalVat = filled.reduce((n, l) => n + num(l.vat), 0)
  const matsFilled = mats.filter((m) => m.componentId)

  const prodGrid = (
    <div style={{ overflowX: 'auto' }}>
      <table className="ec-grid-input no-ec" style={{ tableLayout: 'fixed', minWidth: type === 'III' ? 1180 : 1240 }}>
        <colgroup>
          <col style={{ width: 30 }} />
          {type === 'III' && <col style={{ width: 150 }} />}
          <col style={{ width: 110 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 100 }} />
          {type === 'III' && <col style={{ width: 150 }} />}
          {type === 'III' && <col style={{ width: 150 }} />}
          <col style={{ width: 90 }} />
          {type !== 'III' && <col style={{ width: 100 }} />}
          {type !== 'III' && <col style={{ width: 110 }} />}
          {type !== 'III' && <col style={{ width: 100 }} />}
          <col style={{ width: 160 }} />
          {type !== 'III' && <col style={{ width: 80 }} />}
          <col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr>
            <th />
            {type === 'III' && <th style={{ textAlign: 'left' }}>공정</th>}
            <th style={{ textAlign: 'left' }}>생산품목코드</th>
            <th style={{ textAlign: 'left' }}>생산품목명</th>
            <th style={{ textAlign: 'left' }}>규격</th>
            {type === 'III' && <th style={{ textAlign: 'left' }}>생산된공장</th>}
            {type === 'III' && <th style={{ textAlign: 'left' }}>받는창고</th>}
            <th style={{ textAlign: 'right' }}>수량</th>
            {type !== 'III' && <th style={{ textAlign: 'right' }}>외주비단가</th>}
            {type !== 'III' && <th style={{ textAlign: 'right' }}>외주비합계</th>}
            {type !== 'III' && <th style={{ textAlign: 'right' }}>외주비부가세</th>}
            <th style={{ textAlign: 'left' }}>적요</th>
            {type !== 'III' && <th style={{ textAlign: 'right' }}>노무시간</th>}
            <th style={{ textAlign: 'left' }}>작업지시서</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const it = itemById.get(l.productId)
            const wo = orderById.get(l.workOrderId)
            return (
              <tr key={l.key}>
                <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{idx + 1}</td>
                {type === 'III' && (
                  <td className="pad">
                    <CodePickerField label="공정" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                     value={l.processId} onChange={(v) => setLine(l.key, { processId: v })} items={processPicks} />
                  </td>
                )}
                <td className="pad" style={{ fontFamily: 'ui-monospace, monospace', color: '#5a626e', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {it?.code ?? ''}
                </td>
                <td className="pad">
                  <CodePickerField label="생산품목" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                   value={l.productId}
                                   onChange={(v) => setLine(l.key, { productId: v, workOrderId: v === l.productId ? l.workOrderId : '', unitPrice: '', amountTouched: false })}
                                   items={itemPicks} />
                </td>
                <td className="pad" style={{ color: '#5a626e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it?.spec ?? ''}</td>
                {type === 'III' && (
                  <td className="pad">
                    <CodePickerField label="생산된공장" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                     value={l.fromWarehouseId} onChange={(v) => setLine(l.key, { fromWarehouseId: v })} items={factoryPicks} />
                  </td>
                )}
                {type === 'III' && (
                  <td className="pad">
                    <CodePickerField label="받는창고" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                     value={l.warehouseId} onChange={(v) => setLine(l.key, { warehouseId: v })} items={whPicks} />
                  </td>
                )}
                <td>
                  <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!l.productId}
                         value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                </td>
                {type !== 'III' && (
                  <td>
                    <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!l.productId}
                           value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value, amountTouched: false })} />
                  </td>
                )}
                {type !== 'III' && (
                  <td>
                    <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!l.productId}
                           value={l.amount}
                           onChange={(e) => setLine(l.key, { amount: e.target.value, vat: String(Math.floor(num(e.target.value) * 0.1)), amountTouched: true })} />
                  </td>
                )}
                {type !== 'III' && (
                  <td>
                    <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!l.productId}
                           value={l.vat} onChange={(e) => setLine(l.key, { vat: e.target.value, amountTouched: true })} />
                  </td>
                )}
                <td>
                  <input className="cell" disabled={!l.productId} value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} />
                </td>
                {type !== 'III' && (
                  <td>
                    <input className="cell" type="number" min={0} style={{ textAlign: 'right' }} disabled={!l.productId} placeholder={l.productId ? '분' : ''}
                           value={l.laborMinutes} onChange={(e) => setLine(l.key, { laborMinutes: e.target.value })} />
                  </td>
                )}
                <td className="pad" style={{ color: '#5a626e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={wo ? `잔량 ${won(Number(wo.remainingQty))}` : undefined}>
                  {wo ? `${dateText(wo.orderDate)} ${wo.orderNo}` : ''}
                  {wo && (
                    <button type="button" className="no-ec" title="작업지시서 연결 끊기"
                            style={{ marginLeft: 4, border: 0, background: 'none', color: '#c60a2e', cursor: 'pointer' }}
                            onClick={() => setLine(l.key, { workOrderId: '' })}>×</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={type === 'III' ? 7 : 4} />
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(totalQty)}</td>
            {type !== 'III' && <td />}
            {type !== 'III' && <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(totalAmt)}</td>}
            {type !== 'III' && <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(totalVat)}</td>}
            <td colSpan={type !== 'III' ? 3 : 2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )

  const consumeGrid = (
    <div style={{ overflowX: 'auto' }}>
      <table className="ec-grid-input no-ec" style={{ tableLayout: 'fixed', minWidth: 1100 }}>
        <colgroup>
          <col style={{ width: 30 }} />
          {type === 'III' && <col style={{ width: 120 }} />}
          <col style={{ width: 260 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 220 }} />
          {type === 'II' && <col style={{ width: 100 }} />}
          {type === 'III' && <col style={{ width: 90 }} />}
          <col style={{ width: 90 }} />
          {type === 'III' && <col style={{ width: 90 }} />}
          <col style={{ width: 180 }} />
        </colgroup>
        <thead>
          <tr>
            <th />
            {type === 'III' && <th style={{ textAlign: 'left' }}>공정</th>}
            <th style={{ textAlign: 'left' }}>생산품목</th>
            <th style={{ textAlign: 'left' }}>소모품목코드</th>
            <th style={{ textAlign: 'left' }}>소모품목명</th>
            {type === 'II' && <th style={{ textAlign: 'left' }}>규격</th>}
            {type === 'III' && <th style={{ textAlign: 'right' }}>추가수량</th>}
            <th style={{ textAlign: 'right' }}>수량</th>
            {type === 'III' && <th style={{ textAlign: 'right' }}>작지 수량</th>}
            <th style={{ textAlign: 'left' }}>적요</th>
          </tr>
        </thead>
        <tbody>
          {mats.map((m, idx) => {
            const c = itemById.get(m.componentId)
            const owner = lines.find((l) => String(l.key) === m.lineKey)
            const proc = processes.find((p) => String(p.id) === owner?.processId)
            return (
              <tr key={m.key}>
                <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{idx + 1}</td>
                {type === 'III' && <td className="pad" style={{ color: '#5a626e' }}>{proc?.name ?? ''}</td>}
                <td>
                  <select className="cell" value={m.lineKey} onChange={(e) => setMat(m.key, { lineKey: e.target.value })}>
                    <option value="" />
                    {lineOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="pad" style={{ fontFamily: 'ui-monospace, monospace', color: '#5a626e', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c?.code ?? ''}</td>
                <td className="pad">
                  <CodePickerField label="소모품목" hideLabel fill placeholder="" emptyLabel="선택 해제"
                                   value={m.componentId}
                                   onChange={(v) => setMat(m.key, { componentId: v, lineKey: m.lineKey || (filled.length === 1 ? String(filled[0].key) : '') })}
                                   items={itemPicks} />
                </td>
                {type === 'II' && <td className="pad" style={{ color: '#5a626e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c?.spec ?? ''}</td>}
                {type === 'III' && (
                  <td>
                    <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!m.componentId}
                           value={m.extraQty} onChange={(e) => setMat(m.key, { extraQty: e.target.value })} />
                  </td>
                )}
                <td>
                  <input className="cell" type="number" step="any" style={{ textAlign: 'right' }} disabled={!m.componentId}
                         value={m.qty} onChange={(e) => setMat(m.key, { qty: e.target.value })} />
                </td>
                {type === 'III' && <td className="pad" style={{ textAlign: 'right', color: '#8a929c' }}>{m.bomQty !== '' ? won(num(m.bomQty)) : ''}</td>}
                <td>
                  <input className="cell" disabled={!m.componentId} value={m.note} onChange={(e) => setMat(m.key, { note: e.target.value })} />
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={type === 'III' ? 5 : 4} />
            {type === 'II' && <td />}
            {type === 'III' && <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(matsFilled.reduce((n, m) => n + num(m.extraQty), 0))}</td>}
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(matsFilled.reduce((n, m) => n + num(m.qty), 0))}</td>
            {type === 'III' && <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(matsFilled.reduce((n, m) => n + num(m.bomQty), 0))}</td>}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <EcSlipShell
        title={TITLES[type] + (editNo ? ` (${editNo})` : '')}
        actions={[
          { label: saving ? '저장 중…' : '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '다시 작성', onClick: reset },
          { label: '리스트', onClick: () => navigate('/production/receipt-inquiry') },
          ...(editNo ? [{ label: '삭제', onClick: () => void removeSlip() }] : []),
        ]}
        help={
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>저장하면 <b>받는창고</b>로 생산품목이 들어오고, <b>생산된공장</b>에서 소모품목이 빠집니다.</li>
            {type === 'I' && <li>소모는 <b>BOM 소요량 × 수량</b>으로 자동 계산합니다. BOM 이 없는 품목은 저장되지 않습니다.</li>}
            {type !== 'I' && <li>소모는 <b>[소모] 탭에 넣은 것만</b> 빠집니다. [BOM풀기]로 BOM 기준 소요량을 채운 뒤 고치세요. 비워 두면 자재는 빠지지 않습니다.</li>}
            {type === 'III' && <li>줄마다 공정·생산된공장·받는창고를 따로 정합니다. [작지수량]은 BOM 기준이고, [추가수량]을 넣으면 수량 = 작지수량 + 추가수량입니다.</li>}
            <li><b>[작업지시서]</b>로 지시를 고르면 잔량(지시수량 − 기생산)이 수량으로 들어옵니다. 지시를 넘겨 입고할 수는 없습니다.</li>
            <li>생산된공장이 <b>외주</b> 창고면 품목의 외주비단가로 외주비합계·부가세(10%, 원 미만 버림)를 계산합니다.</li>
            <li>줄이 몇 개든 전표번호는 하나입니다. 생산입고조회에서 번호를 누르면 이 화면으로 다시 열어 고칠 수 있습니다.</li>
          </ul>
        }
      >
        <ul className="ec-form">
          <li>
            <div className="title">일자</div>
            <div className="form"><EcDateField value={date} onChange={setDate} /></div>
          </li>
          <li>
            <div className="title">담당자</div>
            <div className="form">
              <CodePickerField label="담당자" hideLabel pair value={employeeId} onChange={setEmployeeId}
                               items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
          </li>
          {type !== 'III' && (
            <li>
              <div className="title">생산된공장<span className="req">*</span></div>
              <div className="form">
                <CodePickerField label="생산된공장" hideLabel pair value={fromWarehouseId}
                                 onChange={(v) => { setFromWarehouseId(v); setLines((ls) => ls.map((l) => (l.amountTouched ? l : recompute({ ...l, unitPrice: '' })))) }}
                                 items={factoryPicks} />
              </div>
            </li>
          )}
          {type !== 'III' && (
            <li>
              <div className="title">받는창고<span className="req">*</span></div>
              <div className="form">
                <CodePickerField label="받는창고" hideLabel pair value={warehouseId} onChange={setWarehouseId} items={whPicks} />
              </div>
            </li>
          )}
          <li>
            <div className="title">프로젝트</div>
            <div className="form">
              <CodePickerField label="프로젝트" hideLabel pair value={projectId} onChange={setProjectId}
                               items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
          </li>
        </ul>

        <ul className="ec-tabs" style={{ marginTop: 10 }}>
          {TABS.map((t) => (type === 'I' && t === '소모' ? null : (
            <li key={t} className={`ec-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</li>
          )))}
        </ul>

        <div className="ec-toolbar">
          {tab === '생산' ? (
            <>
              <button type="button" className="ec-btn ec-btn-sm" disabled={myItems.busy} onClick={myItems.pick}>My품목</button>
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => { setWoChecked([]); setWoOpen(true) }}>작업지시서</button>
              {type !== 'I' && <button type="button" className="ec-btn ec-btn-sm" onClick={() => void explodeBom()}>BOM풀기</button>}
              <MyItemsNote note={myItems.note} />
            </>
          ) : (
            <>
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => void explodeBom()}>BOM풀기</button>
              <span style={{ fontSize: 11.5, color: '#8a929c', marginLeft: 6 }}>
                생산품목마다 BOM 소요량 × 수량으로 다시 채웁니다(지금 [소모] 줄은 지워집니다).
              </span>
            </>
          )}
        </div>

        <div ref={gridRef}>{tab === '생산' ? prodGrid : consumeGrid}</div>

        {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, margin: '8px 0' }}>{error}</p>}
        {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, margin: '8px 0' }}>{ok}</p>}
      </EcSlipShell>

      <Modal open={woOpen} title="작업지시서조회" error={error} width={900} onClose={() => setWoOpen(false)}>
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 30 }} />
                <th>작업지시서일자</th>
                <th>거래처명</th>
                <th>품목코드</th>
                <th>품목명[규격]</th>
                <th style={{ textAlign: 'right' }}>수량</th>
                <th style={{ textAlign: 'right' }}>잔량</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>등록된 데이터가 없습니다.</td></tr>
              ) : openOrders.map((o) => (
                <tr key={o.id} style={{ cursor: 'pointer' }}
                    onClick={() => setWoChecked((c) => (c.includes(o.id) ? c.filter((x) => x !== o.id) : [...c, o.id]))}>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" readOnly checked={woChecked.includes(o.id)} /></td>
                  <td>{dateText(o.orderDate)} {o.orderNo}</td>
                  <td>{o.partnerName ?? ''}</td>
                  <td>{o.productCode}</td>
                  <td>{o.productName}{o.productSpec ? ` [${o.productSpec}]` : ''}</td>
                  <td style={{ textAlign: 'right' }}>{won(Number(o.plannedQty))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(Number(o.remainingQty))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          <button type="button" className="ec-btn ec-btn-primary" onClick={applyOrders}>잔량적용</button>
          <button type="button" className="ec-btn" onClick={() => setWoOpen(false)}>닫기</button>
        </div>
      </Modal>
    </form>
  )
}
