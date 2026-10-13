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
import EcPeriodPicks, { periodOf, QUALITY_REQUEST_PICKS } from '../../components/EcPeriodPicks'

import { printDocuments } from '../../utils/printDocument'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'
import QualityRequestScreen from '../../features/quality/components/QualityRequestForm'
import { ecConfirm } from '../../components/EcDialog'

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

/*
 * 원본 알약(2026-10-12 다시 잼): 전체 · 결재중 · 확인 · 진행중 · 완료. 결재중 · 확인은 전자결재(전표 확인) 상태라
 * 결재를 걸지 않는 우리에게는 결재중이 늘 비고 확인은 전체와 같다(품질검사조회 · A/S접수조회와 같음).
 */
type Tab = '전체' | '결재중' | '확인' | '진행중' | '완료'
/* 원본 [품목] — 'MSI BIG BANG Z77 MPOWER [1EA]', 여럿이면 '… 외 1건'. */
const itemText = (r: QualityInspectionRequest) => {
  const first = r.lines[0]
  if (!first) return r.itemName
  if (r.lines.length > 1) return `${first.itemName} 외 ${r.lines.length - 1}건`
  return `${first.itemName}${first.spec ? ` [${first.spec}]` : ''}`
}

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

/** 입력은 features/quality/components/QualityRequestForm — 메뉴 [품질검사요청입력] 은 따로 된 입력 화면(QualityRequestEntryPage)이다. */
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
  const [linksOf, setLinksOf] = useState<QualityInspectionRequest | null>(null)


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

  function openNew() { setEditing(null); setOpen(true) }
  function openEdit(r: QualityInspectionRequest) { setEditing(r); setOpen(true) }
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
    .filter((r) => tab === '전체' || tab === '확인' || (tab === '결재중' ? false : tab === '진행중' ? r.status === 'REQUESTED' : r.status === 'INSPECTED'))
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
        { label: '진행상태변경', selected: picked.size, onClick: () => setStatusOpen(true) },
        { label: '인쇄', disabled: picked.size === 0, onClick: () => void printRequests(rows.filter((r) => picked.has(r.id))) },
        { label: '선택삭제', selected: picked.size,
          /* 원본 확인 창 '전표를 삭제하겠습니까? / - 품질검사요청조회'(2026-10-14) — 검사가 이어진 요청도 지워진다. */
          onClick: async () => { if ((await ecConfirm('전표를 삭제하겠습니까?\n- 품질검사요청조회'))) void removeIds([...picked]) } },
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
        {/* 원본 조회는 이 칸을 [품질검사요청No.] 라 부른다(입력 화면은 [일자-No.] — 2026-10-14 입력을 따로 된 화면으로 나눴다). */}
        <EcCond label="품질검사요청No.">
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
        {(['전체', '결재중', '확인', '진행중', '완료'] as const).map((t) => (
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
              {/* 원본 [연결전표] — [검사요청] 으로 불러와 검사해도 빈칸이었다(2026-10-14). 검사는 [진행상태] 조회 창에 뜬다. */}
              <td></td>
              <td className="text-center">
                <button type="button" className={`ec-link${r.status === 'INSPECTED' ? ' text-ec-warn' : ''}`}
                        disabled={r.status === 'CANCELED'} onClick={() => toggleStatus(r)}>{r.statusName}</button>
              </td>
              {/* 원본: 이 요청으로 만든 전표가 있으면 [조회] 가 주황 꼬리표로 찍힌다(2026-10-14). */}
              <td className="text-center"><button type="button" onClick={() => setLinksOf(r)}
                className={r.inspections.length ? 'inline-block rounded-[6px] px-[4px] leading-[15.3px] bg-[var(--ec-bg-tag)] text-white' : 'ec-link'}>조회</button></td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => printRequest(r)}>인쇄</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/*
        원본 [진행상태] 조회 창 '생성한 전표'(2026-10-14 실측): '품질검사요청조회 : 2026/10/14 -1',
        열 품목코드 · 품목명 · 규격 · 수량 · 잔량(0 이면 빈칸) · 생성한 전표('품질검사') · 생성한 전표일자-No., 단추 신규(F2) · 닫기.
      */}
      <Modal open={!!linksOf} width={780} title="생성한 전표" error={error} onClose={() => setLinksOf(null)}>
        {linksOf && (<>
          <p className="mb-[6px]">품질검사요청조회 : {dateNo(linksOf.requestDate, linksOf.requestNo)}</p>
          <table className="w-full text-left">
            <thead><tr>
              <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">잔량</th>
              <th className="text-center">생성한 전표</th><th className="text-center">생성한 전표일자-No.</th>
            </tr></thead>
            <tbody>
              {linksOf.lines.flatMap((l) => {
                const left = linksOf.lines.length === 1 ? linksOf.remainingQty : null
                const base = [l.itemCode, l.itemName, l.spec ?? '', Math.round(l.quantity).toLocaleString('ko-KR'),
                  left ? Math.round(left).toLocaleString('ko-KR') : '']
                const qs = linksOf.inspections.length ? linksOf.inspections : [null]
                return qs.map((q) => (
                  <tr key={`${l.id}-${q?.id ?? 0}`}>
                    {base.map((v, k) => <td key={k} className={k >= 3 ? 'text-right' : undefined}>{v}</td>)}
                    <td className="text-center">{q ? '품질검사' : ''}</td>
                    <td className="text-center">{q ? dateNo(q.inspectionDate, q.inspectionNo) : ''}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[9px]">
            <button className="ec-btn ec-btn-primary" onClick={() => { setLinksOf(null); openNew() }}>신규(F2)</button>
            <button className="ec-btn" onClick={() => setLinksOf(null)}>닫기</button>
          </div>
        </>)}
      </Modal>

      <Modal open={open} width={900} error={error} onClose={() => setOpen(false)}
             title={editing ? '품질검사요청입력(수정)' : '품질검사요청입력'}>
        {open && (
          <QualityRequestScreen editing={editing} items={items} projects={projects}
                              onSaved={() => { setOpen(false); void load() }}
                              onDeleted={() => { setOpen(false); void load() }}
                              extraButtons={<button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>} />
        )}
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
