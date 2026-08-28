import { useEffect, useState, type FormEvent, useRef} from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import type { Item } from '../../api/types'

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
interface Warehouse { id: number; name: string; kind: string; active: boolean }
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
        api.get<WorkOrder[]>('/work-orders'),
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

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    // 아무것도 안 적은 빈 줄은 보내지 않는다. 줄 추가만 눌러 두고 지우지 않은 경우다.
    const lines = wrLines.filter(
      (l) => l.process.trim() !== '' || l.workOrderId !== '' || l.goodQty !== '' || l.defectQty !== '',
    )
    if (lines.length === 0) {
      setError('작업을 한 줄 이상 넣으세요.')
      return
    }
    try {
      await api.post('/work-results/batch', {
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
      setForm(emptyForm)
      setWrLines([emptyLine()])
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
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
      <Modal open={showForm} title="작업내역입력" width={1180} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 작업내역 등록</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              {/* 원본 머리의 이름은 [일자]다(사본 실측). */}
              <label className="mb-1 block text-sm text-slate-600">일자</label>
              <input type="date" className={inputCls} value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산공장</label>
              <select className={inputCls} value={form.warehouseId}
                      onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                <option value="">선택 안 함</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.kind}] {w.name}</option>)}
              </select>
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
          </div>
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
                    <select className={inputCls} value={l.workOrderId} onChange={(e) => setWrLine(l.key, { workOrderId: e.target.value })}>
                      <option value="">선택</option>
                      {workOrders.map((w) => <option key={w.id} value={w.id}>{w.orderNo} ({w.productName})</option>)}
                    </select>
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
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
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
              <td style={{ fontFamily: 'monospace' }}>{r.workDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo ?? '-'}</td>
              <td>{r.process}</td>
              <td style={{ color: r.warehouseName ? undefined : '#c9ced6' }}>{r.warehouseName ?? '-'}</td>
              <td>{r.productName ?? ''}</td>
              <td style={{ color: r.resourceName ? undefined : '#c9ced6' }}>{r.resourceName ?? '-'}</td>
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
    </EcListShell>
  )
}
