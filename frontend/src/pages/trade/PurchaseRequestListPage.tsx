import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell, { type OptionItem } from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SELF_USE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo } from '../../utils/dateNo'
import type { Item, PurchaseOrder, PurchaseOrderStatus } from '../../types/api'
import PurchaseRequestForm, { copyLines, type PurchaseLineSeed } from '../../features/purchaserequest/PurchaseRequestForm'
import { purchaseRequestDocument } from '../../features/purchaserequest/purchaseRequestDocument'
import Modal from '../../components/Modal'
import { printDocuments } from '../../utils/printDocument'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { SlipMenuHistoryModal, EMAIL_NOT_HERE, BARCODE_NOT_HERE } from '../../features/sliphistory/SlipMenuHistoryModal'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import SlipWindow from '../../components/SlipWindow'
import { fmtAmount } from '../../utils/format'

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
const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)
/** 생성한전표가 있으면 원본처럼 주황 꼬리표(QuotationPage GEN_TAG 와 같은 실측). */
const GEN_TAG = 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] leading-[13.2px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline'

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
 *
 * <p>2026-10-31 loginad 클릭 대조(5번): 머리 검색칸 · Search(F3) · Option · 도움말, 조건 판은 접혀 있다가 Search(F3) 로 열린다
 * (기준일자 · 발주요청No. · 내.외자구분 · 창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 발송여부 · 기타 · 적용양식, 판 아래 [검색(F8)▾] … 다시 작성).
 * 표 ☑ · 일자-No. · 거래처명 · 품목명(요약) · 납기일자 · 발주요청수량합계 · 발주요청금액합계 · 진행상태 · 생성한전표(주황 [조회]) · 인쇄 — 번호 열 없음.
 * 옛 [종결여부](사람이 정한 진행) 가 원본 [진행상태] 자리, 옛 [진행상태] '조회'(발주계획번호확인) 가 [생성한전표] 자리다.
 * [신규(F2)] · 일자-No. 창은 목록 위 떠 있는 창(제목줄 새창 · 고정 · 새로고침 · 최대화 · 닫기).
 */
export default function PurchaseRequestListPage() {
  const pickers = useCondPickers(['warehouses', 'projects', 'partners', 'items'])
  /** 원본 [관리항목] — 품목 마스터의 관리항목으로 거른다(견적서조회와 같은 잣대). */
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => { api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {}) }, [])
  const mgmt = useItemMgmt(items)
  const [mgmtCond, setMgmtCond] = useState('')
  /** 원본 [발송여부] — 우리는 발주요청서를 밖으로 보내지 않아 모두 미발송이다. */
  const [sentCond, setSentCond] = useState<'전체' | '미발송' | '발송'>('전체')
  const [keyword, setKeyword] = useState('')
  const [historyWin, setHistoryWin] = useState(false)
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
    .filter((o) => !item || o.lines.some((l) => String(l.itemId) === item))
    .filter((o) => mgmt.hits(o.lines.map((l) => l.itemId), mgmtCond))
    .filter(() => sentCond !== '발송')
    .filter((o) => !keyword || (o.partnerName ?? '').includes(keyword) || o.orderNo.includes(keyword)
      || o.lines.some((l) => (l.itemName ?? '').includes(keyword))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows, from, to, reqNo, domestic, warehouse, project, partner, item, mgmtCond, mgmt.options, sentCond, keyword])
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
    const targets = shown.filter((o) => checked.has(o.id))
    if (!requireSelection(targets.length)) return
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
  const resetConds = () => {
    setFrom(init.from); setTo(init.to); setReqNo(''); setDomestic('전체'); setWarehouse(''); setProject(''); setPartner(''); setItem('')
    setMgmtCond(''); setSentCond('전체'); setByUpdated(false)
  }
  /* 원본 [Option](2026-10-31 loginad 발주요청조회): 업무설정 · 검색항목설정 · 양식설정 ▶ · 조건양식설정 · 문서발송내역. */
  const optionMenu: OptionItem[] = [
    { label: '업무설정', onClick: notHere('업무설정') },
    { label: '검색항목설정', onClick: notHere('검색항목설정') },
    { label: '양식설정', sub: [
      { label: '기본(수정불가)', active: true, onClick: () => void ecAlert('양식은 하나만 지원합니다.') },
      { label: '신규양식추가', onClick: () => void ecAlert('신규양식추가는 지원하지 않습니다(양식 하나).') },
    ] },
    { label: '조건양식설정', onClick: notHere('조건양식설정') },
    { label: '문서발송내역', onClick: notHere('문서발송내역') },
  ]

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
      search={keyword}
      onSearchChange={setKeyword}
      onReset={resetConds}
      onNew={() => openForm(null)}
      formMenu={{ current: '기본(수정불가)' }}
      optionMenu={optionMenu}
      /*
       * 원본 하단(2026-10-31 loginad 발주요청조회): 신규(F2) · Email▲ · 진행상태변경▲ · 보내기▲ · 인쇄▲ · 바코드(품목)▲ · 다른전표생성▲ ·
       * 전자결재 · 선택삭제 · Excel · 이력조회 · 웹자료올리기 — 견적서조회와 같은 꼴. [검색(F8)] · [다시작성] 은 조건 판 아래 줄로 갔다.
       * 진행상태변경 펼침은 예전 메뉴의 '▾미확인 › 미확인 / ▾확인 › 진행중 · 완료' 에서 묶음 머리가 빠진다(셸 펼침 — 공용 부품).
       */
      actions={[
        { label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE), menu: [{ label: '카카오톡', onClick: notHere('카카오톡') }] },
        { label: '진행상태변경', menuOnly: true, selected: checked.size, menu: [
          { label: '미확인', onClick: () => { if (requireSelection(checked.size)) void changeProgress([...checked], 'UNCONFIRMED') } },
          { label: '진행중', onClick: () => { if (requireSelection(checked.size)) void changeProgress([...checked], 'IN_PROGRESS') } },
          { label: '완료', onClick: () => { if (requireSelection(checked.size)) void changeProgress([...checked], 'COMPLETED') } },
        ] },
        { label: '보내기', menuOnly: true, menu: ['E Note', '대화방', '사용자', '북마크'].map((l) => ({ label: l, onClick: notHere(`보내기 › ${l}`) })) },
        { label: '인쇄', selected: checked.size, onClick: () => printRows(shown.filter((o) => checked.has(o.id))),
          menu: [{ label: '프린트문제해결', onClick: notHere('프린트문제해결') }] },
        { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE), selected: checked.size, menu: [
          { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE) },
          { label: '바코드(사업장/번호No.)', onClick: notHere('바코드(사업장/번호No.)') },
        ] },
        { label: '다른전표생성', menuOnly: true, menu: [{ label: '발주계획', onClick: makePlans }] },
        { label: '전자결재', onClick: notHere('전자결재') },
        { label: '선택삭제', onClick: removeChecked, selected: checked.size },
        { label: 'Excel' },
        { label: '이력조회', onClick: () => setHistoryWin(true) },
        { label: '웹자료올리기', onClick: notHere('웹자료올리기') },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {historyWin && <SlipMenuHistoryModal menu="발주요청" statusLabel="확인" noLabel="전표번호" onClose={() => setHistoryWin(false)} />}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={SELF_USE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="발주요청No.">
          <input className="ec-input w-[180px]" value={reqNo} onChange={(e) => setReqNo(e.target.value)} />
        </EcCond>
        <EcCond label="내.외자구분">
          <div className="ec-pills">
            {(['전체', '내자', '외자'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${domestic === v ? ' active' : ''}`} onClick={() => setDomestic(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체" value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        {/* [거래처] · [품목] 이름은 ui-check 원본 조건표(loginaa 발주요청조회)대로 '…코드' 를 둔다(주문서조회와 같은 처리). */}
        <EcCond label="거래처코드" pick>
          <CodePickerField label="거래처코드" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="발송여부">
          <div className="ec-pills">
            {(['전체', '미발송', '발송'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${sentCond === v ? ' active' : ''}`} onClick={() => setSentCond(v)}>{v}</button>
            ))}
          </div>
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
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((o) => checked.has(o.id))}
                onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((o) => o.id)) : new Set())} />
            </th>
            <th className="w-[150px]">일자-No.</th>
            <th>거래처명</th>
            <th>품목명(요약)</th>
            <th className="text-center">납기일자</th>
            <th className="text-right">발주요청수량합계</th>
            <th className="text-right">발주요청금액합계</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">생성한전표</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o) => (
            <tr key={o.id}>
              <td className="text-center">
                <input type="checkbox" aria-label="선택" checked={checked.has(o.id)}
                  onChange={(e) => setChecked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n })} />
              </td>
              {/* 원본 '2026/10/21 -1' — 누르면 목록 위 '발주요청입력(수정)' 창. */}
              <td><a className="cursor-pointer" onClick={() => openForm(o)}>{dateNo(o.orderDate, o.orderNo)}</a></td>
              <td>{o.partnerName}</td>
              {/* 원본 '비밀의정원 [96페이지] 외 1건' — 첫 품목에 규격을 붙인다. */}
              <td>{o.lines[0]?.itemName ?? ''}{o.lines[0]?.spec ? ` [${o.lines[0].spec}]` : ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td className="text-center">{yy(o.dueDate)}</td>
              <td className="text-right">{o.lines.reduce((a, l) => a + Number(l.quantity), 0).toLocaleString('ko-KR')}</td>
              <td className="text-right">{fmtAmount(Number(o.totalAmount))}</td>
              <td className="text-center">
                {/* 원본: 누르면 그 줄의 상태 메뉴(미확인 / 진행중 · 완료). 완료는 주황 글자. */}
                <a className={`cursor-pointer${progressOf(o) === 'COMPLETED' ? ' text-[var(--ec-done)]' : ''}`}
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setProgressMenu({ at: { left: r.left, top: r.bottom + 4 }, ids: [o.id] }) }}>
                  {progressLabel(o)}
                </a>
              </td>
              {/* 원본 [생성한전표] — 발주계획을 만든 줄만 주황 [조회] → '발주계획번호확인'. */}
              <td className="text-center">{plansOf(o).length > 0 ? <a className={`cursor-pointer ${GEN_TAG}`} onClick={() => setPlanOf(o)}>조회</a> : null}</td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => printRows([o])}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {form && (
        <SlipWindow title={form.order && form.order.id > 0 ? '발주요청입력(수정)' : '발주요청입력'}
                              popout="/sales/purchase-request-input" onClose={() => setForm(null)}>
          {/* 원본 발주요청입력(수정) 머리 [확인취소] — 이 회사 설정으로는 알림만 뜬다(판매 · 주문 수정 창과 같다). */}
          {form.order && form.order.id > 0 && (
            <div className="flex justify-end mb-[6px]">
              <button type="button" className="ec-btn ec-btn-sm"
                      onClick={() => void ecAlert('전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다.')}>확인취소</button>
            </div>
          )}
          <PurchaseRequestForm key={form.key} bare editing={form.order}
            onClose={() => setForm(null)}
            onSaved={() => { setForm(null); void load() }}
            onDeleted={() => { setForm(null); void load() }}
            onCopy={(src) => openForm({ ...src, id: 0, orderDate: new Date().toLocaleDateString('sv-SE'), dueDate: new Date().toLocaleDateString('sv-SE') })}
            onStep={step} />
        </SlipWindow>
      )}
      {planSeed && (
        <PurchaseRequestForm key={planSeed.key} editing={null} plan seed={planSeed}
          onClose={() => setPlanSeed(null)}
          onSaved={() => { setPlanSeed(null); setChecked(new Set()); void load() }} />
      )}
    </EcListShell>
  )
}
