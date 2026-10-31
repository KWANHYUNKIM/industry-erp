import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseOrder } from '../../types/api'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import { dateText } from '../../utils/dateText'
import { dateNo } from '../../utils/dateNo'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { ymd } from '../../utils/periods'
import { fmtAmount } from '../../utils/format'

/**
 * 구매관리 > 단가요청진행단계 (이카운트 E040323) — 2026-10-21 loginaa 실측.
 * 단가요청은 이제 <b>따로 된 전표</b>(PRICE_REQUESTED)다. 원본 열: 단가요청번호 · 품목명 · 진행단계 · 거래처명 · 수취금액 · 확정금액 · 이력.
 * 진행단계는 두 칸 <b>[수취단가확인] → [단가확정]</b> — 누르면 단가요청비교현황 창(PriceCompareModal, PATCH /price-steps).
 * 확정단가는 발주서입력 [단가요청] 으로 베낄 때 발주서 단가가 된다(원본 확정 90 → 발주서 10 × 90 = 900 · 990).
 * 수취금액 · 확정금액 칸은 원본이 <b>단가</b>를 찍는다(10 × 90 인데 90 — 한 줄짜리만 잼, 여러 줄은 단가 합으로 둔다).
 */
type Step = 'received' | 'confirmed'
const STEP_LABEL: Record<Step, string> = { received: '수취단가확인', confirmed: '단가확정' }
/** 오늘보다 지난 날짜인가. 목록에 날짜만 적어 두면 지났는지를 <b>사람이 세어야</b> 한다. */
const expired = (d: string | null) => !!d && d < ymd(new Date())

const stepDone = (r: PurchaseOrder, s: Step) => r.lines.length > 0
  && r.lines.every((l) => (s === 'received' ? l.receivedPrice : l.confirmedPrice) != null)
const stepAmount = (r: PurchaseOrder, s: Step) => r.lines.reduce((a, l) => {
  const p = s === 'received' ? l.receivedPrice : l.confirmedPrice
  return a + (p == null ? 0 : Number(p))
}, 0)

/** 원본 [이력] 한 줄 — 언제 어느 단계로 넘어갔나. */
interface HistoryRow {
  changedAt: string
  fromStatusName: string | null
  toStatusName: string
  changedBy: string | null
  note: string | null
}

/**
 * 진행단계 칸을 누르면 뜨는 <b>단가요청비교현황</b> 창 — 원본 E040323 2026-10-21 loginaa 실측(computer 클릭으로 열어 잼).
 *
 * <p>열: 품목코드 · 품목명 · 규격 · 수량 · 공급가액 · <b>요청단가</b> · <b>거래처명</b>(그 밑에 '수취단가 직접입력'). 단추 확정단가선택/수정 · 인쇄 · Excel · 닫기.
 * '수취단가 직접입력' 은 <b>단가요청수정</b> 창(입력 화면과 같은 꼴, 단가 칸이 비어 있음)을 띄워 수취단가를 적는다 — 원본 10 × 90 저장 → 비교현황 90.
 * [확정단가선택/수정] 을 누르면 단가 칸마다 동그라미가 생긴다(처음엔 요청단가) — <b>확정단가는 적는 것이 아니라 요청 · 수취 중에서 고른다</b>.
 * 단추가 [단가확정/저장(F8)] 로 바뀌고, 저장하면 창이 닫히며 진행단계 두 칸이 끝남으로 바뀐다. 원본 칸의 '수정' 작은 메뉴는 건너뛴다.
 */
function PriceCompareModal({ order, selecting, onClose, onSaved }: { order: PurchaseOrder; selecting: boolean; onClose: () => void; onSaved: () => void }) {
  const [select, setSelect] = useState(selecting)
  const [editOpen, setEditOpen] = useState(false)
  /** 줄마다 확정단가로 고른 칸 — 'req' 요청단가 · 'recv' 수취단가. 이미 확정했으면 그 값과 같은 칸. */
  const [pick, setPick] = useState<('req' | 'recv')[]>(() => order.lines.map((l) =>
    l.confirmedPrice != null && l.receivedPrice != null && Number(l.confirmedPrice) === Number(l.receivedPrice)
      && Number(l.confirmedPrice) !== Number(l.unitPrice) ? 'recv' : 'req'))
  const [error, setError] = useState('')
  async function confirmSave() {
    setError('')
    try {
      await api.patch(`/purchase-orders/${order.id}/price-steps`, {
        priceValidUntil: order.priceValidUntil ?? null,
        lines: order.lines.map((l, i) => ({
          lineId: l.id,
          confirmedPrice: Number(pick[i] === 'recv' && l.receivedPrice != null ? l.receivedPrice : l.unitPrice),
        })),
      })
      onSaved()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  const supply = (l: PurchaseOrder['lines'][number]) => Number(l.quantity) * Number(l.unitPrice)
  const radio = (i: number, v: 'req' | 'recv') => select && (
    <input type="radio" className="mr-[6px]" aria-label={v === 'req' ? '요청단가' : '수취단가'} checked={pick[i] === v}
           disabled={v === 'recv' && order.lines[i].receivedPrice == null}
           onChange={() => setPick((p) => p.map((x, k) => (k === i ? v : x)))} />
  )
  const all = (v: 'req' | 'recv') => select && (
    <input type="radio" className="mr-[6px]" aria-label={v === 'req' ? '요청단가 전체' : '수취단가 전체'} checked={pick.every((x) => x === v)}
           onChange={() => setPick(order.lines.map((l) => (v === 'recv' && l.receivedPrice == null ? 'req' : v)))} />
  )
  return (
    <Modal open title="단가요청비교현황" width={860} onClose={onClose} error={error}>
      <div className="text-center text-[16px] font-bold underline mb-[6px]">단가요청비교현황</div>
      <div className="flex justify-between text-[12px] mb-[4px]">
        <span>{dateNo(order.orderDate, order.orderNo)}</span>
        <span>유효기간 : {order.priceValidUntil ? order.priceValidUntil.replace(/-/g, '/') : ''}</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th rowSpan={2}>품목코드</th><th rowSpan={2}>품목명</th><th rowSpan={2}>규격</th>
            <th rowSpan={2} className="text-right">수량</th><th rowSpan={2} className="text-right">공급가액</th>
            <th rowSpan={2} className="text-center">{all('req')}요청단가</th>
            <th className="text-center">{all('recv')}{order.partnerName}</th>
          </tr>
          <tr>
            <th className="text-center"><a className="cursor-pointer" onClick={() => setEditOpen(true)}>수취단가 직접입력</a></th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{l.itemCode}</td><td>{l.itemName}</td><td>{l.spec ?? ''}</td>
              <td className="text-right">{fmtAmount(Number(l.quantity))}</td>
              <td className="text-right">{fmtAmount(supply(l))}</td>
              <td className="text-right">{radio(i, 'req')}{fmtAmount(Number(l.unitPrice))}</td>
              <td className="text-right">{radio(i, 'recv')}{l.receivedPrice == null ? '' : fmtAmount(Number(l.receivedPrice))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="text-center">계</td>
            <td className="text-right">{fmtAmount(order.lines.reduce((a, l) => a + supply(l), 0))}</td>
            <td></td><td></td>
          </tr>
        </tfoot>
      </table>
      <div className="flex gap-[4px] mt-[10px]">
        {select
          ? <button type="button" className="ec-btn ec-btn-primary" onClick={() => void confirmSave()}>단가확정/저장(F8)</button>
          : <button type="button" className="ec-btn ec-btn-primary" onClick={() => setSelect(true)}>확정단가선택/수정</button>}
        <button type="button" className="ec-btn" onClick={() => window.print()}>인쇄</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
      {editOpen && <ReceivedPriceModal order={order} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); onSaved() }} />}
    </Modal>
  )
}

/** '수취단가 직접입력' → <b>단가요청수정</b> 창 — 원본은 입력 화면 꼴(품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세)에 단가가 빈 채로 열린다. */
function ReceivedPriceModal({ order, onClose, onSaved }: { order: PurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const [prices, setPrices] = useState<string[]>(() => order.lines.map((l) => (l.receivedPrice == null ? '' : String(Number(l.receivedPrice)))))
  const [error, setError] = useState('')
  async function save() {
    setError('')
    try {
      await api.patch(`/purchase-orders/${order.id}/price-steps`, {
        priceValidUntil: order.priceValidUntil ?? null,
        lines: order.lines.map((l, i) => ({ lineId: l.id, receivedPrice: prices[i] === '' ? null : Number(prices[i]) })),
      })
      onSaved()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  const amt = (i: number) => Number(order.lines[i].quantity) * Number(prices[i] || 0)
  return (
    <Modal open title="단가요청수정" width={760} onClose={onClose} error={error}>
      <div className="flex flex-wrap gap-x-[24px] gap-y-[4px] mb-[8px] text-[12px]">
        <span><span className="text-ec-label mr-[8px]">일자</span>{dateNo(order.orderDate, order.orderNo)}</span>
        <span><span className="text-ec-label mr-[8px]">거래처</span>{order.partnerName}</span>
        <span><span className="text-ec-label mr-[8px]">유효기간</span>{order.priceValidUntil ? order.priceValidUntil.replace(/-/g, '/') : ''}</span>
      </div>
      <table className="w-full text-left">
        <thead><tr>
          <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th>
          <th className="text-right w-[120px]">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th>
        </tr></thead>
        <tbody>
          {order.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{l.itemCode}</td><td>{l.itemName}</td><td>{l.spec ?? ''}</td>
              <td className="text-right">{fmtAmount(Number(l.quantity))}</td>
              <td><EcNumInput className="ec-input w-full text-right" value={prices[i]}
                              onValue={(v) => setPrices((p) => p.map((x, k) => (k === i ? v : x)))} /></td>
              <td className="text-right">{fmtAmount(amt(i))}</td>
              <td className="text-right">{fmtAmount(Math.round(amt(i) / 10))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[10px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/*
 * 원본 단가요청진행단계는 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간 칸이 <b>아예 없어서</b> 단가요청이 쌓이면 목록만 길어졌다.
 */
const initP = periodOf('금월(~오늘)')!

export default function PriceRequestProgressPage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [stepOpen, setStepOpen] = useState<{ order: PurchaseOrder; step: Step } | null>(null)
  /** 원본 조건 [진행상태] — 진행단계 어디까지 왔나. */
  const [stepCond, setStepCond] = useState<'전체' | '수취단가확인 전' | '수취단가확인' | '단가확정'>('전체')
  const tableRef = useRef<HTMLTableElement>(null)
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 단가요청진행단계의 조건 차례는 <b>유효기간 · 진행상태 · 거래처 · 품목 ·
   * 프로젝트 · 담당자 · 거래처관리담당자 · 적요</b> 다(사본 실측).
   * 넷을 만든다 — 값은 이미 응답에 다 있었다. 눈에는 보이는데 그것으로 좁힐 수가 없었다.
   */
  /*
   * 원본 [유효기간] — 셀렉트가 <b>[사용안함]</b> 으로 서 있고, 켜면 기간 두 칸이 나온다
   * (사본 실측: ddlTSYear 셀렉트 + 숨어 있는 datepicker-range). 기본이 '안 거른다' 이므로
   * 처음 연 사람에게는 아무것도 안 사라진다.
   */
  const [validUse, setValidUse] = useState<'사용안함' | '기간지정'>('사용안함')
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  /*
   * 원본 단가요청진행단계 조건의 <b>[거래처관리담당자]</b>. [담당자]는 <b>우리 쪽 담당</b>이고
   * 이것은 <b>그 거래처를 맡은 사람</b>이다 — 거래처 마스터가 들고 있다.
   * "내가 맡은 거래처의 단가요청" 을 한 번에 보려면 이것으로 걸러야 한다.
   */
  /* 발주서에 프로젝트 칸을 만들면서 이 조건도 만들 수 있게 됐다. */
  const [projCond, setProjCond] = useState('')
  const [partnerMgrCond, setPartnerMgrCond] = useState('')
  const [partnerMgrs, setPartnerMgrs] = useState<Map<string, string>>(new Map())
  const pickers = useCondPickers(['partners', 'items', 'employees', 'projects'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 격자의 <b>[이력]</b> — 그 발주가 밟아 온 자취를 그 자리에서 편다.
   * 우리는 <b>지금 상태만</b> 들고 있어서 "언제 단가확정으로 넘어갔나", "누가 취소했나" 를
   * 물을 수가 없었다 — 늦어진 발주를 두고 어디서 멈춰 있었는지 아무도 답하지 못했다.
   *
   * <p>펼친 발주만 가져온다. 목록에 끼워 넣으면 <b>보지도 않을 자취까지</b> 실어 나른다.
   */
  const [openHistory, setOpenHistory] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  async function toggleHistory(id: number) {
    if (openHistory === id) { setOpenHistory(null); return }
    setOpenHistory(id)
    setHistory([])
    try { setHistory((await api.get<HistoryRow[]>(`/purchase-orders/${id}/history`)).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function load() {
    setLoading(true); setError('')
    /*
     * <b>고른 기간을 서버에도 보낸다.</b> 여태 전표를 통째로 받아 아래에서 걸렀다 —
     * 화면은 [기간]을 묻고 서버에는 아무것도 안 보내는 꼴이었다.
     */
    const period: Record<string, string> = {}
    if (from) period.from = from
    if (to) period.to = to
    try { setRows((await api.get<PurchaseOrder[]>('/purchase-orders', { params: period })).data) }
    catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])
  /* 거래처 마스터에서 [관리담당자]를 가져와 거래처명으로 잇는다 — 전표는 이름만 들고 온다. */
  useEffect(() => {
    api.get<{ name: string; manager: string | null }[]>('/partners')
      .then((r) => setPartnerMgrs(new Map(r.data.map((p) => [p.name, p.manager ?? '']))))
      .catch(() => {})
  }, [])

  const shown = useMemo(() => rows
    .filter((r) => r.status === 'PRICE_REQUESTED')
    .filter((r) => stepCond === '전체' || (stepCond === '단가확정' ? stepDone(r, 'confirmed')
      : stepCond === '수취단가확인' ? stepDone(r, 'received') && !stepDone(r, 'confirmed') : !stepDone(r, 'received')))
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.orderNo.includes(keyword) || r.lines.some((l) => l.itemName.includes(keyword)))
    .filter((r) => !partnerCond || String(r.partnerId) === partnerCond)
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !empCond || (r.employeeName ?? '').includes(empCond))
    .filter((r) => !partnerMgrCond || partnerMgrs.get(r.partnerName) === partnerMgrCond)
    .filter((r) => !remarkCond || (r.remark ?? '').includes(remarkCond))
    /*
     * 원본 [유효기간] — [사용안함]이면 안 거른다. 켰을 때 <b>유효기간이 없는 요청은 빠진다</b>:
     * 기간으로 물었는데 기간이 없는 것을 끼워 주면 무엇으로 걸린 목록인지 알 수 없다.
     */
    .filter((r) => validUse === '사용안함'
      || (r.priceValidUntil != null
        && (!validFrom || r.priceValidUntil >= validFrom)
        && (!validTo || r.priceValidUntil <= validTo)))
    .filter((r) => (!from || r.orderDate >= from) && (!to || r.orderDate <= to))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.id - a.id),
  [rows, stepCond, keyword, partnerCond, itemCond, empCond, remarkCond, partnerMgrCond, partnerMgrs, projCond,
    validUse, validFrom, validTo])

  /*
   * 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. 머리를 안 누른 동안은 위의 기본 차례
   * (요청일 내림차순)를 그대로 쓴다.
   */
  const sort = useTableSort(shown, {
    단가요청번호: (r) => r.orderDate + r.orderNo,
  })

  useTableColumnCheck(tableRef, '단가요청진행단계', [shown.length])

  return (
    <EcListShell title="단가요청진행단계" search={keyword} onSearchChange={setKeyword} onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      {/* 원본 조건 차례: 진행상태 · 거래처 · 품목 · 담당자 · 적요 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 차례는 <b>[유효기간]이 맨 앞</b>이다(사본 실측). */}
        {/* 원본 조건 첫째 <b>[기준일자]</b>(사본 실측). 유효기간과 다른 값이다 — 이건 요청한 날이다. */}
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="유효기간">
          <select className="ec-input" value={validUse} style={{ width: 100 }}
                  onChange={(e) => setValidUse(e.target.value as '사용안함' | '기간지정')}>
            <option>사용안함</option><option>기간지정</option>
          </select>
          {validUse === '기간지정' && (
            <>
              <EcDateRange from={{ className: "ec-input", value: validFrom, onChange: (e) => setValidFrom(e.target.value) }} to={{ className: "ec-input", value: validTo, onChange: (e) => setValidTo(e.target.value) }} />
            </>
          )}
        </EcCond>
        <EcCond label="진행상태">
          <select className="ec-input w-[140px]" value={stepCond} onChange={(e) => setStepCond(e.target.value as typeof stepCond)}>
            {(['전체', '수취단가확인 전', '수취단가확인', '단가확정'] as const).map((o) => <option key={o}>{o}</option>)}
          </select>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        {/* 원본 차례: … 거래처 · 품목 · <b>프로젝트</b> · 담당자 · 거래처관리담당자 · 적요 */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond} items={pickers.employees} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          {/* 마스터를 고르는 칸은 코드도움이다. 후보는 <b>실제로 거래처를 맡은 사람들</b>에서 뽑는다. */}
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={partnerMgrCond} onChange={setPartnerMgrCond}
                           items={[...new Set(partnerMgrs.values())].filter(Boolean).sort()
                             .map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
      </ul>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            {/* 원본 열(2026-10-21 실측): 단가요청번호 · 품목명 · 진행단계 · 거래처명 · 수취금액 · 확정금액 · 이력. 유효기간은 우리 덧붙임. */}
            <th className="cursor-pointer text-center" onClick={() => sort.toggle('단가요청번호')}>단가요청번호 {sort.mark('단가요청번호')}</th>
            <th>품목명</th>
            <th className="w-[230px] text-center">진행단계</th>
            <th>거래처명</th>
            <th className="text-right">수취금액</th>
            <th className="text-right">확정금액</th>
            <th className="w-[110px] text-center">유효기간</th>
            <th className="w-[60px] text-center">이력</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => [
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center">{dateNo(r.orderDate, r.orderNo)}</td>
              <td>{r.lines[0]?.itemName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
              <td className="text-center">
                {(['received', 'confirmed'] as const).map((st) => (
                  <button key={st} type="button" onClick={() => setStepOpen({ order: r, step: st })}
                          className={`ec-btn ec-btn-sm mr-[4px]${stepDone(r, st) ? ' ec-btn-primary' : ''}`}>{STEP_LABEL[st]}</button>
                ))}
              </td>
              <td>{r.partnerName}</td>
              <td className="text-right">{stepDone(r, 'received') ? fmtAmount(stepAmount(r, 'received')) : ''}</td>
              <td className="text-right">{stepDone(r, 'confirmed') ? fmtAmount(stepAmount(r, 'confirmed')) : ''}</td>
              <td className={`text-center ${expired(r.priceValidUntil) ? 'text-ec-danger font-bold' : 'text-ec-label'}`}>
                {r.priceValidUntil ? dateText(r.priceValidUntil) : ''}
              </td>
              <td className="text-center">
                <button onClick={() => toggleHistory(r.id)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  {openHistory === r.id ? '접기' : '펼치기'}
                </button>
              </td>
            </tr>,
            openHistory === r.id ? (
              <tr key={`${r.id}-history`}>
                <td colSpan={9} className="bg-ec-page py-[8px] px-[14px]">
                  {history.length === 0 ? (
                    <span className="text-[12px] text-ec-hint">자취가 없습니다.</span>
                  ) : (
                    <table className="w-full text-left max-w-[720px]">
                      <thead><tr>
                        <th className="w-[34px]"></th><th className="w-[150px]">일시</th>
                        <th className="w-[180px]">단계</th><th className="w-[100px]">바꾼 사람</th><th>비고</th>
                      </tr></thead>
                      <tbody>
                        {history.map((h, k) => (
                          <tr key={`${h.changedAt}-${k}`}>
                            <td className="text-center text-ec-hint">{k + 1}</td>
                            <td>{h.changedAt.slice(0, 16).replace('T', ' ')}</td>
                            <td>
                              {h.fromStatusName ? `${h.fromStatusName} → ` : ''}
                              <b className="text-ec-navy">{h.toStatusName}</b>
                            </td>
                            <td className="text-ec-label">{h.changedBy ?? ''}</td>
                            <td className="text-ec-hint">{h.note ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td>
              </tr>
            ) : null,
          ]).flat()}
        </tbody>
      </table>
      {stepOpen && <PriceCompareModal order={stepOpen.order} selecting={stepOpen.step === 'confirmed'} onClose={() => setStepOpen(null)}
                                   onSaved={() => { setStepOpen(null); void load() }} />}
    </EcListShell>
  )
}
