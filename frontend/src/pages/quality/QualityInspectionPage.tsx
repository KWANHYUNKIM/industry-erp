import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CommonCode, Item, QualityInspection, QualityInspectionLine, QualityInspectionRequest } from '../../types/api'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcRowCap, { capRows } from '../../components/EcRowCap'
import { DocPullButton, type PulledLine } from '../../features/quality/DocPull'
import { printDocuments } from '../../utils/printDocument'

const today = () => ymd(new Date())
const qty0 = (n: number) => Math.round(n).toLocaleString('ko-KR')
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/* 원본 [검사번호] '26/10/04-1' — 우리 번호 'QC-20261004-0001' 에서 일자와 끝 일련번호만 뗀다. */
const shortNo = (r: QualityInspection) => {
  const seq = Number(r.inspectionNo.split('-').pop()) || r.inspectionNo
  return `${r.inspectionDate.slice(2).replace(/-/g, '/')}-${seq}`
}
/* 원본 [품목] 'MSI BIG BANG Z77 MPOWER [1EA]' · 여러 줄이면 '… 외 1건'. */
const itemText = (r: QualityInspection) => {
  const first = r.lines[0]
  if (!first) return r.itemName
  if (r.lines.length > 1) return `${first.itemName} 외 ${r.lines.length - 1}건`
  return `${first.itemName}${first.spec ? ` [${first.spec}]` : ''}`
}

type Method = QualityInspectionLine['method']
type Pass = QualityInspectionLine['passResult']
interface LineForm { method: Method; itemId: string; quantity: string; sampleQty: string; defectQty: string; passResult: Pass; defectType: string }
const emptyLine = (): LineForm => ({ method: 'FULL', itemId: '', quantity: '', sampleQty: '', defectQty: '', passResult: 'NA', defectType: '' })
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const num = (v: string) => Number(v || 0)
/* 전수면 시료 = 수량(원본은 시료 칸을 막고 수량을 그대로 찍는다). 적격 = 시료 − 부적격. */
const sampleOf = (l: LineForm) => (l.method === 'FULL' ? num(l.quantity) : num(l.sampleQty))

/*
 * 원본 알약(2026-10-04): 전체 · 확인 · 진행중(기본) · 완료. [확인]은 전표상태라 결재 없는 회사에서는 전체와 같다
 * (A/S접수조회 · 수리조회와 같음).
 */
type Tab = '전체' | '확인' | '진행중' | '완료'

/** 원본 [인쇄] — 검사 한 건의 품목 줄(검사방법 · 수량 · 시료 · 적격 · 부적격 · 합격여부). 목록 [인쇄]는 고른 검사를 한 번에. */
async function printInspections(rs: QualityInspection[]) {
  await printDocuments(rs.map((r) => ({
    title: '품질검사서',
    docNo: r.inspectionNo,
    docDate: r.inspectionDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '담당자', value: r.inspector },
      { label: '검사요청', value: r.requestNo },
      { label: '종결여부', value: r.statusName },
    ],
    remark: r.remark,
    lines: r.lines.map((l) => ({
      itemCode: l.itemCode, itemName: l.itemName, spec: l.spec ?? undefined,
      quantity: l.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
      remark: `${l.methodName} · 시료 ${l.sampleQty} · 적격 ${l.goodQty} · 부적격 ${l.defectQty} · ${l.passResultName}`,
    })),
  })))
}

/**
 * 재고 II &gt; 품질관리 &gt; 품질검사 &gt; <b>품질검사조회</b>(E040622) · <b>품질검사입력</b>(E040621) — 2026-10-04 loginaa 실측(자료가 든 판, 입력 · 완료 · 삭제까지).
 *
 * <ul>
 *   <li>알약 전체 · 확인 · 진행중 · 완료, 진행중을 보고 열린다. 열: 검사번호(26/10/04-1) · 품목('○○ [규격]', 여럿이면 '○○ 외 1건') ·
 *       수량(정수) · 시료 · 적격 · 부적격(소수 둘째, 0 이면 빈칸) · 출처 · 종결여부 · 인쇄.</li>
 *   <li>입력은 품목 줄을 든 전표다: 검사방법(전수 · 샘플링) · 품목 · 수량 · 시료 · 적격 · 부적격 · 합격여부(해당없음 · 합격 · 불합격).
 *       전수면 시료 = 수량이고 칸이 막힌다. 적격 = 시료 − 부적격. 부적격은 [부적격관리] 에서 불량유형마다 넣는다.</li>
 *   <li>빈 저장 — '자료를 입력 바랍니다.', 시료 &gt; 수량 — '시료는 수량보다 클 수 없습니다.'</li>
 *   <li>저장하면 [종결여부] 진행중, 목록의 진행중을 누르면 완료(주황)로 넘어간다. 완료도 [선택삭제] 로 지워진다 —
 *       '선택한 전표를 삭제 하겠습니까?', 고른 것이 없으면 '리스트에 선택된 자료가 없습니다.'</li>
 * </ul>
 * 예전 화면은 품목 하나짜리 검사성적(검사구분 · 로트 · 검사수량 · 불량수 · 판정)이라 줄도 시료도 종결여부도 없었다.
 * [출처] 는 [검사요청] 으로 불러온 검사만 '검사요청' 으로 찍는다 — 구매 · 생산 … 에서 불러오기와 [확인] 알약(전표 확인 결재)은 아직 없다.
 * 조건 판은 원본 조건 대조표의 것(기준일자 · 품목 · 창고 · 프로젝트)을 그대로 둔다.
 */
export default function QualityInspectionPage() {
  const pickers = useCondPickers(['items', 'warehouses', 'projects'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [itemCond, setItemCond] = useState('')
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [tab, setTab] = useState<Tab>('진행중')
  const [rows, setRows] = useState<QualityInspection[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [defectTypes, setDefectTypes] = useState<CommonCode[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<QualityInspection | null>(null)
  const [f, setF] = useState({ inspectionDate: today(), inspector: '', remark: '' })
  /*
   * 원본 입력 판의 [검사요청] — 진행중 요청을 띄워 [잔량적용] 으로 남은 수량을 줄로 불러온다(2026-10-04 실측: 검색창
   * '품질검사요청검색창(조회)', 알약 진행중, 단추 잔량적용 · 전체적용). 불러온 요청이 그 요청의 [연결전표] 로 이어진다.
   */
  const [requestId, setRequestId] = useState<number | null>(null)
  /* 원본 입력 판 단추 차례: 판매 · 검사요청 · 발주 · 주문 · 작업지시서 · 구매 · 생산 · 이동 · 재고불러오기(2026-10-04 실측).
     판매 · 발주 · 주문 · 구매는 features/quality/DocPull — 품목 · 수량을 줄로 들이고 단추를 거둔다(검사요청과 이어지지 않는다). */
  const [pulled, setPulled] = useState(false)
  function applyPull(ls: PulledLine[]) {
    setLines([...ls.map((l) => ({ ...emptyLine(), itemId: String(l.itemId), quantity: String(Number(l.quantity)) })), emptyLine()])
    setRequestId(null)
    setPulled(true)
  }
  const [pullOpen, setPullOpen] = useState(false)
  const [openRequests, setOpenRequests] = useState<QualityInspectionRequest[]>([])
  const [pullPick, setPullPick] = useState<number | null>(null)
  const [lines, setLines] = useState<LineForm[]>(emptyLines())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [q, i, d] = await Promise.all([
        api.get<QualityInspection[]>('/quality-inspections', { params: { from, to } }),
        api.get<Item[]>('/items'),
        /* 원본 [부적격관리]의 불량유형 — 공통코드 그룹 DEFECT_TYPE. */
        api.get<CommonCode[]>('/codes/DEFECT_TYPE'),
      ])
      setRows(q.data); setItems(i.data); setDefectTypes(d.data)
      setPicked(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const itemPicks = useMemo(() => items.filter((it) => it.active !== false)
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword })), [items])

  const shown = rows
    .filter((r) => tab === '전체' || tab === '확인' || (tab === '진행중' ? r.status === 'IN_PROGRESS' : r.status === 'COMPLETED'))
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    .filter((r) => !whCond || String(r.warehouseId) === whCond)
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !keyword || r.lines.some((l) => l.itemName.includes(keyword)) || r.inspectionNo.includes(keyword))
    .sort((a, b) => (a.inspectionDate < b.inspectionDate ? 1 : a.inspectionDate > b.inspectionDate ? -1 : b.id - a.id))
  /* 그리는 줄만 자른다 — 검사가 수천 줄이면 브라우저가 멈춘다(2026-09-10 실측 2,316줄). 거르는 것은 전부에서. */
  const capped = capRows(shown)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '품질검사조회', [shown.length])

  function openNew() {
    setEditing(null); setFormError('')
    setF({ inspectionDate: today(), inspector: '', remark: '' })
    setLines(emptyLines())
    setRequestId(null)
    setPulled(false)
    setOpen(true)
  }
  function openEdit(r: QualityInspection) {
    setEditing(r); setFormError('')
    setF({ inspectionDate: r.inspectionDate, inspector: r.inspector ?? '', remark: r.remark ?? '' })
    setRequestId(r.requestId)
    setPulled(false)
    setLines([...r.lines.map((l) => ({
      method: l.method, itemId: String(l.itemId), quantity: String(l.quantity), sampleQty: String(l.sampleQty),
      defectQty: l.defectQty ? String(l.defectQty) : '', passResult: l.passResult, defectType: l.defectType ?? '',
    })), emptyLine()])
    setOpen(true)
  }
  const setLine = (i: number, patch: Partial<LineForm>) =>
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l))
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  const filled = lines.filter((l) => l.itemId)
  const sums = filled.reduce((s, l) => ({
    qty: s.qty + num(l.quantity), sample: s.sample + sampleOf(l),
    good: s.good + sampleOf(l) - num(l.defectQty), defect: s.defect + num(l.defectQty),
  }), { qty: 0, sample: 0, good: 0, defect: 0 })

  async function save() {
    setFormError('')
    if (filled.length === 0) return setFormError('자료를 입력 바랍니다.')
    if (filled.some((l) => sampleOf(l) > num(l.quantity))) return setFormError('시료는 수량보다 클 수 없습니다.')
    const body = {
      inspectionDate: f.inspectionDate,
      inspector: f.inspector || undefined,
      remark: f.remark || undefined,
      requestId: requestId ?? undefined,
      lines: filled.map((l) => ({
        itemId: Number(l.itemId), method: l.method, quantity: num(l.quantity),
        sampleQty: sampleOf(l), defectQty: num(l.defectQty), passResult: l.passResult,
        defectType: l.defectType || undefined,
      })),
    }
    setSaving(true)
    try {
      if (editing) await api.put(`/quality-inspections/${editing.id}`, body)
      else await api.post('/quality-inspections', body)
      setOpen(false)
      await load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', save, open)
  useShortcut('F2', openNew, !open)

  async function openPull() {
    setPullPick(null)
    try {
      const r = await api.get<QualityInspectionRequest[]>('/quality-inspection-requests', { params: { status: 'REQUESTED' } })
      setOpenRequests(r.data.filter((x) => x.remainingQty > 0))
      setPullOpen(true)
    } catch (err) { setFormError(extractErrorMessage(err)) }
  }
  /* [잔량적용] — 아직 검사 안 한 수량만큼. 줄이 하나면 남은 수량, 여럿이면 요청 줄을 그대로(남은 만큼 고쳐 쓴다). */
  function applyRequest() {
    const r = openRequests.find((x) => x.id === pullPick)
    if (!r) return
    const partial = r.inspectedQty > 0
    setLines([...r.lines.map((l) => ({
      ...emptyLine(), method: l.method, itemId: String(l.itemId),
      quantity: String(partial && r.lines.length === 1 ? r.remainingQty : l.quantity),
    })), emptyLine()])
    setRequestId(r.id)
    setPullOpen(false)
  }

  async function removeIds(ids: number[]) {
    try {
      for (const id of ids) await api.delete(`/quality-inspections/${id}`)
      setOpen(false)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) return setError('리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.')
    if (window.confirm('선택한 전표를 삭제 하겠습니까?')) void removeIds(ids)
  }
  /** 목록 [진행상태변경] — 고른 검사를 진행중 · 완료로. */
  const [statusOpen, setStatusOpen] = useState(false)
  async function changeStatus(status: 'IN_PROGRESS' | 'COMPLETED') {
    const results = await Promise.allSettled([...picked].map((id) => api.patch(`/quality-inspections/${id}/status`, { status })))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    setStatusOpen(false)
    setPicked(new Set())
    setError(failed.map((x) => extractErrorMessage(x.reason)).join(' / '))
    await load()
  }

  async function toggleStatus(r: QualityInspection) {
    try {
      await api.patch(`/quality-inspections/${r.id}/status`, { status: r.status === 'IN_PROGRESS' ? 'COMPLETED' : 'IN_PROGRESS' })
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const allPicked = capped.rows.length > 0 && capped.rows.every((r) => picked.has(r.id))

  return (
    <EcListShell
      onSearch={load}
      title="품질검사조회"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={openNew}
      actions={[
        /* 원본은 누른 뒤 '리스트에 선택된 자료가 없습니다.' — 우리는 고른 줄이 없으면 미리 잠근다(저장소 규칙). */
        /* 원본 버튼줄: 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) · 다른전표생성 · 선택삭제 · Excel · 이력조회. */
        { label: '진행상태변경', onClick: () => setStatusOpen(true), disabled: picked.size === 0 },
        { label: '인쇄', onClick: () => void printInspections(rows.filter((r) => picked.has(r.id))), disabled: picked.size === 0 },
        { label: '선택삭제', onClick: removeChecked, disabled: picked.size === 0 },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px] whitespace-pre-line">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
      </ul>

      <div className="ec-pills mb-[8px]">
        {(['전체', '확인', '진행중', '완료'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <EcRowCap capped={capped.capped} shown={capped.rows.length} total={capped.total} sums={false}
                hint="검색어로 좁혀 보세요 — 검색은 전부에서 찾습니다." />
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allPicked} onChange={(e) =>
                setPicked(e.target.checked ? new Set(capped.rows.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">검사번호</th>
            <th>품목</th>
            <th className="text-right">수량</th>
            <th className="text-right">시료</th>
            <th className="text-right">적격</th>
            <th className="text-right">부적격</th>
            <th>출처</th>
            <th className="text-center">종결여부</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : capped.rows.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((s) => {
                  const n = new Set(s)
                  if (n.has(r.id)) n.delete(r.id); else n.add(r.id)
                  return n
                })} />
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => openEdit(r)}>{shortNo(r)}</button></td>
              <td>{itemText(r)}</td>
              <td className="text-right">{qty0(r.totalQuantity)}</td>
              <td className="text-right">{qty2(r.inspectedQty)}</td>
              <td className="text-right">{qty2(r.goodQty)}</td>
              <td className="text-right">{r.defectQty ? qty2(r.defectQty) : ''}</td>
              <td>{r.requestNo ? '검사요청' : ''}</td>
              <td className="text-center">
                <button type="button" className={`ec-link${r.status === 'COMPLETED' ? ' text-ec-warn' : ''}`}
                        onClick={() => toggleStatus(r)}>{r.statusName}</button>
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => void printInspections([r])}>인쇄</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} width={1080} error={formError} onClose={() => setOpen(false)}
             title={editing ? '품질검사수정' : '품질검사입력'}>
        <ul className="ec-form">
          <li><div className="title">일자</div><div className="form">
            {/* 수정 창은 일자를 잠근다 — 번호가 일자를 문다. */}
            <input type="date" className="ec-input w-[150px]" value={f.inspectionDate} disabled={!!editing}
                   onChange={(e) => setF((x) => ({ ...x, inspectionDate: e.target.value }))} />
          </div></li>
          <li><div className="title">담당자</div><div className="form">
            <input className="ec-input w-full" placeholder="담당자" value={f.inspector}
                   onChange={(e) => setF((x) => ({ ...x, inspector: e.target.value }))} />
          </div></li>
        </ul>

        <div className="flex gap-[4px] items-center mt-[8px]">
          {!pulled && (<>
            <DocPullButton kind="판매" onApply={applyPull} />
            <button type="button" className="ec-btn ec-btn-sm" onClick={openPull}>검사요청</button>
            <DocPullButton kind="발주" onApply={applyPull} />
            <DocPullButton kind="주문" onApply={applyPull} />
            <DocPullButton kind="작업지시서" onApply={applyPull} />
            <DocPullButton kind="구매" onApply={applyPull} />
            <DocPullButton kind="생산" onApply={applyPull} />
            <DocPullButton kind="이동" onApply={applyPull} />
          </>)}
          {requestId != null && <span className="text-ec-hint text-[12px]">
            검사요청 {(() => { const r = openRequests.find((x) => x.id === requestId); return r ? dateNo(r.requestDate, r.requestNo) : (editing?.requestNo ?? '') })()}
          </span>}
        </div>
        <table className="w-full ec-head700 mt-[8px]">
          <thead><tr>
            <th className="w-[34px]"></th>
            <th className="w-[96px]">검사방법</th>
            <th className="w-[180px]">품목코드</th>
            <th>품목명</th>
            <th className="w-[80px] text-right">수량</th>
            <th className="w-[80px] text-right">시료</th>
            <th className="w-[70px] text-right">적격</th>
            <th className="w-[80px] text-right">부적격</th>
            <th className="w-[100px]">합격여부</th>
            <th className="w-[120px]">부적격관리</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const it = itemById.get(l.itemId)
              const sample = sampleOf(l)
              return (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td>
                    <select className="ec-input w-full" value={l.method} onChange={(e) => setLine(i, { method: e.target.value as Method })}>
                      <option value="FULL">전수</option>
                      <option value="SAMPLING">샘플링</option>
                    </select>
                  </td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill emptyLabel="지우기" placeholder="품목코드" value={l.itemId}
                                     onChange={(v) => setLine(i, { itemId: v })} items={itemPicks} />
                  </td>
                  <td>{it ? it.name : ''}</td>
                  <td><input className="ec-input w-full text-right" value={l.quantity} disabled={!l.itemId}
                             onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                  <td><input className="ec-input w-full text-right" disabled={!l.itemId || l.method === 'FULL'}
                             value={l.method === 'FULL' ? (l.quantity || '') : l.sampleQty}
                             onChange={(e) => setLine(i, { sampleQty: e.target.value })} /></td>
                  <td className="text-right">{l.itemId ? qty0(sample - num(l.defectQty)) : ''}</td>
                  <td><input className="ec-input w-full text-right" value={l.defectQty} disabled={!l.itemId}
                             onChange={(e) => setLine(i, { defectQty: e.target.value })} /></td>
                  <td>
                    <select className="ec-input w-full" value={l.passResult} disabled={!l.itemId}
                            onChange={(e) => setLine(i, { passResult: e.target.value as Pass })}>
                      <option value="NA">해당없음</option>
                      <option value="PASS">합격</option>
                      <option value="FAIL">불합격</option>
                    </select>
                  </td>
                  <td>
                    {/* 원본 [부적격관리] 는 불량유형마다 수량을 나눈다 — 우리는 주된 유형 하나를 고른다. */}
                    <select className="ec-input w-full" value={l.defectType} disabled={num(l.defectQty) <= 0}
                            onChange={(e) => setLine(i, { defectType: e.target.value })}>
                      <option value="">(불량유형)</option>
                      {defectTypes.map((d) => <option key={d.id} value={d.code}>{d.name}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr>
            <td colSpan={4}></td>
            <td className="text-right">{qty0(sums.qty)}</td>
            <td className="text-right">{qty0(sums.sample)}</td>
            <td className="text-right">{qty0(sums.good)}</td>
            <td className="text-right">{qty0(sums.defect)}</td>
            <td colSpan={2}></td>
          </tr></tfoot>
        </table>

        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
          {editing
            ? <button className="ec-btn" onClick={() => { if (window.confirm('선택한 전표를 삭제 하겠습니까?')) void removeIds([editing.id]) }}>삭제</button>
            : <button className="ec-btn" onClick={() => setLines(emptyLines())}>다시 작성</button>}
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={pullOpen} width={760} title="품질검사요청검색창(조회)" error={formError} onClose={() => setPullOpen(false)}>
        <table className="w-full text-left">
          <thead><tr>
            <th className="w-[34px]"></th>
            <th className="text-center">검사요청번호</th>
            <th>담당자명</th>
            <th>품목</th>
            <th className="text-right">수량</th>
            <th className="text-right">잔량</th>
          </tr></thead>
          <tbody>
            {openRequests.length === 0
              ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : openRequests.map((r) => (
                <tr key={r.id}>
                  <td className="text-center"><input type="radio" name="qi-pull" checked={pullPick === r.id} onChange={() => setPullPick(r.id)} /></td>
                  <td className="text-center">{dateNo(r.requestDate, r.requestNo)}</td>
                  <td>{r.requester ?? ''}</td>
                  <td>{r.lines.length > 1 ? `${r.lines[0].itemName} 외 ${r.lines.length - 1}건` : r.itemName}</td>
                  <td className="text-right">{qty0(r.requestQty)}</td>
                  <td className="text-right">{qty0(r.remainingQty)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" disabled={pullPick == null} onClick={applyRequest}>잔량적용(F8)</button>
          <button className="ec-btn" onClick={() => setPullOpen(false)}>닫기</button>
        </div>
      </Modal>
      <Modal error={error} open={statusOpen} title="진행상태변경" onClose={() => setStatusOpen(false)} width={320}>
        <p className="mb-[8px]">진행상태</p>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn" onClick={() => void changeStatus('IN_PROGRESS')}>진행중</button>
          <button type="button" className="ec-btn" onClick={() => void changeStatus('COMPLETED')}>완료</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
