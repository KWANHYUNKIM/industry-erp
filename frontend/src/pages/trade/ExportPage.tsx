import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Currency, ExportOrder, ExportSummary, Item, Partner } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import EcPeriodPicks, { periodOf, EXPORT_PICKS } from '../../components/EcPeriodPicks'
import ExportSlipPickModal, { type PickedSlip } from '../../features/export/components/ExportSlipPickModal'
import ExportMappingModal, { type ExportMapping } from '../../features/export/components/ExportMappingModal'
import { requireSelection } from '../../components/EcDialog'
import { ecConfirm } from '../../components/EcDialog'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'

const fx = (n: number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })

/** 원본 목록 탭 — 전체 · 미확인 · 확인(2026-10-04 실측). */
const TABS = ['전체', '미확인', '확인'] as const
type Tab = (typeof TABS)[number]

interface LineForm {
  itemId: string; quantity: string; unit: string; unitPrice: string
  marks: string; description: string; netWeight: string; grossWeight: string; measurement: string
}
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unit: '', unitPrice: '', marks: '', description: '', netWeight: '', grossWeight: '', measurement: '' })

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/* 원본 C000652 는 [최근30일(+1개월)] 을 보고 열린다(2026-09-02 실측). */
const initP = periodOf('최근30일(+1개월)')!

/**
 * 재고 II &gt; 수출관리 &gt; <b>Invoice / Packing List</b>(C000652) — 2026-10-04 원본 실측.
 *
 * <p>목록: 탭 [전체 · 미확인 · 확인], 열 [Voucher Date · Customer · Item Name · Invoice No. · Invoice Date · Foreign Currency ·
 * Amount · Invoice · P/L], 아래 버튼 [신규(F2) · 진행상태변경 · 선택삭제 · Excel]. Voucher Date 는 '26/10/09-1'(그날 몇 번째),
 * Item Name 은 '첫 품목 외 n건', Foreign Currency 는 통화 이름(달러), Invoice · P/L 칸은 [인쇄].
 * 예전 우리는 [오더 → 통관진행 → 선적완료 → 입금완료] 단계와 요약 타일을 두었다 — 원본에 없어 화면에서 뺐다.
 *
 * <p>입력 창(Invoice/Packing List 입력): 일자 · 거래처 · Invoice 번호 · Invoice 일자 · L/C 번호 · L/C 일자 · L/C Issuing Bank ·
 * Shipper/Exporter · For Account &amp; Risk of Messrs · Notify Party · Port of Loading · Final destination · Carrier ·
 * Sailing on or about · 통화 · 중량단위 · Remarks, 품목 격자 [품목코드 · 품목명 · 수량 · 단위 · 단가 · 금액 · Mark&amp;Number of PKGS ·
 * Description of Goods · Net Weight · Gross Weight · Measurement]. Voucher Date 를 누르면 같은 창이 수정으로 열린다.
 */
/**
 * 원본이 품목명 뒤에 규격을 ' [규격]' 으로 붙인다(2026-10-20 실측: Cookie SET 수입과자 [20개입]). 규격이 없으면 이름만.
 * 규격은 <b>저장할 때 줄에 찍은 것</b>이다 — 원본 예전 전표(10/06 · 10/09)는 품목에 규격이 있어도 안 붙는다(10-29 데이터이관 B12).
 */
const withSpec = (name: string, spec?: string | null) => (spec ? `${name} [${spec}]` : name)

export default function ExportPage() {
  const [pFrom, setPFrom] = useState(initP.from)
  const [pTo, setPTo] = useState(initP.to)
  const [buyerCond, setBuyerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  /* 원본 조건 [기타] — [수정일자순(정렬)] 하나이고 꺼진 것이 기본이다(실측). */
  const [byUpdated, setByUpdated] = useState(false)
  const [summary, setSummary] = useState<ExportSummary | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [picked, setPicked] = useState<number[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** 입력 창 — null 이면 닫힘, 'new' 면 신규, 숫자면 그 전표 수정. */
  const [editing, setEditing] = useState<'new' | ExportOrder | null>(null)
  const [mappingOpen, setMappingOpen] = useState(false)
  /** 입력 창이 열릴 때 읽는 [매핑조회] — 거래처를 고르면 머리 칸을 채운다. */
  const [mappings, setMappings] = useState<ExportMapping[]>([])
  useEffect(() => {
    if (editing == null) return
    api.get<ExportMapping[]>('/exports/mappings').then((r) => setMappings(r.data)).catch(() => setMappings([]))
  }, [editing])

  function load() {
    setError('')
    api.get<ExportSummary>('/exports', { params: { from: pFrom || undefined, to: pTo || undefined } })
      .then((r) => { setSummary(r.data); setPicked([]) }).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => {
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'SUPPLIER'))).catch(() => {})
    api.get<Currency[]>('/currencies').then((r) => setCurrencies(r.data)).catch(() => {})
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
  }, [])
  /* 기간을 바꾸면 수출 목록만 다시 물어본다. */
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pFrom, pTo])

  const rows = summary?.exports ?? []
  /** Voucher Date 의 '-n' — 같은 일자 안에서 몇 번째 전표인가(먼저 만든 차례). */
  const seqOf = useMemo(() => {
    const m = new Map<number, number>()
    const byDate = new Map<string, ExportOrder[]>()
    for (const r of rows) byDate.set(r.voucherDate, [...(byDate.get(r.voucherDate) ?? []), r])
    for (const rs of byDate.values()) rs.sort((a, b) => a.id - b.id).forEach((r, i) => m.set(r.id, i + 1))
    return m
  }, [rows])
  const shown = useMemo(() => rows
    .filter((r) => tab === '전체' || r.confirmed === (tab === '확인'))
    .filter((r) => !buyerCond || r.buyerName === buyerCond)
    .filter((r) => !itemCond || r.lines.some((l) => l.itemName === itemCond))
    .slice()
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      : b.voucherDate.localeCompare(a.voucherDate) || (seqOf.get(b.id) ?? 0) - (seqOf.get(a.id) ?? 0))),
  [rows, tab, buyerCond, itemCond, byUpdated, seqOf])
  const buyerNames = useMemo(() => [...new Set(rows.map((r) => r.buyerName))].sort(), [rows])
  const itemNames = useMemo(() => [...new Set(rows.flatMap((r) => r.lines.map((l) => l.itemName)))].sort(), [rows])
  const currencyName = (id: number) => currencies.find((c) => c.id === id)?.name ?? ''
  const voucherText = (r: ExportOrder) => `${r.voucherDate.slice(2).replace(/-/g, '/')}-${seqOf.get(r.id) ?? ''}`

  /** 원본 [진행상태변경] — 고른 전표를 미확인 ↔ 확인. */
  async function toggleConfirm() {
    if (picked.length === 0) { setError('선택된 자료가 없습니다.'); return }
    try {
      for (const id of picked) {
        const r = rows.find((x) => x.id === id)!
        await api.patch(`/exports/${id}/confirm`, { confirmed: !r.confirmed })
      }
      setNotice('진행상태를 바꿨습니다.'); load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function removePicked() {
    if (picked.length === 0) { setError('선택된 자료가 없습니다.'); return }
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?') /* 원본 선택삭제 확인 글(2026-10-20 C000652 실측) */)) return
    try {
      for (const id of picked) await api.delete(`/exports/${id}`)
      setNotice('삭제되었습니다.'); load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  /** Commercial Invoice / Packing List 인쇄. 입력 창의 머리 칸을 그대로 싣는다. */
  function print(e: ExportOrder, kind: 'INVOICE' | 'PACKING', opened?: Window | null) {
    /* [저장/Invoice(F7)] 는 저장 전에, 누른 순간 창을 열어 둔다 — 저장이 끝난 뒤 열면 팝업 차단에 걸린다. */
    const win = opened ?? window.open('', '_blank', 'width=1024,height=768')
    if (!win) return setError('팝업이 차단되었습니다.')
    const money = kind === 'INVOICE'
    const head = money
      ? '<th>Mark&amp;Number of PKGS</th><th>Description of Goods</th><th class="r">Q\'ty</th><th class="r">Unit Price</th><th class="r">Amount</th>'
      : '<th>Mark&amp;Number of PKGS</th><th>Description of Goods</th><th class="r">Q\'ty</th><th class="r">Net Weight</th><th class="r">Gross Weight</th><th class="r">Measurement</th>'
    const body = e.lines.map((l) => money
      ? `<tr><td>${esc(l.marks)}</td><td>${esc(l.description || l.itemName)}</td><td class="r">${fx(l.quantity)} ${esc(l.unit)}</td><td class="r">${fx(l.unitPrice)}</td><td class="r">${fx(l.amount)}</td></tr>`
      : `<tr><td>${esc(l.marks)}</td><td>${esc(l.description || l.itemName)}</td><td class="r">${fx(l.quantity)} ${esc(l.unit)}</td><td class="r">${l.netWeight ?? ''} ${esc(e.weightUnit)}</td><td class="r">${l.grossWeight ?? ''} ${esc(e.weightUnit)}</td><td class="r">${l.measurement ?? ''}</td></tr>`,
    ).join('')
    win.document.write(`<!doctype html><meta charset="utf-8"><title>${money ? 'Commercial Invoice' : 'Packing List'} ${esc(e.invoiceNo)}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px}h1{font-size:20px;text-align:center}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}th,td{border:1px solid #999;padding:6px 8px;text-align:left}.r{text-align:right}</style>
      <h1>${money ? 'COMMERCIAL INVOICE' : 'PACKING LIST'}</h1>
      <table>
        <tr><th>Shipper/Exporter</th><td>${esc(e.shipper)}</td><th>No. &amp; date of invoice</th><td>${esc(e.invoiceNo)} / ${esc(e.invoiceDate)}</td></tr>
        <tr><th>For account &amp; risk of Messrs.</th><td>${esc(e.messrs || e.buyerName)}</td><th>No. &amp; date of L/C</th><td>${esc(e.lcNo)} ${esc(e.lcDate)}</td></tr>
        <tr><th>Notify party</th><td>${esc(e.notifyParty)}</td><th>L/C issuing bank</th><td>${esc(e.lcBank)}</td></tr>
        <tr><th>Port of loading</th><td>${esc(e.portOfLoading)}</td><th>Final destination</th><td>${esc(e.destination)}</td></tr>
        <tr><th>Carrier</th><td>${esc(e.carrier)}</td><th>Sailing on or about</th><td>${esc(e.sailingDate)}</td></tr>
        <tr><th>Remarks</th><td colspan="3">${esc(e.remark)}</td></tr>
      </table>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      ${money ? `<p><b>Total: ${esc(e.currencyCode ?? 'KRW')} ${fx(e.foreignAmount)}</b></p>` : ''}
      <script>window.onload=()=>window.print()<\/script>`)
    win.document.close()
  }

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'Invoice / Packing List', [shown.length])

  return (
    /* 원본 화면 이름 그대로 — 재고 II > 수출관리 의 화면 제목은 [Invoice / Packing List] 다(2026-09-02 실측). */
    <EcListShell title="Invoice / Packing List" actions={[{ label: 'Excel' }]}>
      {/*
        원본 조건 차례: <b>[기준일자]</b> · Invoice 일자 · 거래처 · 품목 · 최종수정자 · 기타 · 발송여부.
        [최종수정자]는 우리 수출에 updated_by 가 없어, [발송여부]는 보낸 기록 자체가 없어 못 만든다.
      */}
      <div className="flex flex-wrap items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label">
        <span>기준일자</span>
        <EcDateRange from={{ className: "ec-input w-[140px]", value: pFrom, onChange: (e) => setPFrom(e.target.value) }} to={{ className: "ec-input w-[140px]", value: pTo, onChange: (e) => setPTo(e.target.value) }} />
        <EcPeriodPicks labels={EXPORT_PICKS} currentFrom={pFrom} onPick={(r) => { setPFrom(r.from); setPTo(r.to) }} />
        <span className="ml-[6px]">거래처</span>
        <select className="ec-input w-[160px]" value={buyerCond} onChange={(e) => setBuyerCond(e.target.value)}>
          <option value="">전체</option>
          {buyerNames.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <span className="ml-[6px]">품목</span>
        <select className="ec-input w-[180px]" value={itemCond} onChange={(e) => setItemCond(e.target.value)}>
          <option value="">전체</option>
          {itemNames.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <span className="ml-[6px]">기타</span>
        <label className="inline-flex items-center gap-[3px]">
          <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
        </label>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <p className="ec-alert ec-alert-success mb-[8px]">{notice}</p>}

      <div className="ec-pills mb-[6px]">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`ec-pill no-ec${tab === t ? ' active' : ''}`}>{t}</button>
        ))}
      </div>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((r) => picked.includes(r.id))}
                     onChange={(e) => setPicked(e.target.checked ? shown.map((r) => r.id) : [])} />
            </th>
            <th className="text-center">Voucher Date</th>
            <th>Customer</th>
            <th>Item Name</th>
            <th>Invoice No.</th>
            <th className="text-center">Invoice Date</th>
            <th>Foreign Currency</th>
            <th className="text-right">Amount</th>
            <th className="text-center">Invoice</th>
            <th className="text-center">P/L</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((e) => (
            <tr key={e.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${voucherText(e)} 선택`} checked={picked.includes(e.id)}
                       onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
              </td>
              <td className="text-center">
                <button type="button" className="ec-link" onClick={() => setEditing(e)}>{voucherText(e)}</button>
              </td>
              <td>{e.buyerName}</td>
              <td>{e.lines[0] ? withSpec(e.lines[0].itemName, e.lines[0].spec) : ''}{e.lines.length > 1 ? ` 외 ${e.lines.length - 1}건` : ''}</td>
              <td>{e.invoiceNo}</td>
              <td className="text-center">{e.invoiceDate.replace(/-/g, '/')}</td>
              <td>{e.currencyId == null ? '' : currencyName(e.currencyId) || e.currencyCode}</td>
              <td className="text-right">{fx(e.foreignAmount)}</td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => print(e, 'INVOICE')}>인쇄</button></td>
              <td className="text-center"><button type="button" className="ec-link" onClick={() => print(e, 'PACKING')}>인쇄</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* 원본 아래 버튼줄 — 신규(F2) · 진행상태변경 · 선택삭제 · 매핑조회 · Excel. Email · 보내기는 바깥으로 보내는 일이라 두지 않는다. */}
      <div className="flex flex-wrap gap-[6px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => setEditing('new')}>신규(F2)</button>
        {/* 고른 줄 버튼은 잠그지 않는다 — 0 줄이면 원본 알림을 띄운다(CLAUDE.md 10.1). */}
        <button type="button" className="ec-btn" onClick={() => { if (requireSelection(picked.length)) void toggleConfirm() }}>진행상태변경</button>
        <button type="button" className="ec-btn" onClick={() => { if (requireSelection(picked.length)) void removePicked() }}>선택삭제</button>
        <button type="button" className="ec-btn" onClick={() => setMappingOpen(true)}>매핑조회</button>
      </div>
      <ExportMappingModal open={mappingOpen} onClose={() => setMappingOpen(false)} />

      <Modal error={error} open={editing != null} title="Invoice/Packing List 입력" width={1100} onClose={() => setEditing(null)}>{(
        editing != null && (
          <ExportForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            partners={partners} currencies={currencies} items={items} mappings={mappings}
            onClose={() => setEditing(null)}
            onSaved={(r, isNew, printWin) => {
              setEditing(null); setNotice(`${isNew ? '저장' : '수정'}되었습니다.`); load()
              if (printWin) print(r, 'INVOICE', printWin)
            }}
          />
        )
      )}</Modal>
    </EcListShell>
  )
}

function ExportForm({ initial, partners, currencies, items, mappings, onClose, onSaved }: {
  initial: ExportOrder | null
  partners: Partner[]
  currencies: Currency[]
  items: Item[]
  mappings: ExportMapping[]
  onClose: () => void
  onSaved: (r: ExportOrder, isNew: boolean, printWin?: Window | null) => void
}) {
  const s = (v: string | null | undefined) => v ?? ''

  const initHead = () => ({
    voucherDate: initial?.voucherDate ?? todayYmd(), partnerId: initial ? String(initial.partnerId) : '',
    invoiceNo: s(initial?.invoiceNo), invoiceDate: initial?.invoiceDate ?? todayYmd(),
    lcNo: s(initial?.lcNo), lcDate: s(initial?.lcDate), lcBank: s(initial?.lcBank),
    shipper: s(initial?.shipper), messrs: s(initial?.messrs), notifyParty: s(initial?.notifyParty),
    portOfLoading: s(initial?.portOfLoading), destination: s(initial?.destination), carrier: s(initial?.carrier),
    sailingDate: s(initial?.sailingDate), currencyId: initial?.currencyId != null ? String(initial.currencyId) : '', weightUnit: s(initial?.weightUnit),
    remark: s(initial?.remark),
  })
  const initLines = (): LineForm[] => (initial?.lines.length
    ? initial.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity), unit: s(l.unit), unitPrice: String(l.unitPrice),
      marks: s(l.marks), description: s(l.description), netWeight: l.netWeight == null ? '' : String(l.netWeight),
      grossWeight: l.grossWeight == null ? '' : String(l.grossWeight), measurement: l.measurement == null ? '' : String(l.measurement) }))
    : [emptyLine(), emptyLine(), emptyLine()])
  const [h, setH] = useState(initHead)
  const [lines, setLines] = useState<LineForm[]>(initLines)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<typeof h>) => setH((v) => ({ ...v, ...patch }))
  /**
   * 거래처를 고르면 그 거래처의 [매핑조회] 줄로 머리 칸을 채운다(2026-10-12 원본 실측 — Bisket World 를 고르자
   * L/C Issuing Bank · Shipper · Messrs · Notify Party · Port of Loading · Final destination · Carrier · Remarks 가 찼다).
   */
  function pickPartner(partnerId: string) {
    const m = mappings.find((x) => String(x.partnerId) === partnerId)
    /* 통화(2026-10-21 원본 실측): 외화거래처(Bisket World · The Sweet Ecount)를 고르면 달러 [100], 내자 거래처((주)삼성)는 내자. 매핑 칸은 매핑이 있는 거래처만 찬다. */
    const fx = partners.find((x) => String(x.id) === partnerId)?.foreignCurrency
    const cur = !initial ? { currencyId: fx ? String((currencies.find((c) => c.name.includes('달러')) ?? currencies[0])?.id ?? '') : '' } : {}
    set(m && !initial ? {
      ...cur, partnerId, lcBank: s(m.lcBank), shipper: s(m.shipper), messrs: s(m.messrs), notifyParty: s(m.notifyParty),
      portOfLoading: s(m.portOfLoading), destination: s(m.destination), carrier: s(m.carrier), weightUnit: s(m.weightUnit), remark: s(m.remark),
    } : { partnerId, ...cur })
  }
  /** 툴바 [판매] · [주문] 으로 띄운 검색창. */
  const [pick, setPick] = useState<'sales' | 'order' | null>(null)
  /* 원본은 전표를 불러오면 툴바에서 [판매] · [주문] · [전표 바코드] · [전표불러오기] 가 사라진다(실측). */
  const [loaded, setLoaded] = useState(false)
  function applySlip(slip: PickedSlip) {
    if (!h.partnerId && slip.partnerId) pickPartner(String(slip.partnerId))
    const filled: LineForm[] = slip.lines.map((l) => ({
      ...emptyLine(), itemId: String(l.itemId), quantity: String(l.quantity), unit: l.unit ?? '', unitPrice: String(l.unitPrice),
    }))
    setLines((ls) => [...ls.filter((l) => l.itemId), ...filled])
    setLoaded(true); setPick(null)
  }
  /** 원본 [다시 작성] — 칸을 처음 상태로. 수정 창이면 그 전표 값으로 되돌린다. */
  function reset() {
    setError(''); setLoaded(false); setH(initHead()); setLines(initLines())
  }
  const setLine = (i: number, patch: Partial<LineForm>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const amount = (l: LineForm) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)
  const itemOf = (id: string) => items.find((it) => String(it.id) === id)

  async function save(withInvoice = false) {
    setError('')
    const printWin = withInvoice ? window.open('', '_blank', 'width=1024,height=768') : null
    const fail = (msg: string) => { printWin?.close(); setError(msg) }
    if (!h.partnerId) return fail('거래처를 선택하세요.')
    const payload = lines.filter((l) => l.itemId).map((l) => ({
      itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), unit: l.unit || null,
      marks: l.marks || null, description: l.description || null,
      netWeight: l.netWeight === '' ? null : Number(l.netWeight), grossWeight: l.grossWeight === '' ? null : Number(l.grossWeight),
      measurement: l.measurement === '' ? null : Number(l.measurement),
    }))
    if (payload.length === 0) return fail('품목을 1개 이상 입력하세요.')
    const body = {
      ...h, partnerId: Number(h.partnerId), currencyId: h.currencyId ? Number(h.currencyId) : null,
      invoiceNo: h.invoiceNo || null, lcDate: h.lcDate || null, sailingDate: h.sailingDate || null, lines: payload,
    }
    setSaving(true)
    try {
      const res = initial ? await api.put<ExportOrder>(`/exports/${initial.id}`, body) : await api.post<ExportOrder>('/exports', body)
      onSaved(res.data, !initial, printWin)
    } catch (err) {
      fail(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'Invoice/Packing List 입력', [lines.length])
  const text = (k: keyof typeof h, label: string, multi = false) => (
    <label className="flex items-start gap-[8px]">
      <span className="w-[150px] shrink-0 text-ec-label pt-[4px]">{label}</span>
      {multi
        ? <textarea className="ec-input w-full h-[46px]" aria-label={label} placeholder={label} value={h[k]} onChange={(e) => set({ [k]: e.target.value })} />
        : <input className="ec-input w-full" aria-label={label} placeholder={label} value={h[k]} onChange={(e) => set({ [k]: e.target.value })} />}
    </label>
  )
  const date = (k: keyof typeof h, label: string) => (
    <label className="flex items-center gap-[8px]">
      <span className="w-[150px] shrink-0 text-ec-label">{label}</span>
      <EcDateInput className="ec-input w-[150px]" aria-label={label} value={h[k]} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  )

  return (
    <div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="ec-form grid grid-cols-2 mobile:grid-cols-1 gap-x-[16px] gap-y-[6px] mb-[10px]">
        {date('voucherDate', '일자')}
        <label className="flex items-center gap-[8px]">
          <span className="w-[150px] shrink-0 text-ec-label">거래처</span>
          <CodePickerField label="거래처" hideLabel width={240} emptyLabel="선택 안 함" placeholder="거래처"
                           value={h.partnerId} onChange={pickPartner} items={partnerCodeItems(partners)} />
        </label>
        {text('invoiceNo', 'Invoice 번호')}
        {date('invoiceDate', 'Invoice 일자')}
        {text('lcNo', 'L/C 번호')}
        {date('lcDate', 'L/C 일자')}
        {text('lcBank', 'L/C Issuing Bank', true)}
        {text('shipper', 'Shipper/Exporter', true)}
        {text('messrs', 'For Account & Risk of Messrs', true)}
        {text('notifyParty', 'Notify Party', true)}
        {text('portOfLoading', 'Port of Loading')}
        {text('destination', 'Final destination')}
        {text('carrier', 'Carrier')}
        {date('sailingDate', 'Sailing on or about')}
        <label className="flex items-center gap-[8px]">
          <span className="w-[150px] shrink-0 text-ec-label">통화</span>
          <select className="ec-input w-full" aria-label="통화" value={h.currencyId} onChange={(e) => set({ currencyId: e.target.value })}>
            {/* 원본 [통화] 의 기본은 '내자'(원화)다(2026-10-12 실측). 통화 마스터에는 외화만 있어 내자는 빈 값이다 — 예전 우리는 '통화 선택' 빈칸으로 열고 고르기 전에는 저장을 막았다. */}
            <option value="">내자</option>
            {currencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {text('weightUnit', '중량단위')}
      </div>
      <div className="mb-[10px]">{text('remark', 'Remarks', true)}</div>

      {/* 원본 격자 위 툴바 — 찾기(F3) · 정렬 · My품목 · 판매 · 주문 · 바코드 · 전표 바코드 · 전표불러오기. 우리는 판매 · 주문만 둔다. */}
      {!loaded && (
        <div className="flex gap-[4px] mb-[4px]">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setPick('sales')}>판매</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setPick('order')}>주문</button>
        </div>
      )}
      <ExportSlipPickModal kind={pick} partnerId={h.partnerId ? Number(h.partnerId) : null} onClose={() => setPick(null)} onApply={applySlip} />
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full min-w-[1300px] table-fixed text-left">
          <thead>
            <tr>
              <th className="w-[30px]"></th>
              <th className="w-[200px]">품목코드</th>
              <th className="w-[160px]">품목명</th>
              <th className="text-right w-[70px]">수량</th>
              <th className="w-[60px]">단위</th>
              <th className="text-right w-[90px]">단가</th>
              <th className="text-right w-[100px]">금액</th>
              <th>Mark&amp;Number of PKGS</th>
              <th>Description of Goods</th>
              <th className="text-right w-[70px]">Net Weight</th>
              <th className="text-right w-[70px]">Gross Weight</th>
              <th className="text-right w-[70px]">Measurement</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  <CodePickerField label="품목" hideLabel fill showCode placeholder="품목코드" emptyLabel="선택 해제" value={l.itemId}
                                   onChange={(v) => setLine(i, { itemId: v, unit: l.unit || itemOf(v)?.unit || '' })}
                                   items={items.filter((it) => it.active !== false).map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))} />
                </td>
                <td className="truncate" title={itemOf(l.itemId)?.name ?? ''}>{itemOf(l.itemId)?.name ?? ''}</td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}행 수량`} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                <td><input className="ec-input w-full" aria-label={`${i + 1}행 단위`} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}행 단가`} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                <td className="text-right">{l.itemId ? fx(amount(l)) : ''}</td>
                <td><input className="ec-input w-full" aria-label={`${i + 1}행 Mark`} value={l.marks} onChange={(e) => setLine(i, { marks: e.target.value })} /></td>
                <td><input className="ec-input w-full" aria-label={`${i + 1}행 Description`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}행 Net Weight`} value={l.netWeight} onChange={(e) => setLine(i, { netWeight: e.target.value })} /></td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}행 Gross Weight`} value={l.grossWeight} onChange={(e) => setLine(i, { grossWeight: e.target.value })} /></td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}행 Measurement`} value={l.measurement} onChange={(e) => setLine(i, { measurement: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ec-total">
              <td colSpan={6}></td>
              <td className="text-right">{fx(lines.reduce((n, l) => n + amount(l), 0))}</td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" className="ec-btn mt-[6px]" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ 행 추가</button>
      <div className="flex gap-[6px] mt-[10px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()} disabled={saving}>저장(F8)</button>
        {/* 원본 [저장/Invoice(F7)] — 저장하고 그 전표의 Commercial Invoice 를 띄운다. */}
        <button type="button" className="ec-btn" onClick={() => void save(true)} disabled={saving}>저장/Invoice(F7)</button>
        <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
