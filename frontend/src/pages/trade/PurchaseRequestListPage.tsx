import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SELF_USE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo, shortDateNo } from '../../utils/dateNo'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/api'
import PurchaseRequestForm, { copyLines, type PurchaseLineSeed } from '../../features/purchaserequest/PurchaseRequestForm'
import { purchaseRequestDocument } from '../../features/purchaserequest/purchaseRequestDocument'
import Modal from '../../components/Modal'
import { printDocuments } from '../../utils/printDocument'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/** 원본 날짜 모양 — 연도를 두 자리로 찍는다(26/10/12-2 · 25/07/12, 2026-10-03 실측). */
const yy = (d: string | null) => (d ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : '')
type Progress = 'UNCONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
/** 서버는 사람이 정한 [종결여부]를 requestProgress 로 싣는다(PATCH /purchase-orders/{id}/request-progress). 공용 타입에 없어 여기서만 넓힌다. */
type Req = PurchaseOrder & { requestProgress?: Progress | null }
const PROGRESS_LABEL: Record<Progress, string> = { UNCONFIRMED: '미확인', IN_PROGRESS: '진행중', COMPLETED: '완료' }
/**
 * [종결여부] — 사람이 [진행상태변경]으로 정했으면 그것. 안 정했으면 <b>진행중</b>이다: 원본은 발주계획 · 발주서가 생겨도 요청을
 * 자동으로 끝내지 않는다(E040315 2026-10-20 실측 — 계획이 잇혀도 진행중 · 수량 그대로). 취소는 원본에 없다(예전 자료).
 */
const flowProgress = (s: PurchaseOrderStatus): Progress | 'CANCELLED' => (s === 'CANCELLED' ? 'CANCELLED' : 'IN_PROGRESS')
const progressOf = (o: Req) => o.requestProgress ?? flowProgress(o.status)
const progressLabel = (o: Req) => { const p = progressOf(o); return p === 'CANCELLED' ? '취소' : PROGRESS_LABEL[p] }
/** 위 알약 — 원본 '전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료'. 결재중은 우리 결재가 발주요청을 안 받아 늘 비어 있다. */
type Tab = 'ALL' | 'APPROVAL' | 'UNCONFIRMED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
const TAB_MATCH: Record<Tab, (o: Req) => boolean> = {
  ALL: () => true,
  APPROVAL: () => false,
  UNCONFIRMED: (o) => progressOf(o) === 'UNCONFIRMED',
  CONFIRMED: (o) => progressOf(o) === 'IN_PROGRESS' || progressOf(o) === 'COMPLETED',
  IN_PROGRESS: (o) => progressOf(o) === 'IN_PROGRESS',
  COMPLETED: (o) => progressOf(o) === 'COMPLETED',
}
/** 메뉴를 그 단추 · 링크 위(아래)에 띄울 자리. */
type MenuAt = { left: number; top?: number; bottom?: number }
const above = (el: Element | null | undefined): MenuAt => {
  const r = el?.getBoundingClientRect()
  return { left: r?.left ?? 200, bottom: r ? window.innerHeight - r.top + 4 : 48 }
}

/**
 * 재고 I &gt; 구매관리 &gt; 발주요청 &gt; <b>발주요청조회</b>(E040315) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>, 빠른선택에 [말일]) · 발주요청No. · 내.외자구분(전체 | 내자 | 외자) · 창고 · 프로젝트 ·
 * 관리항목 · 거래처코드 · 품목코드 · 발송여부 · 기타(수정일자순). 열: 발주요청일자 · 거래처명 · 품목 · 납기일자 · 수량 · 금액(합계) ·
 * 종결여부 · 진행상태 · 인쇄. 위 탭 전체 · 결재중 · 미확인 · 확인 · 진행중 · 완료.
 *
 * <p>우리 발주서 한 장이 발주요청 한 장이다(만들면 REQUESTED 로 선다). 진행상태는 발주확정 · 입고전환이면 '완료', 아직 요청 · 계획 ·
 * 단가확정이면 '진행중'. 취소한 것은 [종결여부]에 '종결'로 남긴다. 내자 · 외자는 통화(KRW 인지)로 가른다.
 * 수량은 줄 수량의 합, 품목은 첫 품목 '외 n건'.
 *
 * <p>2026-10-13 다시 잼: 열은 … 금액(합계) · <b>종결여부</b>(진행중 · 완료 · 미확인 — 누르면 그 줄 상태 메뉴, 완료는 주황 글자) ·
 * <b>진행상태</b>('조회' → '발주계획번호확인' 창: No. · 발주계획번호) · <b>인쇄</b>('발주요청서'). 하단 신규(F2) · Email · 진행상태변경 ▴
 * ('▾미확인 › 미확인 / ▾확인 › 진행중 · 완료') · 보내기 · 인쇄 · 바코드(품목) · 다른전표생성 ▴(발주계획) · 전자결재 · 선택삭제 · Excel ·
 * 이력조회 · 웹자료올리기 — 바깥 발송 · 결재 · 바코드는 뺐다.
 *
 * <p>[신규(F2)] · [발주요청일자] 를 누르면 '발주요청입력' 창(features/purchaserequest)이 뜬다 — 2026-10-13 실측.
 * [선택삭제] 는 고른 줄을 한 번에 지운다('전표를 삭제하겠습니까?\n- 발주요청 n건').
 */
export default function PurchaseRequestListPage() {
  const pickers = useCondPickers(['warehouses', 'projects', 'partners', 'items'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [reqNo, setReqNo] = useState('')
  const [domestic, setDomestic] = useState<'전체' | '내자' | '외자'>('전체')
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [tab, setTab] = useState<Tab>('ALL')
  const [rows, setRows] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  /** 열린 창. null = 닫힘, id 0 = 신규(복사 포함), 그 밖 = 그 발주요청 고치기. key 로 창을 새로 띄운다. */
  const [form, setForm] = useState<{ order: PurchaseOrder | null; key: number } | null>(null)
  const openForm = (order: PurchaseOrder | null) => setForm({ order, key: Date.now() })
  /** 하단 [진행상태변경 ▴] · 줄의 [종결여부] 를 누르면 뜨는 상태 메뉴. ids = 바꿀 줄. */
  const [progressMenu, setProgressMenu] = useState<{ at: MenuAt; ids: number[] } | null>(null)
  /** 하단 [다른전표생성 ▴] 메뉴. */
  const [otherMenu, setOtherMenu] = useState<MenuAt | null>(null)
  /** 줄 [진행상태] '조회' 창 — 원본 '발주계획번호확인'. */
  const [planOf, setPlanOf] = useState<Req | null>(null)
  /** [다른전표생성 › 발주계획] — 고른 요청의 줄을 베낀 '발주계획입력' 창. */
  const [planSeed, setPlanSeed] = useState<{ key: number; lines: PurchaseLineSeed[]; warehouseId: number | null } | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<Req[]>('/purchase-orders', { params: { from, to } })
      setRows(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  /** 발주요청은 따로 된 전표다(REQUESTED 행) — 계획 · 발주서는 그 줄을 베낀 다른 행이다(원본 E040315 2026-10-20 실측). */
  const filtered = useMemo(() => rows
    .filter((o) => o.status === 'REQUESTED')
    .filter((o) => o.orderDate >= from && o.orderDate <= to)
    .filter((o) => !reqNo || o.orderNo.includes(reqNo))
    .filter((o) => domestic === '전체' || ((o.currency ?? 'KRW') === 'KRW') === (domestic === '내자'))
    .filter((o) => !warehouse || String(o.warehouseId) === warehouse)
    .filter((o) => !project || String(o.projectId) === project)
    .filter((o) => !partner || String(o.partnerId) === partner)
    .filter((o) => !item || o.lines.some((l) => String(l.itemId) === item)),
  [rows, from, to, reqNo, domestic, warehouse, project, partner, item])
  const shown = useMemo(() => filtered
    .filter((o) => TAB_MATCH[tab](o))
    .sort(byUpdated
      ? (a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 0)
      : (a, b) => (a.orderDate > b.orderDate ? -1 : a.orderDate < b.orderDate ? 1 : b.orderNo.localeCompare(a.orderNo))),
  [filtered, tab, byUpdated])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '발주요청조회', [shown.length])

  /** 원본 수정 창 [이전](목록 아래 줄) · [다음](목록 위 줄). 끝이면 원본 문구로 알린다. */
  function step(dir: 1 | -1) {
    const at = shown.findIndex((o) => o.id === form?.order?.id)
    const target = at < 0 ? undefined : shown[at + dir]
    if (!target) return ecAlert(dir < 0 ? '다음에 표시할 전표가 없습니다.' : '이전에 표시할 전표가 없습니다.')
    openForm(target)
  }
  /** 원본 [진행상태변경] · [종결여부] — 고른 줄을 한 번에 미확인 / 진행중 / 완료로. */
  async function changeProgress(ids: number[], progress: Progress) {
    setProgressMenu(null)
    const results = await Promise.allSettled(ids.map((id) => api.patch(`/purchase-orders/${id}/request-progress`, { progress })))
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    if (failed.length > 0) setError(`${failed.length}건을 바꾸지 못했습니다: ${extractErrorMessage(failed[0].reason)}`)
    setChecked(new Set())
    void load()
  }
  /**
   * [다른전표생성 › 발주계획] — 고른 발주요청의 줄을 베낀 '발주계획입력' 창을 띄운다. 요청은 그대로 둔다(원본: 요청 → 계획 사이에
   * 잔량이 없어 같은 요청을 몇 번이고 베낀다, 요청은 진행중 · 수량 그대로).
   */
  function makePlans() {
    setOtherMenu(null)
    const targets = shown.filter((o) => checked.has(o.id))
    if (targets.length === 0) return
    setPlanSeed({ key: Date.now(), lines: copyLines(targets), warehouseId: targets.find((o) => o.warehouseId)?.warehouseId ?? null })
  }
  /** 이 요청의 줄을 베낀 발주계획들 — 원본 '발주계획번호확인'(여럿일 수 있다). */
  const plansOf = (o: Req) => {
    const ids = new Set(o.lines.map((l) => l.id))
    return rows.filter((p) => p.status !== 'REQUESTED'
      && p.lines.some((l) => ids.has((l as typeof l & { sourceLineId?: number | null }).sourceLineId ?? -1)))
  }
  /** 줄 [인쇄] · 하단 [인쇄] — 원본 '발주요청서'. */
  const printRows = (list: Req[]) => { if (list.length > 0) void printDocuments(list.map(purchaseRequestDocument)) }
  const footerBtn = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.ec-footer button')].find((b) => b.textContent?.trim() === label)

  async function removeChecked() {
    const ids = shown.filter((o) => checked.has(o.id)).map((o) => o.id)
    if (ids.length === 0) return
    /* 원본 글자 그대로 — 계획이 잇혀 있어도 막지 않는다(계획 줄의 출처 일자 · No. 는 남는다). */
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 발주요청조회'))) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/purchase-orders/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    if (failed.length > 0) setError(`${failed.length}건을 지우지 못했습니다: ${extractErrorMessage(failed[0].reason)}`)
    setChecked(new Set())
    void load()
  }

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="발주요청조회"
      searchable={false}
      onNew={() => openForm(null)}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setReqNo(''); setDomestic('전체'); setWarehouse(''); setProject(''); setPartner(''); setItem(''); setByUpdated(false) } },
        { label: '진행상태변경', selected: checked.size,
          onClick: () => setProgressMenu({ at: above(footerBtn('진행상태변경')), ids: [...checked] }) },
        { label: '인쇄', disabled: checked.size === 0, onClick: () => printRows(shown.filter((o) => checked.has(o.id))) },
        { label: '다른전표생성', disabled: checked.size === 0, onClick: () => setOtherMenu(above(footerBtn('다른전표생성'))) },
        { label: '선택삭제', onClick: removeChecked, selected: checked.size },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={SELF_USE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="발주요청No.">
          <input className="ec-input" value={reqNo} onChange={(e) => setReqNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="내.외자구분">
          {(['전체', '내자', '외자'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="pr-domestic" checked={domestic === v} onChange={() => setDomestic(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처코드" pick>
          <CodePickerField label="거래처코드" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      {progressMenu && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setProgressMenu(null)} />
          <div className="ec-menu fixed" style={progressMenu.at} role="menu" aria-label="진행상태변경">
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 미확인</div>
            <button onClick={() => void changeProgress(progressMenu.ids, 'UNCONFIRMED')}>미확인</button>
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 확인</div>
            <button onClick={() => void changeProgress(progressMenu.ids, 'IN_PROGRESS')}>진행중</button>
            <button onClick={() => void changeProgress(progressMenu.ids, 'COMPLETED')}>완료</button>
          </div>
        </>
      )}
      {otherMenu && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setOtherMenu(null)} />
          <div className="ec-menu fixed" style={otherMenu} role="menu" aria-label="다른전표생성">
            <button onClick={makePlans}>발주계획</button>
          </div>
        </>
      )}
      <Modal open={planOf != null} error={error} title="발주계획번호확인" width={560} onClose={() => setPlanOf(null)}>{planOf && (<>
        <table className="w-full">
          <thead><tr><th className="w-[60px] text-center">No.</th><th className="text-center">발주계획번호</th></tr></thead>
          <tbody>
            {/* 원본 '2026/10/20 -1 │ 2026/10/20 -2' — 이 요청 번호와 그 줄을 베낀 계획 번호들. */}
            {plansOf(planOf).length === 0
              ? <tr><td colSpan={2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : plansOf(planOf).map((p) => (
                <tr key={p.id}><td className="text-center">{dateNo(planOf.orderDate, planOf.orderNo)}</td><td className="text-center">{dateNo(p.orderDate, p.orderNo)}</td></tr>
              ))}
          </tbody>
        </table>
        <div className="mt-[10px]"><button type="button" className="ec-btn" onClick={() => setPlanOf(null)}>닫기</button></div>
      </>)}</Modal>

      {/* 원본 제목 옆 알약: 전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료 */}
      <div className="ec-pills mb-[8px]">
        {([['ALL', '전체'], ['APPROVAL', '결재중'], ['UNCONFIRMED', '미확인'], ['CONFIRMED', '확인 ▸'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료']] as const).map(([k, label]) => (
          <button key={k} type="button" className={`ec-pill no-ec${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((o) => checked.has(o.id))}
                onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((o) => o.id)) : new Set())} />
            </th>
            <th className="text-center">발주요청일자</th>
            <th>거래처명</th>
            <th>품목</th>
            <th className="text-center">납기일자</th>
            <th className="text-right">수량</th>
            <th className="text-right">금액(합계)</th>
            <th className="text-center">종결여부</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o, i) => (
            <tr key={o.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              {/* 원본 '26/10/12-2' — 그날 일련번호만 붙인다. 우리 전표번호(PO-20261012-0002)를 통째로 찍고 있었다(2026-10-13 실측). */}
              <td className="text-center">
                <input type="checkbox" aria-label="선택" checked={checked.has(o.id)}
                  onChange={(e) => setChecked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n })} />
              </td>
              <td className="text-center">
                {/* 원본: 일자를 누르면 '발주요청입력(수정)' 창 */}
                <a className="cursor-pointer" onClick={() => openForm(o)}>{shortDateNo(o.orderDate, o.orderNo)}</a>
              </td>
              <td>{o.partnerName}</td>
              {/* 원본 '비밀의정원 [96페이지] 외 1건' — 첫 품목에 규격을 붙인다. */}
              <td>{o.lines[0]?.itemName ?? ''}{o.lines[0]?.spec ? ` [${o.lines[0].spec}]` : ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td className="text-center">{yy(o.dueDate)}</td>
              <td className="text-right">{o.lines.reduce((a, l) => a + Number(l.quantity), 0).toLocaleString('ko-KR')}</td>
              <td className="text-right">{won(Number(o.totalAmount))}</td>
              <td className="text-center">
                {/* 원본: 누르면 그 줄의 상태 메뉴(미확인 / 진행중 · 완료). 완료는 주황 글자. */}
                <a className={`cursor-pointer${progressOf(o) === 'COMPLETED' ? ' text-[var(--ec-done)]' : ''}`}
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setProgressMenu({ at: { left: r.left, top: r.bottom + 4 }, ids: [o.id] }) }}>
                  {progressLabel(o)}
                </a>
              </td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => setPlanOf(o)}>조회</a></td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => printRows([o])}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {form && (
        <PurchaseRequestForm key={form.key} editing={form.order}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); void load() }}
          onDeleted={() => { setForm(null); void load() }}
          onCopy={(src) => openForm({ ...src, id: 0, orderDate: new Date().toLocaleDateString('sv-SE'), dueDate: new Date().toLocaleDateString('sv-SE') })}
          onStep={step} />
      )}
      {planSeed && (
        <PurchaseRequestForm key={planSeed.key} editing={null} plan seed={planSeed}
          onClose={() => setPlanSeed(null)}
          onSaved={() => { setPlanSeed(null); setChecked(new Set()); void load() }} />
      )}
    </EcListShell>
  )
}
