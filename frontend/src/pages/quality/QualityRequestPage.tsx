import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useShortcut } from '../../utils/useShortcut'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import type { Item, QualityInspectionRequest } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import Modal from '../../components/Modal'
import EcPeriodPicks, { ymd, periodOf, QUALITY_REQUEST_PICKS } from '../../components/EcPeriodPicks'

import { printDocuments } from '../../utils/printDocument'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'
import { DocPullButton, type PullKind, type PulledLine } from '../../features/quality/DocPull'

/**
 * 재고 II &gt; 품질관리 &gt; 품질검사요청 — <b>품질검사요청조회</b>(E040629) · <b>품질검사요청입력</b>(E040628), 2026-10-04 loginaa 실측(입력 · 삭제).
 *
 * <ul>
 *   <li>요청은 품목 줄을 든 전표다: 일자-No. · 담당자, 줄 [검사방법(전수 · 샘플링) · 품목코드 · 품목명 · 규격 · 수량].</li>
 *   <li>목록 알약 전체 · 결재중 · 확인 · 진행중 · 완료(진행중으로 열림), 열 검사요청번호(2026/10/04 -1) · 담당자명 ·
 *       품목('○○ [1EA]', 여럿이면 '○○ 외 1건') · 수량 · 연결전표 · 종결여부 · 진행상태 · 인쇄.</li>
 *   <li>품질검사입력의 [검사요청] 이 진행중 요청을 띄워 [잔량적용] 으로 남은 수량을 불러온다 — 그 검사가 요청의 [연결전표] 다.
 *       우리는 검사한 수량이 요청 수량에 닿으면 [종결여부] 를 완료로 돌린다(원본에서 불러오기 끝까지는 못 쟀다 — 고른 줄이 안 먹었다).</li>
 *   <li>삭제 — '전표를 삭제하겠습니까?'. 검사가 이어진 요청은 막는다(검사가 요청을 문다).</li>
 * </ul>
 * [결재중] · [확인] 알약(전자결재 · 전표 확인)은 없다. 예전 화면은 품목 하나짜리 요청에 검사완료 · 취소 단추를 손으로 눌렀다.
 */

type Method = 'FULL' | 'SAMPLING'
interface LineForm { method: Method; itemId: string; quantity: string }
const emptyLine = (): LineForm => ({ method: 'FULL', itemId: '', quantity: '' })
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
type Tab = '전체' | '진행중' | '완료'
/* 원본 [품목] — 'MSI BIG BANG Z77 MPOWER [1EA]', 여럿이면 '… 외 1건'. */
const itemText = (r: QualityInspectionRequest) => {
  const first = r.lines[0]
  if (!first) return r.itemName
  if (r.lines.length > 1) return `${first.itemName} 외 ${r.lines.length - 1}건`
  return `${first.itemName}${first.spec ? ` [${first.spec}]` : ''}`
}
const today = () => ymd(new Date())

/**
 * 원본 품질검사요청조회의 마지막 열 <b>[인쇄]</b> — 그 요청 한 건을 검사요청서로 찍는다.
 *
 * <p>금액 칸은 안 그린다. 검사요청은 <b>거래가 아니다</b> — 단가도 공급가액도 없다.
 * 0 으로 채우면 "0원짜리 거래" 로 읽힌다(창고이동증·생산불출증과 같은 규칙).
 * 공급자/공급받는자 칸도 없다 — 사내에서 도는 지시서라 상대가 없다.
 */
/** 목록 [인쇄](고른 요청 한 번에) · 줄의 [인쇄](한 건). */
async function printRequests(rs: QualityInspectionRequest[]) {
  await printDocuments(rs.map((r) => ({
    title: '품질검사요청서',
    docNo: r.requestNo,
    docDate: r.requestDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '검사방법', value: r.inspectMethod === '샘플링' && r.samplePercent != null
        ? `샘플링 ${r.samplePercent}%` : r.inspectMethod },
      { label: '검사기한', value: r.dueDate },
      { label: '담당자명', value: r.requester },
      { label: '프로젝트', value: r.projectName },
      { label: '진행상태', value: r.statusName },
    ],
    remark: r.remark,
    lines: r.lines.map((l) => ({
      itemCode: l.itemCode, itemName: l.itemName, spec: l.spec,
      quantity: l.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
      remark: l.methodName,
    })),
  })))
}
const printRequest = (r: QualityInspectionRequest) => printRequests([r])

export default function QualityRequestPage() {
  /**
   * 원본 조건 판 첫째 <b>[기준일자]</b>. 서버가 이 구간만 준다. 기본은 <b>최근30일(+1개월)</b>(2026-09-01 원본 실측).
   */
  const initP = periodOf('최근30일(+1개월)')!
  const [pFrom, setPFrom] = useState(initP.from)
  const [pTo, setPTo] = useState(initP.to)
  const [rows, setRows] = useState<QualityInspectionRequest[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [keyword, setKeyword] = useState('')
  const [docCond, setDocCond] = useState('')
  const [reqCond, setReqCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [tab, setTab] = useState<Tab>('진행중')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<QualityInspectionRequest | null>(null)
  const [f, setF] = useState({ requestDate: today(), requester: '', projectId: '', remark: '' })
  const [lines, setLines] = useState<LineForm[]>(emptyLines())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [linksOf, setLinksOf] = useState<QualityInspectionRequest | null>(null)

  /* 입력 판 [판매 · 발주 · 주문 · 구매] 불러오기(features/quality/DocPull) — 한 번 불러오면 단추가 사라진다. */
  const [pulled, setPulled] = useState(false)
  function applyPull(ls: PulledLine[]) {
    setLines([...ls.map((l) => ({ method: 'FULL' as Method, itemId: String(l.itemId), quantity: String(Number(l.quantity)) })), emptyLine()])
    setPulled(true)
  }


  async function load() {
    setLoading(true)
    try {
      const [q, i, pj] = await Promise.all([
        api.get<QualityInspectionRequest[]>('/quality-inspection-requests', { params: { from: pFrom || undefined, to: pTo || undefined } }),
        api.get<Item[]>('/items'),
        api.get<{ id: number; code: string; name: string }[]>('/projects'),
      ])
      setRows(q.data); setItems(i.data); setProjects(pj.data); setPicked(new Set())
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pFrom, pTo])

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const itemPicks = useMemo(() => items.filter((it) => it.active !== false)
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword })), [items])

  function openNew() {
    setEditing(null); setFormError('')
    setF({ requestDate: today(), requester: '', projectId: '', remark: '' })
    setLines(emptyLines()); setPulled(false); setOpen(true)
  }
  function openEdit(r: QualityInspectionRequest) {
    setEditing(r); setFormError('')
    setF({ requestDate: r.requestDate, requester: r.requester ?? '', projectId: r.projectId ? String(r.projectId) : '', remark: r.remark ?? '' })
    setLines([...r.lines.map((l) => ({ method: l.method, itemId: String(l.itemId), quantity: String(l.quantity) })), emptyLine()])
    setOpen(true)
  }
  const setLine = (i: number, patch: Partial<LineForm>) =>
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l))
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  const filled = lines.filter((l) => l.itemId)
  const totalQty = filled.reduce((s, l) => s + Number(l.quantity || 0), 0)

  async function save() {
    setFormError('')
    if (filled.length === 0) return setFormError('자료를 입력 바랍니다.')
    if (filled.some((l) => !(Number(l.quantity) > 0))) return setFormError('수량은 0보다 커야 합니다.')
    const body = {
      requestDate: f.requestDate,
      requester: f.requester || undefined,
      projectId: f.projectId ? Number(f.projectId) : undefined,
      remark: f.remark || undefined,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), method: l.method, quantity: Number(l.quantity) })),
    }
    setSaving(true)
    try {
      if (editing) await api.put(`/quality-inspection-requests/${editing.id}`, body)
      else await api.post('/quality-inspection-requests', body)
      setOpen(false)
      await load()
    } catch (err) { setFormError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }
  useShortcut('F8', save, open)
  useShortcut('F2', openNew, !open)

  async function removeIds(ids: number[]) {
    try {
      for (const id of ids) await api.delete(`/quality-inspection-requests/${id}`)
      setOpen(false)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  /** 목록 [진행상태변경] — 고른 요청을 진행중 · 완료로(줄의 [종결여부]를 누르는 것과 같은 길). */
  const [statusOpen, setStatusOpen] = useState(false)
  async function changeStatus(status: 'REQUESTED' | 'INSPECTED') {
    const results = await Promise.allSettled([...picked].map((id) => api.patch(`/quality-inspection-requests/${id}/status`, { status })))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    setStatusOpen(false)
    setPicked(new Set())
    setError(failed.map((x) => extractErrorMessage(x.reason)).join(' / '))
    await load()
  }

  async function toggleStatus(r: QualityInspectionRequest) {
    try {
      await api.patch(`/quality-inspection-requests/${r.id}/status`, { status: r.status === 'INSPECTED' ? 'REQUESTED' : 'INSPECTED' })
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = useMemo(() => rows
    .filter((r) => tab === '전체' || (tab === '진행중' ? r.status === 'REQUESTED' : r.status === 'INSPECTED'))
    .filter((r) => !docCond || r.requestNo.includes(docCond) || r.requestDate.includes(docCond))
    .filter((r) => !reqCond || (r.requester ?? '') === reqCond)
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    .filter((r) => !projectCond || String(r.projectId ?? '') === projectCond)
    .filter((r) => !remarkCond || (r.remark ?? '').includes(remarkCond))
    .filter((r) => !specCond || r.lines.some((l) => (l.spec ?? '').includes(specCond)))
    .filter((r) => !keyword || r.lines.some((l) => l.itemName.includes(keyword)) || r.requestNo.includes(keyword))
    .sort((a, b) => (a.requestDate < b.requestDate ? 1 : a.requestDate > b.requestDate ? -1 : b.id - a.id)),
  [rows, tab, keyword, docCond, reqCond, itemCond, projectCond, remarkCond, specCond])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '품질검사요청조회', [shown.length])
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id))

  return (
    <EcListShell
      /* 원본 메뉴 이름 [품질검사요청] — 이 화면이 조회와 입력(창)을 겸한다. */
      title="품질검사요청"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={openNew}
      actions={[
        /* 원본 버튼줄(2026-10-04): 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) · 전자결재 · 선택삭제 · Excel · 이력조회 · 웹자료올리기.
           Email · 보내기는 바깥으로 보내는 일이라 두지 않는다. */
        { label: '진행상태변경', disabled: picked.size === 0, onClick: () => setStatusOpen(true) },
        { label: '인쇄', disabled: picked.size === 0, onClick: () => void printRequests(rows.filter((r) => picked.has(r.id))) },
        { label: '선택삭제', disabled: picked.size === 0,
          onClick: () => { if (window.confirm('전표를 삭제하겠습니까?')) void removeIds([...picked]) } },
        { label: 'Excel' },
      ]}
    >
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label flex-wrap">
        <span>기준일자</span>
        <input type="date" className="ec-input w-[140px]" value={pFrom} onChange={(e) => setPFrom(e.target.value)} />
        <span className="text-ec-label">~</span>
        <input type="date" className="ec-input w-[140px]" value={pTo} onChange={(e) => setPTo(e.target.value)} />
        <EcPeriodPicks labels={QUALITY_REQUEST_PICKS} currentFrom={pFrom}
                       onPick={(r) => { setPFrom(r.from); setPTo(r.to) }} />
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/*
          원본 <b>조회</b>는 이 칸을 [품질검사요청No.] 라 부르고 <b>입력</b>은 [일자-No.] 라 부른다.
          한 파일이 둘을 겸해 둘 다 맞출 수 없어 입력 쪽 이름을 쓴다 — 거르는 일은 같다.
        */}
        <EcCond label="일자-No.">
          <input className="ec-input" value={docCond} placeholder="요청일자 또는 요청번호"
                 onChange={(e) => setDocCond(e.target.value)} style={{ width: 190 }} />
        </EcCond>
        {/* 원본 조건 [품목] — 표에 품목 열이 있는데 그 값으로 거를 수가 없었다. */}
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name }))} />
        </EcCond>
        {/* 원본 조건 [프로젝트] — 프로젝트를 걸어 요청해 놓고 그 프로젝트만 볼 수가 없었다. */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={150} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond}
                           items={projects.map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))} />
        </EcCond>
        {/* 원본 조건 [적요] — 적요는 표에 찍히기만 하고 검색상자로도 안 걸렸다. */}
        <EcCond label="담당자" pick>
          {/* 요청자는 사원 마스터를 물지 않고 이름으로 적히므로, 후보를 실제 요청자들에서 뽑는다. */}
          <CodePickerField label="담당자" hideLabel width={150} emptyLabel="전체"
                           value={reqCond} onChange={setReqCond}
                           items={[...new Set(rows.map((r) => r.requester).filter(Boolean))]
                             .map((n) => ({ value: n as string, name: n as string }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 190 }} />
        </EcCond>
        {/* 원본 차례: … 적요 · (최종수정자·발송여부·오더관리번호) · <b>규격</b> · … */}
        <EcCond label="규격">
          <ItemSuggestInput field="spec" value={specCond} placeholder="전체"
                            onChange={(v) => setSpecCond(v)} width={140} />
        </EcCond>
      </ul>

      <div className="ec-pills mb-[8px]">
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">검사요청번호</th>
            <th>담당자명</th>
            <th>품목</th>
            <th className="text-right">수량</th>
            <th>연결전표</th>
            <th className="text-center">종결여부</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((s) => {
                  const n = new Set(s)
                  if (n.has(r.id)) n.delete(r.id); else n.add(r.id)
                  return n
                })} />
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => openEdit(r)}>{dateNo(r.requestDate, r.requestNo)}</button></td>
              <td>{r.requester ?? ''}</td>
              <td>{itemText(r)}</td>
              <td className="text-right">{Math.round(r.requestQty).toLocaleString('ko-KR')}</td>
              <td>{r.inspections.map((q) => dateNo(q.inspectionDate, q.inspectionNo)).join(', ')}</td>
              <td className="text-center">
                <button type="button" className={`ec-link${r.status === 'INSPECTED' ? ' text-ec-warn' : ''}`}
                        disabled={r.status === 'CANCELED'} onClick={() => toggleStatus(r)}>{r.statusName}</button>
              </td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => setLinksOf(r)}>조회</button></td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => printRequest(r)}>인쇄</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!linksOf} width={520} title="진행상태" error={error} onClose={() => setLinksOf(null)}>
        {linksOf && (
          <table className="w-full text-left">
            <thead><tr><th>품질검사</th><th className="text-right">수량</th></tr></thead>
            <tbody>
              {linksOf.inspections.length === 0
                ? <tr><td colSpan={2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                : linksOf.inspections.map((q) => (
                  <tr key={q.id}><td>{dateNo(q.inspectionDate, q.inspectionNo)}</td><td className="text-right">{Math.round(q.quantity).toLocaleString('ko-KR')}</td></tr>
                ))}
            </tbody>
            <tfoot><tr><td>남은 수량</td><td className="text-right">{Math.round(linksOf.remainingQty).toLocaleString('ko-KR')}</td></tr></tfoot>
          </table>
        )}
      </Modal>

      <Modal open={open} width={900} error={formError} onClose={() => setOpen(false)}
             title={editing ? '품질검사요청입력(수정)' : '품질검사요청입력'}>
        <ul className="ec-form">
          <li><div className="title">일자-No.</div><div className="form">
            <input type="date" className="ec-input w-[150px]" value={f.requestDate} disabled={!!editing}
                   onChange={(e) => setF((x) => ({ ...x, requestDate: e.target.value }))} />
          </div></li>
          <li><div className="title">담당자</div><div className="form">
            <input className="ec-input w-full" placeholder="담당자" value={f.requester}
                   onChange={(e) => setF((x) => ({ ...x, requester: e.target.value }))} />
          </div></li>
          <li><div className="title">프로젝트</div><div className="form">
            <CodePickerField label="프로젝트" hideLabel fill emptyLabel="선택 안 함" placeholder="프로젝트" value={f.projectId}
                             onChange={(v) => setF((x) => ({ ...x, projectId: v }))}
                             items={projects.map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))} />
          </div></li>
          <li><div className="title">적요</div><div className="form">
            <input className="ec-input w-full" placeholder="적요" value={f.remark}
                   onChange={(e) => setF((x) => ({ ...x, remark: e.target.value }))} />
          </div></li>
        </ul>
        {!editing && !pulled && (
          <div className="flex gap-[4px] mt-[8px]">
            {(['판매', '발주', '주문', '구매', '생산', '이동'] as PullKind[]).map((k) => <DocPullButton key={k} kind={k} onApply={applyPull} />)}
          </div>
        )}
        <table className="w-full ec-head700 mt-[8px]">
          <thead><tr>
            <th className="w-[34px]"></th>
            <th className="w-[100px]">검사방법</th>
            <th className="w-[180px]">품목코드</th>
            <th>품목명</th>
            <th className="w-[100px]">규격</th>
            <th className="w-[100px] text-right">수량</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const it = itemById.get(l.itemId)
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
                  <td>{it?.spec ?? ''}</td>
                  <td><input className="ec-input w-full text-right" value={l.quantity} disabled={!l.itemId}
                             onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr><td colSpan={5}></td><td className="text-right">{Math.round(totalQty).toLocaleString('ko-KR')}</td></tr></tfoot>
        </table>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
          {editing
            ? <button className="ec-btn" onClick={() => { if (window.confirm('전표를 삭제하겠습니까?')) void removeIds([editing.id]) }}>삭제</button>
            : <button className="ec-btn" onClick={() => { setLines(emptyLines()); setPulled(false) }}>다시 작성</button>}
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
      <Modal error={error} open={statusOpen} title="진행상태변경" onClose={() => setStatusOpen(false)} width={320}>
        <p className="mb-[8px]">진행상태</p>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn" onClick={() => void changeStatus('REQUESTED')}>진행중</button>
          <button type="button" className="ec-btn" onClick={() => void changeStatus('INSPECTED')}>완료</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
