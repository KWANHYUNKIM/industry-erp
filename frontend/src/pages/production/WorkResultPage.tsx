import { useEffect, useState, type FormEvent, useRef} from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { periodOf, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useMyItemsPick, MyItemsNote } from '../../components/MyItemsButton'
import type { Item } from '../../types/api'
import { dateText } from '../../utils/dateText'

/**
 * 생산관리 > 작업 > 작업내역입력 (/api/work-results).
 *
 * <p>원본 머리 실측(사본): 일자 · <b>생산공장</b> · 담당자 · 생산품목.
 * 그리드는 생산품목코드/명 · 작업품목코드/명 · 수량 · 투입자원 · 작업시간 · <b>적요</b>.
 *
 * <p>생산품목은 우리 쪽이 작업지시에 묶여 있어 지시를 고르면 따라온다.
 * 생산공장과 적요가 빠져 있었다 — 적요는 서버가 이미 받고 있었는데 폼에 칸이 없어
 * 늘 비어 나갔다.
 */
interface WorkResult {
  id: number
  workOrderId: number | null
  workOrderNo: string | null
  process: string
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
interface Warehouse { id: number; code: string; name: string; kind: string; active: boolean }
interface Project { id: number; code: string; name: string }

const inputCls = 'ec-input w-full'
const today = () => ymd(new Date())
/** 원본 머리: 일자 · 생산공장 · 담당자 · 프로젝트. 줄마다 되풀이하지 않는다. */
const emptyForm = {
  warehouseId: '', worker: '', workDate: today(),
  /** 원본 작업내역입력 머리의 [프로젝트]. 안 정할 수 있다. */
  projectId: '',
}
/** 원본 격자 한 줄. */
interface WrLine {
  key: number
  workOrderId: string
  process: string
  workItemId: string
  resourceId: string
  goodQty: string
  defectQty: string
  workTimeMin: string
  note: string
}
let wrLineKey = 0
const emptyLine = (): WrLine => ({
  key: ++wrLineKey, workOrderId: '', process: '', workItemId: '', resourceId: '',
  goodQty: '', defectQty: '', workTimeMin: '', note: '',
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
  const [projects, setProjects] = useState<Project[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  /** 원본 그리드의 [작업품목] 후보. */
  const [items, setItems] = useState<Item[]>([])
  /** 원본 그리드의 [투입자원]. 자원등록의 [대상작업]과 짝이다. */
  const [resources, setResources] = useState<{ id: number; code: string; name: string; processId: number | null; processName: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
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
      ...picked.map((w) => ({ ...emptyLine(), workOrderId: String(w.id), workItemId: String(w.productId) })), emptyLine()])
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
      const [wo, pr, rs, wh, it, pj] = await Promise.all([
        api.get<WorkOrder[]>('/work-orders/options'),
        api.get<Process[]>('/processes'),
        api.get<{ id: number; code: string; name: string; processId: number | null; processName: string | null }[]>('/resources'),
        api.get<Warehouse[]>('/warehouses'),
        api.get<Item[]>('/items'),
        api.get<Project[]>('/projects'),
      ])
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
    setWrLines([...p.lines.map((l) => ({ ...emptyLine(), workOrderId: String(l.workOrderId), process: l.process,
      workItemId: String(l.workItemId), goodQty: l.goodQty, workTimeMin: l.workTimeMin, note: l.note })), emptyLine()])
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
    if (!window.confirm('연결전표를 생성하려면 먼저 저장해야 합니다.\n계속 진행하겠습니까?')) return
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
      (l) => l.process.trim() !== '' || l.workOrderId !== '' || l.goodQty !== '' || l.defectQty !== '',
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
          process: l.process,
          workItemId: l.workItemId === '' ? null : Number(l.workItemId),
          resourceId: l.resourceId === '' ? null : Number(l.resourceId),
          worker: form.worker,
          goodQty: l.goodQty === '' ? 0 : Number(l.goodQty),
          defectQty: l.defectQty === '' ? 0 : Number(l.defectQty),
          workTimeMin: l.workTimeMin === '' ? 0 : Number(l.workTimeMin),
          note: l.note || null,
        })),
      })
      const saved = { resultNo: res.data[0]?.resultNo ?? '', workDate: res.data[0]?.workDate ?? form.workDate,
        lines: res.data.map((r) => ({ productId: r.productId, goodQty: Number(r.goodQty), workOrderId: r.workOrderId })) }
      setLinked(saved)
      setForm(emptyForm)
      setWrLines([emptyLine()])
      setShowForm(false)
      load()
      return saved
    } catch (err) {
      setError(extractErrorMessage(err))
      return null
    }
  }

  async function remove(r: WorkResult) {
    if (!confirm(`'${r.process}' 작업내역을 삭제할까요?`)) return
    try {
      await api.delete(`/work-results/${r.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((r) => !keyword || (r.workOrderNo ?? '').includes(keyword) || r.process.includes(keyword))


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
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        격자가 열두 칸이라 기본 폭(640)으로는 팝업 밖으로 넘친다 — 브라우저로 열어 보고 알았다.
        Modal 은 maxWidth 96vw 라 좁은 화면에서는 알아서 줄어든다.
      */}
      <Modal error={error} open={showForm} title="작업내역입력" width={1180} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); e.currentTarget.requestSubmit() } }} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 작업내역 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              {/* 원본 머리의 이름은 [일자]다(사본 실측). */}
              <label className="mb-1 block text-sm text-slate-600">일자</label>
              <input type="date" className={inputCls} value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산공장</label>
              {/* 원본은 <b>코드도움</b>으로 받는다(사본 실측) — 창고가 몇십 개만 돼도
                  드롭다운으로는 코드로 못 찾는다. */}
              <CodePickerField label="생산공장" hideLabel fill placeholder="생산공장" emptyLabel="선택 안 함"
                               value={form.warehouseId} onChange={(v) => setForm({ ...form, warehouseId: v })}
                               items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.kind }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              <input className={inputCls} value={form.worker} onChange={(e) => setForm({ ...form, worker: e.target.value })} />
            </div>
            <div>
              {/* 원본 작업내역입력 머리의 [프로젝트]. 프로젝트별 집계에 이 작업이 잡힌다. */}
              <label className="mb-1 block text-sm text-slate-600">프로젝트</label>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#3f4855' }}>작업</span>
            <button type="button" className="ec-btn" onClick={() => setWrLines([...wrLines, emptyLine()])}>줄 추가</button>
            <button type="button" className="ec-btn" disabled={myItems.busy} onClick={myItems.pick}>My품목</button>
            <MyItemsNote note={myItems.note} />
            <button type="button" className="ec-btn" onClick={() => void linkSlip()}>연결전표</button>
            <button type="button" className="ec-btn" onClick={() => void openWoPick()}>작업지시서</button>
          </div>
          {woPickOpen && (
            <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>작업지시서조회</div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th style={{ width: 30 }} />
                      <th>작업지시서일자</th>
                      <th>품목코드</th>
                      <th>품목명</th>
                      <th style={{ textAlign: 'right' }}>수량</th>
                      <th style={{ textAlign: 'right' }}>잔량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {woFull.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 12 }}>등록된 데이터가 없습니다.</td></tr>
                    ) : woFull.map((w) => (
                      <tr key={w.id} style={{ cursor: 'pointer' }}
                          onClick={() => setWoPicked((p) => (p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]))}>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" readOnly checked={woPicked.includes(w.id)} /></td>
                        <td>{dateText(w.orderDate)} {w.orderNo}</td>
                        <td>{w.productCode}</td>
                        <td>{w.productName}</td>
                        <td style={{ textAlign: 'right' }}>{Number(w.plannedQty).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{Number(w.remainingQty).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <button type="button" className="ec-btn ec-btn-primary" onClick={applyWo}>적용(F8)</button>
                <button type="button" className="ec-btn" onClick={() => setWoPickOpen(false)}>닫기</button>
              </div>
            </div>
          )}
          {/* 좁은 창에서는 열두 칸이 다 안 들어간다 — 잘리지 말고 옆으로 밀리게 둔다. */}
          <div style={{ overflowX: 'auto' }}>
          <table ref={tableRef} className="ec-grid" style={{ width: '100%', minWidth: 1040 }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th style={{ width: 170 }}>작업지시</th>
                {/*
                  원본 격자는 품목을 <b>코드와 이름 두 칸</b>으로 편다(판매·구매입력도 같다).
                  한 칸에 몰아 두면 코드로 훑을 수가 없다. 차례도 원본 그대로 —
                  생산품목코드가 [작업]보다 앞이다.
                */}
                <th style={{ width: 110 }}>생산품목코드</th>
                {/* 원본은 코드 옆에 <b>이름</b>도 편다 — 고른 작업지시가 가리키는 품목이 무엇인지
                    코드만으로는 알 수가 없다. 이름은 이미 작업지시 목록에 있다. */}
                <th style={{ width: 160 }}>생산품목명</th>
                <th style={{ width: 120 }}>작업</th>
                <th style={{ width: 130 }}>작업품목코드</th>
                <th>작업품목명</th>
                {/*
                  원본 작업내역입력 격자는 <b>[수량]</b> 한 칸이다(사본 실측). 우리는 양품·불량으로
                  나눠 적는데, <b>둘을 합쳐 얼마나 작업했는지</b>는 아무 데도 안 나왔다 —
                  같은 지시의 두 줄을 견줄 때 눈으로 더해야 했다. 셋을 다 낸다(수량 = 양품 + 불량).
                  원본 차례도 <b>[수량]이 [투입자원]보다 앞</b>이다.
                */}
                <th style={{ width: 80, textAlign: 'right' }}>수량</th>
                <th style={{ width: 150 }}>투입자원</th>
                <th style={{ width: 80, textAlign: 'right' }}>양품</th>
                <th style={{ width: 80, textAlign: 'right' }}>불량</th>
                <th style={{ width: 100, textAlign: 'right' }}>작업시간</th>
                <th style={{ width: 140 }}>적요</th>
                <th style={{ width: 50, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {wrLines.map((l, idx) => (
                <tr key={l.key}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td>
                    {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
                    <CodePickerField label="작업지시" hideLabel fill placeholder="작업지시" emptyLabel="선택 해제"
                                     value={l.workOrderId} onChange={(v) => setWrLine(l.key, { workOrderId: v })}
                                     items={workOrders.map((w) => ({ value: String(w.id), code: w.orderNo, name: w.productName }))} />
                  </td>
                  {/* 생산품목 — 고른 작업지시가 가리키는 최종 품목이다. 사람이 고치는 칸이 아니다. */}
                  <td style={{ fontFamily: 'monospace', color: '#6b7280' }}>
                    {workOrders.find((w) => String(w.id) === l.workOrderId)?.productCode ?? ''}
                  </td>
                  <td style={{ color: '#6b7280' }}>
                    {workOrders.find((w) => String(w.id) === l.workOrderId)?.productName ?? ''}
                  </td>
                  <td>
                    <input className={inputCls} list="wr-process-list" value={l.process} placeholder="조립"
                           onChange={(e) => setWrLine(l.key, { process: e.target.value })} />
                  </td>
                  <td>
                    {/*
                      원본 그리드의 [작업품목]. 생산품목과 다르다 — AQD 를 만드는 지시 안에서
                      이 작업은 'AQD 몸체' 를 다니는 식이다. 코드 칸에서 고르면 이름 칸이 따라온다.
                    */}
                    <CodePickerField label="작업품목" hideLabel fill emptyLabel="선택 해제"
                                     value={l.workItemId} onChange={(v) => setWrLine(l.key, { workItemId: v })}
                                     items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec ?? undefined }))} />
                  </td>
                  <td style={{ color: '#6b7280' }}>
                    {items.find((x) => String(x.id) === l.workItemId)?.name ?? ''}
                  </td>
                  {/* 사람이 적는 칸이 아니다 — 양품·불량을 적으면 따라 는다. */}
                  <td style={{ textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>
                    {(Number(l.goodQty || 0) + Number(l.defectQty || 0)).toLocaleString()}
                  </td>
                  <td>
                    {/* 대상작업이 정해진 자원은 그 공정에서만 쓸 수 있다. 그 줄의 작업에 맞는 것만 낸다. */}
                    <select className={inputCls} value={l.resourceId} onChange={(e) => setWrLine(l.key, { resourceId: e.target.value })}>
                      <option value="">선택 안 함</option>
                      {resources
                        .filter((r) => !r.processName || !l.process || r.processName === l.process)
                        .map((r) => <option key={r.id} value={r.id}>{r.name}{r.processName ? ' (' + r.processName + ')' : ''}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }}
                           value={l.goodQty} onChange={(e) => setWrLine(l.key, { goodQty: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }}
                           value={l.defectQty} onChange={(e) => setWrLine(l.key, { defectQty: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }}
                           value={l.workTimeMin} onChange={(e) => setWrLine(l.key, { workTimeMin: e.target.value })} />
                  </td>
                  <td>
                    <input className={inputCls} value={l.note} onChange={(e) => setWrLine(l.key, { note: e.target.value })} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
                            onClick={() => setWrLines(wrLines.length > 1 ? wrLines.filter((x) => x.key !== l.key) : [emptyLine()])}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8} style={{ textAlign: 'right', fontWeight: 700 }}>합계</td>
                {/* 수량 합계도 양품 + 불량이다 — 줄마다 더한 것과 같아야 한다. */}
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {wrLines.reduce((n, l) => n + (Number(l.goodQty) || 0) + (Number(l.defectQty) || 0), 0).toLocaleString()}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{wrLines.reduce((n, l) => n + (Number(l.goodQty) || 0), 0).toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{wrLines.reduce((n, l) => n + (Number(l.defectQty) || 0), 0).toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{wrLines.reduce((n, l) => n + (Number(l.workTimeMin) || 0), 0).toLocaleString()}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
          </div>
          <datalist id="wr-process-list">
            {processes.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
          {/* 원본 아래 단추: 저장(F8) · 저장/전표(F7) · 다시 작성 · 리스트 — [리스트] 는 입력 창을 닫고 목록으로 간다. */}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-start', gap: 4 }}>
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>리스트</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th>
            <th>작업지시번호</th>
            <th>공정</th>
            <th>생산공장</th>
            <th>생산품목명</th>
            <th>투입자원</th>
            <th>작업자</th>
            <th style={{ textAlign: 'right' }}>양품</th>
            <th style={{ textAlign: 'right' }}>불량</th>
            <th style={{ textAlign: 'right' }}>작업시간(분)</th>
            <th>적요</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.workDate)}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? ''}</td>
              <td>{r.process}</td>
              <td style={{ color: r.warehouseName ? undefined : '#c9ced6' }}>{r.warehouseName ?? ''}</td>
              <td>{r.productName ?? ''}</td>
              <td style={{ color: r.resourceName ? undefined : '#c9ced6' }}>{r.resourceName ?? ''}</td>
              <td>{r.worker ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.goodQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.defectQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.workTimeMin.toLocaleString()}</td>
              <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={8} style={{ textAlign: 'right', fontWeight: 700 }}>합계</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{shown.reduce((a, r) => a + r.goodQty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{shown.reduce((a, r) => a + r.defectQty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{shown.reduce((a, r) => a + r.workTimeMin, 0).toLocaleString()}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </table>
      <Modal open={linkRows != null} title="생산입고연결전표" error={error} width={720} onClose={() => setLinkRows(null)}>
        <p style={{ fontSize: 12.5, margin: '0 0 6px' }}>작업내역전표 : {linked ? `${dateText(linked.workDate)} ${linked.resultNo}` : ''}</p>
        <table className="w-full text-left">
          <thead>
            <tr><th>생산입고연결전표</th><th>생산품목</th><th style={{ textAlign: 'right' }}>수량</th><th>받는창고</th></tr>
          </thead>
          <tbody>
            {(linkRows ?? []).length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 14 }}>등록된 데이터가 없습니다.</td></tr>
            ) : (linkRows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{dateText(r.productionDate)} {r.prodNo}</td>
                <td>{r.productName}</td>
                <td style={{ textAlign: 'right' }}>{Number(r.producedQty).toLocaleString()}</td>
                <td>{r.warehouseName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          <button type="button" className="ec-btn ec-btn-primary" onClick={newLinkedReceipt}>신규(F2)</button>
          <button type="button" className="ec-btn" onClick={() => setLinkRows(null)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
