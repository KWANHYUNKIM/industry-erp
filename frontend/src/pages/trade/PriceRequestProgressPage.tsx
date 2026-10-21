import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseOrder } from '../../types/api'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import { dateText } from '../../utils/dateText'
import { dateNo } from '../../utils/dateNo'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'

/**
 * 구매관리 > 단가요청진행단계 (이카운트 E040323) — 2026-10-21 loginaa 실측.
 * 단가요청은 이제 <b>따로 된 전표</b>(PRICE_REQUESTED)다. 원본 열: 단가요청번호 · 품목명 · 진행단계 · 거래처명 · 수취금액 · 확정금액 · 이력.
 * 진행단계는 두 칸 <b>[수취단가확인] → [단가확정]</b> — 누르면 줄마다 수취단가 · 확정단가를 적는 창이 뜬다(PATCH /price-steps).
 * 확정단가는 단가요청조회 [다른전표생성 › 발주서] 로 베낄 때 발주서 단가가 된다.
 * (원본 진행단계 칸을 눌러 뜨는 창은 합성 클릭으로 열리지 않아 못 쟀다 — 창 모양은 우리 것.)
 */
type Step = 'received' | 'confirmed'
const STEP_LABEL: Record<Step, string> = { received: '수취단가확인', confirmed: '단가확정' }
/** 오늘보다 지난 날짜인가. 목록에 날짜만 적어 두면 지났는지를 <b>사람이 세어야</b> 한다. */
const expired = (d: string | null) => !!d && d < new Date().toISOString().slice(0, 10)

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const stepDone = (r: PurchaseOrder, s: Step) => r.lines.length > 0
  && r.lines.every((l) => (s === 'received' ? l.receivedPrice : l.confirmedPrice) != null)
const stepAmount = (r: PurchaseOrder, s: Step) => r.lines.reduce((a, l) => {
  const p = s === 'received' ? l.receivedPrice : l.confirmedPrice
  return a + (p == null ? 0 : Number(l.quantity) * Number(p))
}, 0)

/** 원본 [이력] 한 줄 — 언제 어느 단계로 넘어갔나. */
interface HistoryRow {
  changedAt: string
  fromStatusName: string | null
  toStatusName: string
  changedBy: string | null
  note: string | null
}

/** [수취단가확인] · [단가확정] 창 — 줄마다 그 단가, 머리 [유효기간]. 단가확정은 비어 있으면 수취단가로 시작한다. */
function PriceStepModal({ order, step, onClose, onSaved }: { order: PurchaseOrder; step: Step; onClose: () => void; onSaved: () => void }) {
  const [prices, setPrices] = useState<string[]>(() => order.lines.map((l) => {
    const v = step === 'received' ? (l.receivedPrice ?? l.unitPrice) : (l.confirmedPrice ?? l.receivedPrice ?? l.unitPrice)
    return v == null ? '' : String(Number(v))
  }))
  const [valid, setValid] = useState(order.priceValidUntil ?? '')
  const [error, setError] = useState('')
  async function save() {
    setError('')
    try {
      await api.patch(`/purchase-orders/${order.id}/price-steps`, {
        priceValidUntil: valid || null,
        lines: order.lines.map((l, i) => ({ lineId: l.id, [step === 'received' ? 'receivedPrice' : 'confirmedPrice']: prices[i] === '' ? null : Number(prices[i]) })),
      })
      onSaved()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  return (
    <Modal open title={STEP_LABEL[step]} width={720} onClose={onClose} error={error}>
      <div className="flex items-center gap-[6px] mb-[8px]">
        <span className="w-[93px] text-ec-label">유효기간</span>
        <input type="date" className="ec-input w-[145px]" value={valid} onChange={(e) => setValid(e.target.value)} />
      </div>
      <table className="w-full text-left">
        <thead><tr>
          <th>품목코드</th><th>품목명</th><th className="text-right">수량</th><th className="text-right">요청단가</th>
          {step === 'confirmed' && <th className="text-right">수취단가</th>}
          <th className="text-right w-[130px]">{step === 'received' ? '수취단가' : '확정단가'}</th>
        </tr></thead>
        <tbody>
          {order.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{l.itemCode}</td><td>{l.itemName}</td>
              <td className="text-right">{won(Number(l.quantity))}</td>
              <td className="text-right">{won(Number(l.unitPrice))}</td>
              {step === 'confirmed' && <td className="text-right">{l.receivedPrice == null ? '' : won(Number(l.receivedPrice))}</td>}
              <td><EcNumInput className="ec-input w-full text-right" value={prices[i]}
                              onValue={(v) => setPrices((p) => p.map((x, k) => (k === i ? v : x)))} /></td>
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
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span className="my-0 mx-[4px] text-ec-hint">~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
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
              <input type="date" className="ec-input" value={validFrom}
                     onChange={(e) => setValidFrom(e.target.value)} style={{ width: 145 }} />
              <span className="my-0 mx-[4px]">~</span>
              <input type="date" className="ec-input" value={validTo}
                     onChange={(e) => setValidTo(e.target.value)} style={{ width: 145 }} />
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
              <td className="text-right">{stepDone(r, 'received') ? won(stepAmount(r, 'received')) : ''}</td>
              <td className="text-right">{stepDone(r, 'confirmed') ? won(stepAmount(r, 'confirmed')) : ''}</td>
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
      {stepOpen && <PriceStepModal order={stepOpen.order} step={stepOpen.step} onClose={() => setStepOpen(null)}
                                   onSaved={() => { setStepOpen(null); void load() }} />}
    </EcListShell>
  )
}
