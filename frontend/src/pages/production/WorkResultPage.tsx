import { useEffect, useState, type FormEvent, useRef} from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import type { Item } from '../../types/api'
import { dateText } from '../../utils/dateText'
import { dateNo } from '../../utils/dateNo'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { minToHours, hoursToMin, fmt2 } from '../../utils/workHours'
import EcDateInput from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'

/**
 * 생산관리 > 작업 > 작업내역입력 (/api/work-results).
 *
 * <p>원본 머리 실측(사본): 일자 · <b>생산공장</b> · 담당자 · 생산품목.
 * 그리드는 생산품목코드/명 · 작업품목코드/명 · 수량 · 투입자원 · 작업시간 · <b>적요</b>.
 *
 * <p>원본은 <b>작업지시 없이</b> 줄마다 생산품목 · 작업 · 작업품목 · 수량 · 투입자원 · 작업시간(H) · 적요를
 * 바로 넣는다(2026-10-29 데이터이관 QA 79회 — 우리는 작업지시를 골라야만 생산품목이 찼다).
 * 작업지시는 고를 수 있는 칸으로 남긴다 — 고르면 그 지시의 생산품목이 들어온다.
 * [작업]은 그 생산품목의 BOR 공정에 등록된 작업코드에서 고른다(BOR 이 없으면 작업코드 전부).
 * 작업시간은 원본처럼 <b>시간(H)</b>으로 받는다 — 서버는 분으로 저장한다(utils/workHours).
 */
interface WorkResult {
  id: number
  /** 전표번호 WR-yyyyMMdd-NNNN — 같은 번호의 줄이 한 전표다. */
  resultNo: string
  workOrderId: number | null
  workOrderNo: string | null
  process: string
  operationName: string | null
  warehouseId: number | null
  warehouseName: string | null
  productCode: string | null
  productName: string | null
  /** 원본 그리드의 [작업품목] — 이 작업이 다루는 품목. 생산품목과 다르다. */
  workItemId: number | null
  workItemCode: string | null
  workItemName: string | null
  workItemSpec: string | null
  resourceId: number | null
  resourceName: string | null
  worker: string | null
  goodQty: number
  defectQty: number
  workTimeMin: number
  workDate: string
  note: string | null
}
/** 원본 격자의 [생산품목코드]·[생산품목명] — 고른 작업지시에서 따라온다. */
interface WorkOrder { id: number; orderNo: string; productCode: string; productName: string }
interface Process { id: number; name: string }
/** 작업코드(공정등록 › 작업코드등록). 원본 격자 [작업]의 후보. */
interface Operation { id: number; processId: number; processName: string; code: string; name: string; active: boolean }
interface Warehouse { id: number; code: string; name: string; kind: string; active: boolean }
interface Project { id: number; code: string; name: string }

const inputCls = 'ec-input w-full'
/** 원본 머리: 일자 · 생산공장 · 담당자 · 프로젝트. 줄마다 되풀이하지 않는다. */
const emptyForm = {
  warehouseId: '', worker: '', workDate: todayYmd(),
  /** 원본 작업내역입력 머리의 [프로젝트]. 안 정할 수 있다. */
  projectId: '',
}
/** 원본 격자 한 줄. */
interface WrLine {
  key: number
  workOrderId: string
  /** 원본 [생산품목]. 작업지시를 고르면 그 지시의 생산품목이다. */
  productId: string
  /** 원본 [작업] — 작업코드 id. 고르면 process 는 그 작업코드의 공정명. */
  operationId: string
  process: string
  workItemId: string
  resourceId: string
  goodQty: string
  defectQty: string
  /** 작업시간(H). 저장할 때 분으로 바꾼다. */
  workHours: string
  note: string
}
let wrLineKey = 0
const emptyLine = (): WrLine => ({
  key: ++wrLineKey, workOrderId: '', productId: '', operationId: '', process: '', workItemId: '', resourceId: '',
  goodQty: '', defectQty: '', workHours: '', note: '',
})

export default function WorkResultPage() {
  const [rows, setRows] = useState<WorkResult[]>([])
  /*
   * <b>고르는 칸에 쓸 것만 받는다.</b> 이 화면이 작업지시로 하는 일은 &lt;select&gt; 에
   * 지시번호와 품목을 그리는 것뿐인데, 여태 작업지시 목록을 통째로 받았다
   * (2026-09-24 실측 937KB). /work-orders/options 는 네 칸만 낸다.
   */
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  /** BOR — 생산품목이 거치는 공정. [작업] 후보를 그 공정의 작업코드로 좁힌다. */
  const [borRows, setBorRows] = useState<{ productId: number; processId: number }[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  /** 원본 그리드의 [작업품목] 후보. */
  const [items, setItems] = useState<Item[]>([])
  /** 원본 그리드의 [투입자원]. 자원등록의 [대상작업]과 짝이다. */
  const [resources, setResources] = useState<{ id: number; code: string; name: string; operationIds: number[]; operationNames: string[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /** 원본 [작업내역입력] 메뉴는 입력 창을 바로 연다. 닫으면 아래 전표 목록이 보인다. */
  const [showForm, setShowForm] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [wrLines, setWrLines] = useState<WrLine[]>([emptyLine()])
  const setWrLine = (key: number, patch: Partial<WrLine>) =>
    setWrLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  /**
   * 원본 격자 툴바의 <b>[My품목]</b>. 예외에 '전표 입력 격자를 이 화면에 붙이지 않았다'고
   * 적혀 있었는데 <b>틀렸다</b> — 이 화면은 진작 격자였고(<code>wrLines</code>·[줄 추가]),
   * 줄마다 <b>[작업품목]</b>(<code>workItemId</code>)을 고른다. 부을 자리가 있는데
   * 묶음 예외에 섞여 아무도 안 보고 있었다.
   *
   * <p>작업내역은 <b>단가를 안 든다</b> — 품목과 수량만 붓고, 수량은 <b>양품</b>으로 넣는다
   * (불량은 사람이 적는 값이라 지어내지 않는다).
   */
  const myItems = useMyItemsPick((picked) => setWrLines((ls) => {
    const kept = ls.filter((l) => l.workItemId)
    const added = picked.map((m) => ({ ...emptyLine(), workItemId: String(m.itemId), goodQty: String(m.defaultQty) }))
    return [...kept, ...added, emptyLine()]
  }))

  /*
   * 원본 툴바의 <b>[작업지시서]</b> — 진행 중인 작업지시서를 골라 그 지시의 생산품목으로 작업 줄을 채운다
   * (작업품목은 생산품목으로, 수량은 비워 둔다 — 한 작업을 얼마나 했는지는 사람이 적는다).
   */
  const [woPickOpen, setWoPickOpen] = useState(false)
  const [woFull, setWoFull] = useState<{ id: number; orderNo: string; orderDate: string; productId: number; productCode: string;
    productName: string; plannedQty: number; remainingQty: number; status: string }[]>([])
  const [woPicked, setWoPicked] = useState<number[]>([])
  async function openWoPick() {
    try {
      // 원본 작업지시서조회 창도 지시일 기간을 달고 뜬다(기본 최근30일 +1개월).
      const p = periodOf('최근30일(+1개월)')!
      const r = await api.get<typeof woFull>('/work-orders', { params: { from: p.from, to: p.to } })
      setWoFull(r.data.filter((w) => w.status !== 'COMPLETED')); setWoPicked([]); setWoPickOpen(true)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  function applyWo() {
    const picked = woFull.filter((w) => woPicked.includes(w.id))
    setWrLines((ls) => [...ls.filter((l) => l.workOrderId || l.workItemId),
      ...picked.map((w) => ({ ...emptyLine(), workOrderId: String(w.id), productId: String(w.productId), workItemId: String(w.productId) })), emptyLine()])
    setWoPickOpen(false)
  }

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<WorkResult[]>('/work-results')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadRefs() {
    try {
      const [wo, pr, rs, wh, it, pj, op, bor] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders/options'),
        api.get<Process[]>('/processes'),
        api.get<{ id: number; code: string; name: string; operationIds: number[]; operationNames: string[] }[]>('/resources'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<Item[]>('/items'),
        api.get<Project[]>('/projects'),
        api.get<Operation[]>('/process-operations'),
        api.get<{ productId: number; processId: number }[]>('/bor'),
      ])
      setOperations(op.data.filter((o) => o.active))
      setBorRows(bor.data)
      setWorkOrders(wo.data)
      setProcesses(pr.data)
      setResources(rs.data)
      setWarehouses(wh.data.filter((w) => w.active))
      // 사용중지된 품목은 새로 고를 수 없다 — 서버도 거절한다.
      setItems(it.data.filter((x) => x.active))
      setProjects(pj.data)
    } catch {
      /* 참조 로딩 실패는 폼 사용에만 영향 */
    }
  }

  useEffect(() => { load(); loadRefs() }, [])
  /*
   * 작업지시서작업처리 [작업내역입력] 이 넘긴 줄 — 원본처럼 입력 창이 그 줄들로 채워져 열린다.
   * 한 번 쓰고 지운다(새로고침하면 빈 창).
   */
  useEffect(() => {
    let raw: string | null = null
    try { raw = sessionStorage.getItem('workEntryPrefill'); sessionStorage.removeItem('workEntryPrefill') } catch { /* 없음 */ }
    if (!raw) return
    const p = JSON.parse(raw) as { workDate: string; warehouseId: number | null
      lines: { workOrderId: number; process: string; workItemId: number; goodQty: string; workTimeMin: string; note: string }[] }
    setForm((f) => ({ ...f, workDate: p.workDate, warehouseId: p.warehouseId != null ? String(p.warehouseId) : f.warehouseId }))
    /* 작업지시서작업처리는 분으로 넘긴다 — 이 화면은 원본처럼 시간(H)으로 받는다. */
    setWrLines([...p.lines.map((l) => ({ ...emptyLine(), workOrderId: String(l.workOrderId), process: l.process,
      workItemId: String(l.workItemId), goodQty: l.goodQty,
      workHours: l.workTimeMin === '' || l.workTimeMin == null ? '' : String(minToHours(Number(l.workTimeMin))), note: l.note })), emptyLine()])
    setShowForm(true)
  }, [])

  /**
   * 원본 툴바 <b>[연결전표]</b> → 생산입고연결전표(2026-10-02 loginaa 실측). 이 작업내역 전표에서 만든 생산입고를 보이고
   * [신규(F2)] 로 생산입고 I 을 연다 — 작업 줄의 작업지시서 · 생산품목 · 양품수량이 생산 줄로 채워지고, 저장하면
   * 그 생산입고가 이 번호를 든다. 아직 저장 전이면 원본처럼 "먼저 저장해야 합니다" 를 묻고 저장부터 한다.
   */
  const navigate = useNavigate()
  const [linked, setLinked] = useState<{ resultNo: string; workDate: string; lines: { productId: number; goodQty: number; workOrderId: number | null }[] } | null>(null)
  const [linkRows, setLinkRows] = useState<{ id: number; prodNo: string; productionDate: string; productName: string; producedQty: number; warehouseName: string }[] | null>(null)
  async function openLinked(target = linked) {
    if (!target) return
    try {
      setLinkRows((await api.get<NonNullable<typeof linkRows>>(`/productions/by-work-result/${encodeURIComponent(target.resultNo)}`)).data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  async function linkSlip() {
    if (linked) return void openLinked()
    if (!(await ecConfirm('연결전표를 생성하려면 먼저 저장해야 합니다.\n계속 진행하겠습니까?'))) return
    const saved = await save()
    if (saved) await openLinked(saved)
  }
  function newLinkedReceipt() {
    if (!linked) return
    const prefill = { workResultNo: linked.resultNo, date: linked.workDate,
      lines: linked.lines.filter((l) => l.goodQty > 0).map((l) => ({ productId: l.productId, qty: l.goodQty, workOrderId: l.workOrderId })) }
    try { sessionStorage.setItem('receiptPrefill', JSON.stringify(prefill)) } catch { /* 저장소가 막혀 있으면 빈 창 */ }
    navigate('/production/receipt-bom')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    await save()
  }

  async function save(): Promise<NonNullable<typeof linked> | null> {
    setError('')
    // 아무것도 안 적은 빈 줄은 보내지 않는다. 줄 추가만 눌러 두고 지우지 않은 경우다.
    const lines = wrLines.filter(
      (l) => l.process.trim() !== '' || l.operationId !== '' || l.productId !== '' || l.workOrderId !== ''
        || l.goodQty !== '' || l.defectQty !== '',
    )
    if (lines.length === 0) {
      setError('작업을 한 줄 이상 넣으세요.')
      return null
    }
    try {
      const res = await api.post<{ resultNo: string; workDate: string; productId: number; goodQty: number; workOrderId: number | null }[]>('/work-results/batch', {
        workDate: form.workDate || null,
        warehouseId: form.warehouseId === '' ? null : Number(form.warehouseId),
        projectId: form.projectId === '' ? null : Number(form.projectId),
        lines: lines.map((l) => ({
          workOrderId: l.workOrderId === '' ? null : Number(l.workOrderId),
          productId: l.productId === '' ? null : Number(l.productId),
          operationId: l.operationId === '' ? null : Number(l.operationId),
          process: l.process,
          workItemId: l.workItemId === '' ? null : Number(l.workItemId),
          resourceId: l.resourceId === '' ? null : Number(l.resourceId),
          worker: form.worker,
          goodQty: l.goodQty === '' ? 0 : Number(l.goodQty),
          defectQty: l.defectQty === '' ? 0 : Number(l.defectQty),
          workTimeMin: hoursToMin(l.workHours),
          note: l.note || null,
        })),
      })
      const saved = { resultNo: res.data[0]?.resultNo ?? '', workDate: res.data[0]?.workDate ?? form.workDate,
        lines: res.data.map((r) => ({ productId: r.productId, goodQty: Number(r.goodQty), workOrderId: r.workOrderId })) }
      setLinked(saved)
      setForm(emptyForm)
      setWrLines([emptyLine()])
      // 원본처럼 저장하면 말 없이 빈 입력 창으로 돌아간다.
      load()
      return saved
    } catch (err) {
      setError(extractErrorMessage(err))
      return null
    }
  }

  /** 전표째 지운다 — 목록이 전표 한 장 한 줄이라 그 줄들을 다 지운다. */
  async function removeSlip(ls: WorkResult[]) {
    const r = ls[0]
    if (!(await ecConfirm(`${dateNo(r.workDate, r.resultNo)} 작업내역(${ls.length}줄)을 삭제할까요?`))) return
    try {
      for (const x of ls) await api.delete(`/work-results/${x.id}`)
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || (r.workOrderNo ?? '').includes(keyword) || r.process.includes(keyword))
  /** 결과번호(resultNo)로 묶은 전표. 줄 차례는 넣은 차례(id). */
  const slips = (() => {
    const m = new Map<string, WorkResult[]>()
    for (const r of shown) {
      const k = r.resultNo || `#${r.id}`
      const ls = m.get(k)
      if (ls) ls.push(r); else m.set(k, [r])
    }
    return [...m.values()].map((ls) => [...ls].sort((x, y) => x.id - y.id))
      .sort((x, y) => (x[0].workDate < y[0].workDate ? 1 : x[0].workDate > y[0].workDate ? -1 : y[0].id - x[0].id))
  })()
  /** 원본 [작업품목명[규격명]] — 첫 줄 품목 + 줄이 여럿이면 ' 외 n건'. */
  const slipItemLabel = (ls: WorkResult[]) => {
    const f = ls.find((x) => x.workItemName)
    if (!f) return ''
    return `${f.workItemName}${f.workItemSpec ? `[${f.workItemSpec}]` : ''}${ls.length > 1 ? ` 외 ${ls.length - 1}건` : ''}`
  }


  /** 고른 작업지시. 고르면 생산품목은 그 지시의 것이다. */
  const woOf = (l: WrLine) => workOrders.find((w) => String(w.id) === l.workOrderId)
  /** 줄의 생산품목 id — 작업지시를 골랐으면 그 지시의 생산품목(품목코드로 찾는다). */
  const productIdOf = (l: WrLine): number | null => {
    const wo = woOf(l)
    if (wo) return items.find((x) => x.code === wo.productCode)?.id ?? null
    return l.productId ? Number(l.productId) : null
  }
  /** [작업] 후보 — 생산품목의 BOR 공정에 등록된 작업코드. BOR 이 없거나 품목을 안 골랐으면 작업코드 전부. */
  const opsFor = (pid: number | null) => {
    const procs = new Set(borRows.filter((b) => b.productId === pid).map((b) => b.processId))
    return procs.size ? operations.filter((o) => procs.has(o.processId)) : operations
  }
  /** 대상작업을 정한 자원은 그 작업(작업코드)에서만 — 작업코드 없이 공정명만 적었으면 그 공정의 작업코드면 된다. */
  const resourceFits = (r: (typeof resources)[number], l: WrLine) => {
    if (r.operationIds.length === 0) return true
    if (l.operationId) return r.operationIds.includes(Number(l.operationId))
    if (!l.process) return true
    return operations.some((o) => r.operationIds.includes(o.id) && o.processName === l.process)
  }

  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '작업내역입력', [])

  return (
    <EcListShell
      title="작업내역입력"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/*
        격자가 열두 칸이라 기본 폭(640)으로는 팝업 밖으로 넘친다 — 브라우저로 열어 보고 알았다.
        Modal 은 maxWidth 96vw 라 좁은 화면에서는 알아서 줄어든다.
      */}
      <Modal error={error} open={showForm} title="작업내역입력" width={1180} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); e.currentTarget.requestSubmit() } }} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div className="text-[13px] font-extrabold text-ec-navy mb-[8px]">새 작업내역 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              {/* 원본 머리의 이름은 [일자]다(사본 실측). */}
              <label className="mb-1 block text-sm text-ec-label">일자</label>
              <EcDateInput className={inputCls} value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">생산공장</label>
              {/* 원본은 <b>코드도움</b>으로 받는다(사본 실측) — 창고가 몇십 개만 돼도
                  드롭다운으로는 코드로 못 찾는다. */}
              <CodePickerField label="생산공장" hideLabel fill placeholder="생산공장" emptyLabel="선택 안 함"
                               value={form.warehouseId} onChange={(v) => setForm({ ...form, warehouseId: v })}
                               items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">담당자</label>
              <input className={inputCls} value={form.worker} onChange={(e) => setForm({ ...form, worker: e.target.value })} />
            </div>
            <div>
              {/* 원본 작업내역입력 머리의 [프로젝트]. 프로젝트별 집계에 이 작업이 잡힌다. */}
              <label className="mb-1 block text-sm text-ec-label">프로젝트</label>
              <CodePickerField label="프로젝트" hideLabel fill emptyLabel="선택 해제"
                               value={form.projectId} onChange={(v) => setForm({ ...form, projectId: v })}
                               items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
            </div>
          </div>

          {/*
            원본 작업내역입력은 격자다. 머리(일자·생산공장·담당자·프로젝트)를 한 번 정하고
            작업은 여러 줄 넣는다. 한 줄이라도 막히면 서버가 전부 되돌린다 — 두 줄만 들어가면
            작업시간 합계가 조용히 모자란 채로 남고 효율현황이 그 값으로 계산된다.
          */}
          <div className="flex items-center gap-[8px] mt-[12px] mb-[4px]">
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#3f4855' }}>작업</span>
            <button type="button" className="ec-btn" onClick={() => setWrLines([...wrLines, emptyLine()])}>줄 추가</button>
            <button type="button" className="ec-btn" disabled={myItems.busy} onClick={myItems.pick}>My품목</button>
            <MyItemsNote note={myItems.note} />
            <button type="button" className="ec-btn" onClick={() => void linkSlip()}>연결전표</button>
            <button type="button" className="ec-btn" onClick={() => void openWoPick()}>작업지시서</button>
          </div>
          {woPickOpen && (
            <div className="border border-ec-line border-solid bg-white p-[8px] mb-[8px]">
              <div className="font-bold text-[12.5px] mb-[6px]">작업지시서조회</div>
              <div className="max-h-[220px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="w-[30px]" />
                      <th>작업지시서일자</th>
                      <th>품목코드</th>
                      <th>품목명</th>
                      <th className="text-right">수량</th>
                      <th className="text-right">잔량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {woFull.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-ec-hint p-[12px]">등록된 데이터가 없습니다.</td></tr>
                    ) : woFull.map((w) => (
                      <tr key={w.id} className="cursor-pointer"
                          onClick={() => setWoPicked((p) => (p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]))}>
                        <td className="text-center"><input type="checkbox" readOnly checked={woPicked.includes(w.id)} /></td>
                        <td>{dateText(w.orderDate)} {w.orderNo}</td>
                        <td>{w.productCode}</td>
                        <td>{w.productName}</td>
                        <td className="text-right">{Number(w.plannedQty).toLocaleString()}</td>
                        <td className="text-right">{Number(w.remainingQty).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-[4px] mt-[6px]">
                <button type="button" className="ec-btn ec-btn-primary" onClick={applyWo}>적용(F8)</button>
                <button type="button" className="ec-btn" onClick={() => setWoPickOpen(false)}>닫기</button>
              </div>
            </div>
          )}
          {/* 좁은 창에서는 열두 칸이 다 안 들어간다 — 잘리지 말고 옆으로 밀리게 둔다. */}
          <div className="overflow-x-auto">
          <table ref={tableRef} className="ec-grid" style={{ width: '100%', minWidth: 1040 }}>
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                {/*
                  원본 격자 열(2026-10-30 실측): 생산품목코드 · 생산품목명 · 작업 · 작업품목코드 · 작업품목명 ·
                  수량 · 투입자원 · 작업시간 · 적요. [작업지시] · [양품] · [불량] 칸은 원본에 없다 — 작업지시는
                  격자 위 [작업지시서] 로 불러오고(그 줄의 생산품목이 지시의 것으로 묶인다), 수량은 한 칸이다.
                */}
                <th className="w-[120px]">생산품목코드</th>
                <th className="w-[160px]">생산품목명</th>
                <th className="w-[140px]">작업</th>
                <th className="w-[120px]">작업품목코드</th>
                <th>작업품목명</th>
                <th className="w-[90px] text-right">수량</th>
                <th className="w-[150px]">투입자원</th>
                {/* 원본 머리는 [작업시간] — 단위는 시간(H)이다(합계 40.00). */}
                <th className="w-[100px] text-right">작업시간</th>
                <th className="w-[150px]">적요</th>
              </tr>
            </thead>
            <tbody>
              {wrLines.map((l, idx) => {
                const wo = woOf(l)
                const ops = opsFor(productIdOf(l))
                return (
                <tr key={l.key}>
                  <td className="text-center text-ec-hint whitespace-nowrap">
                    {idx + 1}
                    <button type="button" title="줄 삭제" aria-label="줄 삭제"
                            className="ml-[2px] text-ec-hint bg-transparent border-0 cursor-pointer text-[11px] p-0"
                            onClick={() => setWrLines(wrLines.length > 1 ? wrLines.filter((x) => x.key !== l.key) : [emptyLine()])}>×</button>
                  </td>
                  {/*
                    원본 [생산품목코드] — 칸에는 <b>코드</b>를 적는다(E001 · A002). 이름을 적으면 칸이 좁아 '최신' · '익스' 처럼
                    잘렸다. 작업지시서에서 불러온 줄은 그 지시의 생산품목이라 고칠 칸이 아니다.
                  */}
                  <td>
                    {wo ? <span className="text-ec-muted" title={`작업지시서 ${wo.orderNo}`}>{wo.productCode}</span> : (
                      <CodePickerField label="생산품목" hideLabel fill showCode placeholder="생산품목코드" emptyLabel="선택 해제"
                                       value={l.productId} onChange={(v) => setWrLine(l.key, { productId: v, operationId: '', process: '' })}
                                       items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec ?? undefined }))} />
                    )}
                  </td>
                  <td className="text-ec-muted">
                    {wo ? wo.productName : items.find((x) => String(x.id) === l.productId)?.name ?? ''}
                  </td>
                  <td>
                    {/* 원본 [작업] — 그 생산품목의 BOR 공정에 등록된 작업코드. 작업코드가 하나도 없는 회사는 공정명을 친다. */}
                    {operations.length === 0 ? (
                      <input className={inputCls} list="wr-process-list" value={l.process} placeholder="조립"
                             onChange={(e) => setWrLine(l.key, { process: e.target.value })} />
                    ) : (
                      <select className={inputCls} value={l.operationId ? l.operationId : l.process ? 'p:' + l.process : ''}
                              onChange={(e) => {
                                const v = e.target.value
                                if (v.startsWith('p:')) return
                                const o = operations.find((x) => String(x.id) === v)
                                setWrLine(l.key, { operationId: v, process: o ? o.processName : '' })
                              }}>
                        <option value="">선택</option>
                        {l.process && !l.operationId && <option value={'p:' + l.process}>{l.process}</option>}
                        {ops.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    {/* 원본 [작업품목코드] — 코드를 적는다. 생산품목과 다르다(이 작업이 다루는 품목). */}
                    <CodePickerField label="작업품목" hideLabel fill showCode placeholder="작업품목코드" emptyLabel="선택 해제"
                                     value={l.workItemId} onChange={(v) => setWrLine(l.key, { workItemId: v })}
                                     items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec ?? undefined }))} />
                  </td>
                  <td className="text-ec-muted">
                    {items.find((x) => String(x.id) === l.workItemId)?.name ?? ''}
                  </td>
                  <td>
                    {/* 원본 [수량] 한 칸. 서버는 양품 · 불량으로 나눠 든다 — 친 수량에서 (불러온) 불량을 뺀 것이 양품이다. */}
                    <input type="number" step="any" className="ec-input w-full text-right"
                           value={l.goodQty === '' && l.defectQty === '' ? '' : String(Number(l.goodQty || 0) + Number(l.defectQty || 0))}
                           onChange={(e) => setWrLine(l.key, { goodQty: e.target.value === '' ? ''
                             : String(Math.max(0, Number(e.target.value) - Number(l.defectQty || 0))) })} />
                  </td>
                  <td>
                    {/* 대상작업이 정해진 자원은 그 작업에서만 쓸 수 있다. 그 줄의 작업에 맞는 것만 낸다. */}
                    <select className={inputCls} value={l.resourceId} onChange={(e) => setWrLine(l.key, { resourceId: e.target.value })}>
                      <option value="">선택 안 함</option>
                      {resources
                        .filter((r) => resourceFits(r, l))
                        .map((r) => <option key={r.id} value={r.id}>{r.name}{r.operationNames.length ? ' (' + r.operationNames.join(', ') + ')' : ''}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" step="any" className="ec-input w-full text-right"
                           value={l.workHours} onChange={(e) => setWrLine(l.key, { workHours: e.target.value })} />
                  </td>
                  <td>
                    <input className={inputCls} value={l.note} onChange={(e) => setWrLine(l.key, { note: e.target.value })} />
                  </td>
                </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}></td>
                {/* 원본 합계 줄: [수량] · [작업시간] 아래 소수 둘째 자리(27.00 · 40.00). */}
                <td className="text-right font-bold">
                  {fmt2(wrLines.reduce((n, l) => n + (Number(l.goodQty) || 0) + (Number(l.defectQty) || 0), 0))}
                </td>
                <td></td>
                <td className="text-right font-bold">{fmt2(wrLines.reduce((n, l) => n + (Number(l.workHours) || 0), 0))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          </div>
          <datalist id="wr-process-list">
            {processes.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
          {/* 원본 아래 단추: 저장(F8) · 저장/전표(F7) · 다시 작성 · 리스트 — [리스트] 는 입력 창을 닫고 목록으로 간다. */}
          <div className="mt-[12px] flex justify-start gap-[4px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>리스트</button>
          </div>
        </form>
      )}</Modal>

      {/*
        입력 창을 닫으면 보이는 목록 — 원본 작업내역조회처럼 <b>전표 한 장이 한 줄</b>이다
        (일자-No. · 생산공장명 · 작업품목명[규격명] '… 외 n건' · 작업수량 · 작업시간 · 작업지시서).
      */}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[170px]">일자-No.</th>
            <th className="w-[130px]">생산공장명</th>
            <th>작업품목명[규격명]</th>
            <th className="w-[110px] text-right">작업수량</th>
            <th className="w-[110px] text-right">작업시간</th>
            <th className="w-[170px]">작업지시서</th>
            <th className="w-[60px] text-center">삭제</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : slips.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : slips.map((ls, i) => {
            const r = ls[0]
            return (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{dateNo(r.workDate, r.resultNo)}</td>
              <td className={r.warehouseName ? undefined : 'text-ec-off'}>{r.warehouseName ?? ''}</td>
              <td>{slipItemLabel(ls)}</td>
              <td className="text-right">{fmt2(ls.reduce((n, x) => n + x.goodQty + x.defectQty, 0))}</td>
              <td className="text-right">{fmt2(minToHours(ls.reduce((n, x) => n + x.workTimeMin, 0)))}</td>
              <td>{ls.find((x) => x.workOrderNo)?.workOrderNo ?? ''}</td>
              <td className="text-center">
                <button type="button" onClick={() => void removeSlip(ls)} className="text-ec-danger bg-transparent border-0 cursor-pointer text-[12px]">삭제</button>
              </td>
            </tr>
            )
          })}
        </tbody>
        {slips.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={4} className="text-right font-bold">합계</td>
              <td className="text-right font-bold">{fmt2(shown.reduce((a, r) => a + r.goodQty + r.defectQty, 0))}</td>
              <td className="text-right font-bold">{fmt2(minToHours(shown.reduce((a, r) => a + r.workTimeMin, 0)))}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </table>
      <Modal open={linkRows != null} title="생산입고연결전표" error={error} width={720} onClose={() => setLinkRows(null)}>
        <p className="text-[12.5px] mt-0 mx-0 mb-[6px]">작업내역전표 : {linked ? `${dateText(linked.workDate)} ${linked.resultNo}` : ''}</p>
        <table className="w-full text-left">
          <thead>
            <tr><th>생산입고연결전표</th><th>생산품목</th><th className="text-right">수량</th><th>받는창고</th></tr>
          </thead>
          <tbody>
            {(linkRows ?? []).length === 0 ? (
              <tr><td colSpan={4} className="text-center text-ec-hint p-[14px]">등록된 데이터가 없습니다.</td></tr>
            ) : (linkRows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{dateText(r.productionDate)} {r.prodNo}</td>
                <td>{r.productName}</td>
                <td className="text-right">{Number(r.producedQty).toLocaleString()}</td>
                <td>{r.warehouseName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={newLinkedReceipt}>신규(F2)</button>
          <button type="button" className="ec-btn" onClick={() => setLinkRows(null)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
