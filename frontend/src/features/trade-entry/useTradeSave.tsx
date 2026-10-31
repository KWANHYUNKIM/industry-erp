import { roundWon, lineSupply } from '../../utils/lineSupply'
import { fmtNumber, parseNumPlain } from '../../utils/format'
import { todayYmd } from '../../utils/periods'
import { useRef, useEffect, type FormEvent, type RefObject, type Dispatch, type SetStateAction } from 'react'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import type { SalesDoc, PurchaseDoc, Partner, CustomFieldDef, Item, StockRow } from '../../types/api'
import { api, extractErrorMessage } from '../../api/client'
import { findDataTable } from '../../utils/tableExport'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable, openPrintWindow } from '../../utils/print'
import { loadSupplierParty, printDocuments } from '../../utils/printDocument'
import { salesSlipDocument, purchaseSlipDocument } from '../../utils/tradeSlipDocument'
import type { SlipAction } from '../../components/EcSlipShell'
import { type LineInput, overriddenSupply, splitDiscount, emptyLine, emptyLines, SLIP_PRINT_AFTER_SAVE, KEEP_AFTER_SAVE, type Mode, type TradeEntryPopup, type TradeEntryCfg } from './tradeEntryConfig'
import type { NavigateFunction, SetURLSearchParams } from 'react-router-dom'

/** 합계 · 이익계산 · 반올림 · 임시저장 · 저장 · 인쇄 · 아래 줄 단추 — TradeEntry 에서 몸통 그대로 옮겼다(같은 자리에서 부른다). */
export function useTradeSave({ addItemLine, adjustRate, adjustRound, adjustTarget, adjustUnit, anyPartner, anyPartnerName, barcode, cashBanks, cashDepts, cashForm, cfg, checkedIdx, copiedRef, currencyCode, customDefs, customValues, date, dateChangedRef, discountTotal, docs, docsAsked, editing, employeeId, ensureDocs, exchangeRate, extraCostAmt, flash, foreign, fromReleaseId, gridRef, hdKey, isAdjust, itemById, items, lineDefs, lines, loadDocs, memKey, mode, navigate, partnerId, partners, popup, priceChangeTo, projectId, qtyStep, releaseIds, remark, rememberedEmpRef, savedDoc, setBarcode, setCashBanks, setCashDepts, setCashForm, setCashMsg, setCashOpen, setCurrencyCode, setCustomValues, setDate, setDiscountTotal, setEditing, setEmployeeId, setError, setExchangeRate, setForeign, setHasTemp, setLines, setPartnerId, setProjectId, setQtyErr, setRemark, setSavedAt, setSavedDoc, setSearchParams, setSlipHistory, setTaxable, setVerifyResult, setWarehouseId, stockWhOf, stocks, submitting, targetIdx, taxable, tempKey, unitCostOf, vatBySlip, warehouseId, whKey }: {
  addItemLine: (itemId: string, qty?: number) => boolean
  adjustRate: string
  adjustRound: "round" | "floor" | "ceil"
  adjustTarget: "price" | "amount"
  adjustUnit: "pct" | "won"
  anyPartner: boolean
  anyPartnerName: string
  barcode: string
  cashBanks: { id: number; code: string | null; name: string | null; bankName: string; accountNo: string | null; active: boolean; }[]
  cashDepts: { id: number; code: string | null; name: string; }[]
  cashForm: { date: string; departmentId: string; projectId: string; method: string; amount: string; fee: string; note: string; }
  cfg: TradeEntryCfg
  checkedIdx: number[]
  copiedRef: RefObject<boolean>
  currencyCode: string
  customDefs: CustomFieldDef[]
  customValues: Record<string, string>
  date: string
  dateChangedRef: RefObject<boolean>
  discountTotal: number
  docs: (SalesDoc | PurchaseDoc)[]
  docsAsked: RefObject<boolean>
  editing: { id: number; docNo: string; } | null
  employeeId: string
  ensureDocs: () => void
  exchangeRate: string
  extraCostAmt: string
  flash: (msg: string) => void
  foreign: boolean
  fromReleaseId: string | null
  gridRef: RefObject<HTMLDivElement | null>
  hdKey: string
  isAdjust: boolean
  itemById: Map<string, Item>
  items: Item[]
  lineDefs: CustomFieldDef[]
  lines: LineInput[]
  loadDocs: () => Promise<void>
  memKey: string
  mode: Mode
  navigate: NavigateFunction
  partnerId: string
  partners: Partner[]
  popup: TradeEntryPopup | undefined
  priceChangeTo: string
  projectId: string
  qtyStep: string
  releaseIds: string[]
  remark: string
  rememberedEmpRef: RefObject<string>
  savedDoc: { id: number; docNo: string; } | null
  setBarcode: Dispatch<SetStateAction<string>>
  setCashBanks: Dispatch<SetStateAction<{ id: number; code: string | null; name: string | null; bankName: string; accountNo: string | null; active: boolean; }[]>>
  setCashDepts: Dispatch<SetStateAction<{ id: number; code: string | null; name: string; }[]>>
  setCashForm: Dispatch<SetStateAction<{ date: string; departmentId: string; projectId: string; method: string; amount: string; fee: string; note: string; }>>
  setCashMsg: Dispatch<SetStateAction<string>>
  setCashOpen: Dispatch<SetStateAction<boolean>>
  setCurrencyCode: Dispatch<SetStateAction<string>>
  setCustomValues: Dispatch<SetStateAction<Record<string, string>>>
  setDate: Dispatch<SetStateAction<string>>
  setDiscountTotal: Dispatch<SetStateAction<number>>
  setEditing: Dispatch<SetStateAction<{ id: number; docNo: string; } | null>>
  setEmployeeId: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string>>
  setExchangeRate: Dispatch<SetStateAction<string>>
  setForeign: Dispatch<SetStateAction<boolean>>
  setHasTemp: Dispatch<SetStateAction<boolean>>
  setLines: Dispatch<SetStateAction<LineInput[]>>
  setPartnerId: Dispatch<SetStateAction<string>>
  setProjectId: Dispatch<SetStateAction<string>>
  setQtyErr: Dispatch<SetStateAction<number | null>>
  setRemark: Dispatch<SetStateAction<string>>
  setSavedAt: Dispatch<SetStateAction<string>>
  setSavedDoc: Dispatch<SetStateAction<{ id: number; docNo: string; } | null>>
  setSearchParams: SetURLSearchParams
  setSlipHistory: Dispatch<SetStateAction<"H" | "last" | null>>
  setTaxable: Dispatch<SetStateAction<boolean>>
  setVerifyResult: Dispatch<SetStateAction<string[] | null>>
  setWarehouseId: Dispatch<SetStateAction<string>>
  stockWhOf: (itemId: string) => number
  stocks: StockRow[]
  submitting: { busy: boolean; run: <R>(fn: () => Promise<R>) => Promise<R | undefined>; wrap: (fn: (e: FormEvent<HTMLFormElement>) => Promise<unknown>) => (e: FormEvent<HTMLFormElement>) => void; isBusy: () => boolean; }
  targetIdx: () => number[]
  taxable: boolean
  tempKey: string
  unitCostOf: (itemId: string) => number | null
  vatBySlip: boolean
  warehouseId: string
  whKey: string
}) {
  const fx = mode === 'purchase' && foreign
  const lineRateOf = (l: LineInput) => (parseNumPlain(l.lineRate) > 0 ? parseNumPlain(l.lineRate) : parseNumPlain(exchangeRate))
  const fxAmountOf = (l: LineInput) => parseNumPlain(l.quantity) * parseNumPlain(l.unitPrice)
  const computed = (() => {
    const supplies = lines.map((l) => (fx
      ? roundWon(fxAmountOf(l) * lineRateOf(l))
      : overriddenSupply(l) ?? lineSupply(parseNumPlain(l.quantity), parseNumPlain(l.unitPrice))))
    const vats = supplies.map((sup) => (taxable && !fx ? roundWon(sup * 0.1) : 0))
    // 손으로 고친 부가세는 거래별 배분보다 먼저다 — 서버도 배분한 뒤 그 줄만 덮어쓴다.
    const typedVat = lines.map((l, i) => (taxable && !fx && l.vatOverride !== '' && l.vatBase === String(supplies[i]) ? roundWon(parseNumPlain(l.vatOverride)) : null))
    if (taxable && !fx && vatBySlip && supplies.length > 0) {
      const slipVat = roundWon(supplies.reduce((a, b) => a + b, 0) * 0.1)
      const residual = slipVat - vats.reduce((a, b) => a + b, 0)
      if (residual !== 0) {
        // 잔차는 공급가액이 가장 큰 한 줄에 몰아준다(백엔드와 동일 — 재저장해도 배분이 안 흔들린다).
        let big = 0
        supplies.forEach((sup, i) => { if (sup > supplies[big]) big = i })
        vats[big] += residual
      }
    }
    typedVat.forEach((v, i) => { if (v != null) vats[i] = v })
    return supplies.map((supply, i) => ({ supply, vat: vats[i], total: supply + vats[i], typedVat: typedVat[i] }))
  })()
  const totals = {
    qty: lines.reduce((s, l) => s + parseNumPlain(l.quantity), 0),
    supply: computed.reduce((s, c) => s + c.supply, 0),
    vat: computed.reduce((s, c) => s + c.vat, 0),
    extra: lines.reduce((s, l) => s + parseNumPlain(l.extraCost), 0),
    foreign: lines.reduce((s, l) => s + (l.itemId ? fxAmountOf(l) : 0), 0),
    total: computed.reduce((s, c) => s + c.total, 0),
  }
  /** 합계행의 전표 합계 칸 — 합계 열이 켜져 있으면 그 아래, 아니면 적요 칸 자리에 선다. */
  const totalTd = <td style={{ textAlign: 'right', color: cfg.accent }}>{fmtNumber(totals.total)}</td>
  /** 금액조정 할인을 나눈 값과 조정 후 합계(판매입력 II). 판매입력(I)에서는 늘 0 이라 net = totals. */
  const discount = splitDiscount(isAdjust ? discountTotal : 0, taxable)
  const net = { supply: totals.supply - discount.supply, vat: totals.vat - discount.vat, total: totals.total - discount.total }
  /** 명세 각 줄의 매출·원가·이익. 원가 미등록이면 cost 가 null 이고 합계에서 뺀다. */
  const profitRows = lines
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => l.itemId)
    .map(({ l, idx }) => {
      const unitCost = unitCostOf(l.itemId)
      const qty = parseNumPlain(l.quantity)
      const revenue = computed[idx].supply
      const cost = unitCost === null ? null : unitCost * qty
      return {
        name: l.name ?? itemById.get(l.itemId)?.name ?? '',
        code: itemById.get(l.itemId)?.code ?? '',
        qty,
        unitPrice: parseNumPlain(l.unitPrice),
        revenue,
        unitCost,
        cost,
        profit: cost === null ? null : revenue - cost,
        rate: cost === null || revenue === 0 ? null : ((revenue - cost) / revenue) * 100,
      }
    })
  const profitTotals = profitRows.reduce(
    (a, r) => (r.cost === null ? { ...a, missing: a.missing + 1 }
      : { revenue: a.revenue + r.revenue, cost: a.cost + r.cost, missing: a.missing }),
    { revenue: 0, cost: 0, missing: 0 },
  )

  const lineCount = lines.filter((l) => l.itemId).length
  const rate = parseNumPlain(exchangeRate)

  // ── 툴바 동작 ─────────────────────────────────────────
  const rounder = (n: number) =>
    adjustRound === 'floor' ? Math.floor(n) : adjustRound === 'ceil' ? Math.ceil(n) : Math.round(n)

  function applyAdjust() {
    const v = parseNumPlain(adjustRate)
    if (!v) return flash('조정 값을 입력하세요.')
    const idxs = targetIdx()
    setLines((ls) => ls.map((l, i) => {
      if (!idxs.includes(i)) return l
      if (adjustTarget === 'price') {
        const base = parseNumPlain(l.unitPrice)
        const next = adjustUnit === 'pct' ? base * (1 + v / 100) : base + v
        return { ...l, unitPrice: String(rounder(next)) }
      }
      // 금액 조정 — 수량을 고정하고 단가를 역산한다(금액 컬럼은 계산값이라 직접 못 고친다)
      const qty = parseNumPlain(l.quantity) || 1
      const base = qty * parseNumPlain(l.unitPrice)
      const nextAmt = adjustUnit === 'pct' ? base * (1 + v / 100) : base + v
      return { ...l, unitPrice: String(rounder(nextAmt / qty)) }
    }))
    flash(`${idxs.length}개 행에 조정을 적용했습니다.`)
  }

  function applyPriceChange() {
    const v = parseNumPlain(priceChangeTo)
    if (!v) return flash('변경할 단가를 입력하세요.')
    const idxs = targetIdx()
    setLines((ls) => ls.map((l, i) => (idxs.includes(i) ? { ...l, unitPrice: String(v) } : l)))
    flash(`${idxs.length}개 행의 단가를 ${fmtNumber(v)}원으로 바꿨습니다.`)
  }

  /** 부대비용 총액을 공급가액 비율로 라인에 배분한다 — 원본 [부대비용] 적용과 같은 방식. */
  function applyExtraCost() {
    const amt = parseNumPlain(extraCostAmt)
    const idxs = targetIdx()
    if (idxs.length === 0) return flash('품목을 먼저 입력하세요.')
    const base = idxs.reduce((s, i) => s + computed[i].supply, 0)
    setLines((ls) => ls.map((l, i) => {
      if (!idxs.includes(i)) return l
      const share = base > 0 ? (computed[i].supply / base) * amt : amt / idxs.length
      return { ...l, extraCost: String(Math.round(share)) }
    }))
    flash(`부대비용 ${fmtNumber(amt)}원을 공급가액 비율로 배분했습니다.`)
  }

  function applyQtyStep() {
    const v = parseNumPlain(qtyStep)
    if (!v) return flash('증감할 수량을 입력하세요.')
    const idxs = targetIdx()
    setLines((ls) => ls.map((l, i) => (idxs.includes(i) ? { ...l, quantity: String(Math.max(0, parseNumPlain(l.quantity) + v)) } : l)))
    flash(`${idxs.length}개 행 수량을 ${v > 0 ? '+' : ''}${v} 했습니다.`)
  }

  function deleteChecked() {
    if (checkedIdx.length === 0) return flash('삭제할 행을 체크하세요.')
    setLines((ls) => {
      const kept = ls.filter((l, i) => !(l.checked && l.itemId) || !checkedIdx.includes(i))
      return kept.length >= 3 ? kept : [...kept, ...Array(3 - kept.length).fill(null).map(emptyLine)]
    })
    flash(`${checkedIdx.length}개 행을 지웠습니다.`)
  }

  function sortLines() {
    setLines((ls) => {
      const filled = ls.filter((l) => l.itemId)
      const blanks = ls.filter((l) => !l.itemId)
      filled.sort((a, b) => (itemById.get(a.itemId)?.code ?? '').localeCompare(itemById.get(b.itemId)?.code ?? ''))
      return [...filled, ...blanks]
    })
    flash('품목코드 순으로 정렬했습니다.')
  }

  function scanBarcode() {
    const q = barcode.trim()
    if (!q) return
    const hit = items.find((i) => i.barcode === q) ?? items.find((i) => i.code.toLowerCase() === q.toLowerCase())
    if (!hit) { flash(`'${q}' 에 해당하는 품목이 없습니다.`); return }
    addItemLine(String(hit.id))
    setBarcode('')
    flash(`${hit.name} 1개를 담았습니다.`)
  }

  /** 원본 [검증] — 저장 전에 걸릴 것을 미리 모아 보여 준다. */
  function verify() {
    const msgs: string[] = []
    // 원본 판매 · 구매입력 모두 거래처를 비운 채 저장된다.
    if (!warehouseId) msgs.push(`${cfg.whLabel}를 선택하세요.`)
    if (foreign && rate <= 0) msgs.push('외자 전표는 환율을 입력해야 합니다.')
    if (fx && !currencyCode) msgs.push('외자 전표는 외화(통화)를 선택해야 합니다.')
    lines.forEach((l, i) => {
      if (!l.itemId) return
      if (parseNumPlain(l.quantity) === 0) msgs.push(`${i + 1}행: 수량이 0입니다.`)
      if (parseNumPlain(l.unitPrice) <= 0) msgs.push(`${i + 1}행: 단가가 0입니다.`)
      if (mode === 'sales' && stocks.length > 0 && parseNumPlain(l.quantity) > 0) {
        const have = stockWhOf(l.itemId)
        if (have < parseNumPlain(l.quantity)) {
          msgs.push(`${i + 1}행: ${itemById.get(l.itemId)?.name} 창고재고 ${fmtNumber(have)} < 출고 ${fmtNumber(parseNumPlain(l.quantity))}`)
        }
      }
    })
    customDefs.filter((d) => d.required).forEach((d) => {
      if (!(customValues[d.fieldKey] ?? '').trim()) msgs.push(`추가항목 '${d.label}'은(는) 필수입니다.`)
    })
    if (lineCount === 0) msgs.push('품목을 1줄 이상 입력하세요.')
    setVerifyResult(msgs)
  }

  // ── 임시저장 (원본은 주기적으로 자동 저장하고 푸터에 시각을 찍는다) ──
  const snapshot = () => JSON.stringify({
    date, partnerId, employeeId, warehouseId, taxable, foreign, exchangeRate, currencyCode, projectId, remark, customValues, lines,
  })
  function applyTemp() {
    const raw = localStorage.getItem(tempKey)
    if (!raw) return
    try {
      const s = JSON.parse(raw)
      setDate(s.date ?? todayYmd()); setPartnerId(s.partnerId ?? ''); setEmployeeId(s.employeeId ?? '')
      setWarehouseId(s.warehouseId ?? ''); setTaxable(s.taxable ?? true); setForeign(s.foreign ?? false); setCurrencyCode(s.currencyCode ?? '')
      setExchangeRate(s.exchangeRate ?? '0'); setProjectId(s.projectId ?? ''); setRemark(s.remark ?? '')
      setCustomValues(s.customValues ?? {}); setLines(Array.isArray(s.lines) && s.lines.length ? s.lines : emptyLines())
      setHasTemp(false)
      flash('임시저장 내역을 불러왔습니다.')
    } catch { flash('임시저장 내역을 읽을 수 없습니다.') }
  }
  function deleteTemp() {
    localStorage.removeItem(tempKey)
    setHasTemp(false)
    setSavedAt('')
  }
  // 60초마다 자동 임시저장
  const snapRef = useRef(snapshot)
  snapRef.current = snapshot
  useEffect(() => {
    /* 수정 창은 임시저장하지 않는다 — 그 자리는 새 전표를 쓰던 내용이다(덮으면 쓰던 것이 사라진다). */
    if (popup) return
    const t = window.setInterval(() => {
      const s = snapRef.current()
      if (s.includes('"itemId":"')) {   // 뭔가 입력된 상태에서만
        localStorage.setItem(tempKey, s)
        setSavedAt(`${new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 임시저장되었습니다.`)
      }
    }, 60000)
    return () => window.clearInterval(t)
  }, [tempKey])

  // ── 저장 ──────────────────────────────────────────────
  function reset(keepHeader = false) {
    setLines(emptyLines())
    setDiscountTotal(0)
    setRemark('')
    setCustomValues({})
    setQtyErr(null); setError('')
    if (!keepHeader) { setPartnerId(''); setProjectId(''); setEmployeeId(rememberedEmpRef.current) }
  }

  /*
   * 저장이 어디서 끝나든(검증에 막혀 돌아가든, 서버가 거절하든) 미리 열어 둔 인쇄창이 '준비 중' 빈 창으로
   * 남지 않게 한다 — 저장에 성공하면 위에서 그 창을 가져가 ref 를 비우므로 여기서는 닫히지 않는다.
   */
  async function submit(e: FormEvent) {
    try { await submitInner(e) } finally {
      if (printWinRef.current) { printWinRef.current.close(); printWinRef.current = null; afterSaveRef.current = null }
    }
  }

  async function submitInner(e: FormEvent) {
    e.preventDefault()
    setError(''); setQtyErr(null)
    // 요청에 실을 줄과 그 줄의 원본(추가항목 값이 붙어 있다)을 같은 순서로 들고 간다.
    // 원본 판매입력 · 구매입력은 단가 0 인 줄도 저장한다(2026-10-21 실측, 합계 0 / 칸은 빈칸).
    // 음수 수량은 반품 줄이다(원본 [반품처리] 가 -30 으로 연다) — 0 만 뺀다.
    const keptLines = lines.filter((l) => l.itemId && parseNumPlain(l.quantity) !== 0 && parseNumPlain(l.unitPrice) >= 0)
    const validLines = keptLines
      .map((l) => ({
        itemId: Number(l.itemId),
        quantity: parseNumPlain(l.quantity),
        unitPrice: fx ? roundWon(fxAmountOf(l) * lineRateOf(l) / (parseNumPlain(l.quantity) || 1e-9)) : parseNumPlain(l.unitPrice),
        ...(fx ? { foreignPrice: parseNumPlain(l.unitPrice), foreignAmount: fxAmountOf(l), lineRate: parseNumPlain(l.lineRate) > 0 ? parseNumPlain(l.lineRate) : undefined } : {}),
        remark: l.remark.trim() || undefined,
        spec: l.spec ?? undefined,
        itemName: l.name ?? undefined,
        lotNo: l.lotNo.trim() || undefined,
        extraCost: l.extraCost ? parseNumPlain(l.extraCost) : undefined,
        sourceOrderId: l.sourceOrderId ? Number(l.sourceOrderId) : undefined,
        supplyAmount: overriddenSupply(l) ?? undefined,
        vatAmount: computed[lines.indexOf(l)]?.typedVat ?? undefined,
      }))
    /*
     * 원본 차례(2026-10-21 E040205 실측): 빈 격자 → '알림' 창, 품목만 고른 줄 → 그 [수량] 칸 말풍선.
     * 원본은 거래처가 비어도 저장된다 — 우리 전표는 거래처가 필수라(스키마) 그 검사는 뒤에 남긴다.
     */
    const noQty = lines.findIndex((l) => l.itemId && parseNumPlain(l.quantity) === 0)
    if (noQty >= 0) return setQtyErr(noQty)
    if (validLines.length === 0) {
      void ecAlert(`아래의 경우 처리가 불가능합니다.
자세한 내용은 아래의 사항을 참고하시기 바랍니다.
아래 사항을 수정 후 다시 진행하시기 바랍니다.

${cfg.title} - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.`)
      return
    }
    /* 로트관리 품목은 로트No. 가 있어야 한다 — 서버도 거절한다(QA 62회차). 저장 전에 어느 줄인지 알려 준다. */
    const noLot = keptLines.find((l) => !l.lotNo.trim() && items.find((i) => String(i.id) === l.itemId)?.lotManaged)
    if (noLot) {
      const it = items.find((i) => String(i.id) === noLot.itemId)!
      return setError(`${it.code} ${it.name} 은(는) 로트관리 품목입니다 — 로트No.를 입력하세요.`)
    }

    const dateKey = mode === 'sales' ? 'saleDate' : 'purchaseDate'
    const body = {
      partnerId: partnerId ? Number(partnerId) : null,
      partnerName: anyPartner ? anyPartnerName : null,
      warehouseId: Number(warehouseId),
      vatBySlip,
      [dateKey]: date,
      // 외자도 고른 거래유형 그대로 보낸다 — 부가세 0 은 서버가 통화코드로 정한다(원본 수입 구매도 '부가세율 적용')
      taxable,
      ...(fx ? { currencyCode, exchangeRate: parseNumPlain(exchangeRate) } : {}),
      remark: remark || undefined,
      projectId: projectId ? Number(projectId) : undefined,
      employeeId: employeeId ? Number(employeeId) : undefined,
      lines: validLines,
      ...(isAdjust ? { discountSupply: discount.supply, discountVat: discount.vat, inputII: true } : {}),
    }
    if (isAdjust && discount.total > totals.total) return setError('할인 합계가 거래 합계보다 큽니다.')
    /*
     * 회계반영된 판매(판매입력 II 로 저장한 전표 등)를 고쳐 합계가 달라지면 원본(2026-10-22 판매입력 II(수정) 실측: 수량 3 [저장])은
     * 알림을 띄운다 — [확인] 이면 저장하고 회계전표는 그대로 둔다(차이가 채권의 기타할인등차액). 합계가 같으면 말 없이 저장한다.
     */
    if (editing && mode === 'sales') {
      const old = docs.find((x) => x.id === editing.id) as SalesDoc | undefined
      if (old?.accountingReflected && Math.round(net.total) !== Math.round(Number(old.totalAmount))) {
        if (!(await ecConfirm("판매전표와 회계전표의 정보가 서로 다릅니다.\n정보가 다른 경우 거래처관리대장 조회시 '기타할인등차액'이 발생할 수 있습니다.\n계속 저장하겠습니까?\n- 합계금액"))) return
      }
    }
    try {
      // 수정 모드면 PUT — 서버가 옛 라인의 재고를 되돌리고 새 라인으로 다시 반영한다.
      const res = editing
        ? await api.put<SalesDoc | PurchaseDoc>(`${cfg.endpoint}/${editing.id}`, body)
        : await api.post<SalesDoc | PurchaseDoc>(cfg.endpoint, body)
      if (!editing) {
        rememberedEmpRef.current = employeeId
        const mem = JSON.stringify({ date, employeeId, warehouseId })
        api.put(`/me/memory/${memKey}`, { value: mem }).catch(() => {
          try { localStorage.setItem(whKey, warehouseId); localStorage.setItem(hdKey, JSON.stringify({ date, employeeId })) } catch { /* 무시 */ }
        })
      }
      /*
       * 판매입력 II 는 저장하면 <b>매출전표 I 까지 함께</b> 생긴다(원본 E040253 2026-10-22 실측: 저장 직후 판매조회
       * 회계반영여부 ✓, 판매단가일괄변경 목록에서 빠지고, 수정 창에 [매출전표 I] 탭 · 삭제 알림에 '- 매출전표 I').
       * 판매입력(I) 은 회계에 안 간다. 반영이 실패해도 판매는 이미 저장됐으니 되돌리지 않고 알린다.
       */
      if (isAdjust && !editing) {
        await api.post('/accounting-reflection/reflect', { kind: 'SALES', ids: [res.data.id] })
          .catch((err) => flash(`판매는 저장했지만 매출전표 생성에 실패했습니다: ${extractErrorMessage(err)}`))
      }
      // 추가항목(사용자정의)은 전표가 생긴 뒤에야 붙일 수 있다 — id 를 키로 쓰기 때문이다.
      if (customDefs.length > 0 && Object.values(customValues).some((v) => v?.trim())) {
        await api.put('/custom-fields/values', { values: customValues },
          { params: { entityType: cfg.entityType, entityId: res.data.id } })
          .catch(() => flash('전표는 저장했지만 추가항목 저장에 실패했습니다.'))
      }

      /*
       * 라인 추가항목.
       *
       * <p>수정하면 서버가 옛 라인을 지우고 새로 만들어 <b>라인 id 가 바뀐다.</b> 그대로 두면
       * 옛 id 에 붙은 값이 아무도 안 보는 채로 남는다 — 먼저 지우고 새 id 로 다시 붙인다.
       */
      if (lineDefs.length > 0) {
        const lineEntity = `${cfg.entityType}_LINE`
        const oldIds = editing ? lines.map((l) => l.lineId).filter((v): v is number => v != null) : []
        const newLines = (res.data.lines ?? []) as { lineId?: number }[]
        await Promise.all([
          ...oldIds.map((id) => api.put('/custom-fields/values', { values: {} },
            { params: { entityType: lineEntity, entityId: id } }).catch(() => {})),
          ...keptLines.map((l, i) => {
            const id = newLines[i]?.lineId
            if (id == null || !Object.values(l.custom ?? {}).some((v) => v?.trim())) return Promise.resolve()
            return api.put('/custom-fields/values', { values: l.custom },
              { params: { entityType: lineEntity, entityId: id } }).catch(() => {})
          }),
        ]).catch(() => flash('전표는 저장했지만 라인 추가항목 저장에 실패했습니다.'))
      }
      /*
       * 원본 구매입력 격자의 <b>[품질검사요청]</b>(qcRequest_chk). 켠 줄의 품목·수량으로
       * 입고검사 요청을 만든다 — 생산입고 III 이 하는 것과 같은 흐름이다.
       *
       * <p>요청 생성이 실패해도 <b>구매는 이미 끝난 일</b>이라 되돌리지 않고 사유만 알린다.
       * 여기서 전표를 롤백하면 물건은 들어왔는데 산 기록이 없어진다.
       */
      const qcLines = mode === 'purchase'
        ? keptLines.filter((l) => l.qcRequest && l.itemId)
        : []
      if (qcLines.length > 0) {
        const made = await Promise.all(qcLines.map((l) => api.post('/quality-inspection-requests', {
          type: 'INCOMING',
          itemId: Number(l.itemId),
          requestQty: parseNumPlain(l.quantity),
          lotNo: l.lotNo.trim() || undefined,
          requestDate: date,
          remark: `구매 ${res.data.docNo}`,
        }).then(() => true).catch(() => false)))
        const okCount = made.filter(Boolean).length
        if (okCount < qcLines.length) {
          flash(`품질검사요청 ${qcLines.length}건 중 ${okCount}건만 만들어졌습니다.`)
        } else {
          flash(`입고검사 요청 ${okCount}건을 만들었습니다.`)
        }
      }
      setSavedDoc({ id: res.data.id, docNo: res.data.docNo })
      // 원본 수정 창 · 신규 창 [저장(F8)] — 말 없이 창이 닫히고 목록이 새 값으로 바뀐다(2026-10-21 E040206 실측).
      // [저장/전표(F7)] 이면 닫기 전에 전표를 찍는다(창 안에서도 원본은 저장 뒤 전표 인쇄).
      if (popup) {
        if (afterSaveRef.current === SLIP_PRINT_AFTER_SAVE) printSavedSlip(res.data)
        afterSaveRef.current = null
        popup.onClose(true)
        return
      }
      deleteTemp()
      if (fromReleaseId && !editing) {
        // 출고처리 건에 이 판매를 걸고 처리 탭으로 돌아간다 — 원본도 창이 닫히고 [판매] 칸에 일자-No. 가 찍힌다.
        await Promise.all(releaseIds.map((id) => api.patch(`/order-releases/${id}/sale`, { saleId: res.data.id })))
          .catch(() => flash('판매는 저장했지만 출고처리에 잇지 못했습니다.'))
        navigate('/sales/order-release?tab=처리')
        return
      }
      if (editing) {
        // 수정을 마치면 신규 입력 상태로 돌아간다 — 같은 전표를 두 번 저장하는 사고를 막는다.
        setEditing(null)
        setSearchParams({}, { replace: true })
      }
      // 원본 판매입력 · 구매입력은 저장하면 말 없이 빈 칸으로 돌아간다(2026-10-21 E040205 · 10-20 E040303 실측).
      // 번호는 판매조회 · 구매조회에서 본다 — QA 흐름도 안내 글 대신 API 로 번호를 찾는다.
      reset(true)
      // 저장 뒤 [거래처] 도 비운다 — 창고는 남는다(판매 2026-10-22 원본 E040205 · 구매 2026-10-28 E040303 실측).
      if (!popup) setPartnerId('')
      /* 목록을 아직 안 받았으면 저장했다고 새로 받을 까닭이 없다 — 볼 자리가 안 열려 있다. */
      if (docsAsked.current) void loadDocs()
      const afterSaveTo = afterSaveRef.current
      afterSaveRef.current = null
      if (afterSaveTo === KEEP_AFTER_SAVE) { ensureDocs(); setSearchParams({ edit: String(res.data.id) }, { replace: true }) }
      else if (afterSaveTo === SLIP_PRINT_AFTER_SAVE) printSavedSlip(res.data)
      else if (afterSaveTo) navigate(afterSaveTo)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  // ── 내보내기 ──────────────────────────────────────────
  async function doExcel() {
    const t = findDataTable(gridRef.current)
    if (!t) return flash('내보낼 표가 없습니다.')
    if (!await exportTableToXlsx(t, cfg.title)) flash('내보낼 품목이 없습니다.')
  }
  function doPrint() {
    const t = findDataTable(gridRef.current)
    if (!t) return flash('인쇄할 표가 없습니다.')
    if (!printTable(t, cfg.title)) flash('인쇄할 품목이 없습니다.')
  }

  // ── 툴바 정의 ─────────────────────────────────────────
  /**
   * 저장이 끝나면 갈 곳. 원본 [저장/결제]가 이 값을 정해 두고 저장을 시킨다 —
   * 저장 자체는 폼 제출 한 길로만 흐르게 두려는 것이다(검증·연결전표가 다 거기 있다).
   */
  /*
   * 상태(useState)가 아니라 ref 다 — 값을 정하고 <b>곧바로</b> 제출하는데, 상태로 두면 제출을 처리하는 함수가
   * 아직 옛 값(null)을 본다. 그래서 [저장/결제]·[저장/전표(F7)]가 저장만 하고 넘어가지 않았다(2026-10-06 화면으로 확인).
   */
  const afterSaveRef = useRef<string | null>(null)
  /** [저장/전표(F7)] 가 클릭 순간에 열어 둔 인쇄창 — 저장(비동기) 뒤에 열면 팝업 차단에 걸린다. */
  const printWinRef = useRef<Window | null>(null)
  /*
   * 원본 [저장/전표(F7)] — 저장하고 그 전표의 인쇄 양식을 띄운다(2026-10-06 loginaa):
   * 판매입력은 <b>거래명세서</b>(2026/10/06-9), 구매입력은 <b>구매전표</b>(2026/10/06-4).
   * 예전 우리 F7 은 저장 없이 입력 격자만 인쇄했다.
   */
  async function saveCash() {
    if (!partnerId) return setCashMsg('거래처를 먼저 고르세요.')
    if (parseNumPlain(cashForm.amount) === 0) return setCashMsg('금액을 입력하세요.')
    /* 원본 '매입처로'는 출금계좌를 비우고 저장하면 그 칸을 빨갛게 막는다(2026-10-06 실측). */
    if (mode === 'purchase' && !cashForm.method) return setCashMsg('출금계좌를 고르세요.')
    try {
      const r = await api.post<{ docNo: string }>('/settlements', {
        type: mode === 'sales' ? 'RECEIPT' : 'PAYMENT', partnerId: Number(partnerId),
        // 원본은 [금액](받은 돈)과 [수수료]를 따로 적고 채권은 둘을 더한 만큼 준다 — 서버 amount 는 그 총액이다.
        // 지급은 다르다 — 원본 '매입처로': 금액 1,000 · 수수료 100 → 채무 1,000 감소, 현금 1,100 지출. amount 는 금액 그대로.
        amount: parseNumPlain(cashForm.amount) + (mode === 'sales' ? parseNumPlain(cashForm.fee) : 0),
        fee: parseNumPlain(cashForm.fee) > 0 ? parseNumPlain(cashForm.fee) : undefined,
        ...(cashForm.method.startsWith('bank:')
          ? { method: '계좌이체', bankAccountId: Number(cashForm.method.slice(5)) }
          : { method: cashForm.method || undefined }),
        departmentId: cashForm.departmentId ? Number(cashForm.departmentId) : undefined,
        projectId: cashForm.projectId ? Number(cashForm.projectId) : undefined,
        settleDate: cashForm.date || undefined, note: cashForm.note.trim() || undefined,
      })
      setCashOpen(false)
      flash(`${r.data.docNo} ${mode === 'sales' ? '수금' : '지급'} 저장 완료 (${fmtNumber(parseNumPlain(cashForm.amount))}원${parseNumPlain(cashForm.fee) > 0 ? ` · 수수료 ${fmtNumber(parseNumPlain(cashForm.fee))}원` : ''})`)
    } catch (err) {
      setCashMsg(extractErrorMessage(err))
    }
  }

  /** [저장/전표(F7)] 로 저장한 전표를 미리 열어 둔 창에 찍는다. */
  function printSavedSlip(saved: SalesDoc | PurchaseDoc) {
    const win = printWinRef.current
    printWinRef.current = null
    if (mode === 'sales') {
      const d = saved as SalesDoc
      void loadSupplierParty().then((sup) =>
        printDocuments([salesSlipDocument(d, partners.find((p) => p.id === d.partnerId), sup)], win))
    } else {
      void printDocuments([purchaseSlipDocument(saved as PurchaseDoc)], win)
    }
  }

  function saveAndPrintSlip() {
    if (submitting.isBusy()) return   // 저장 중에 인쇄창만 하나 더 열리지 않게
    printWinRef.current = openPrintWindow()
    if (!printWinRef.current) return
    afterSaveRef.current = SLIP_PRINT_AFTER_SAVE
    formRef.current?.requestSubmit()
  }
  const formRef = useRef<HTMLFormElement>(null)

  /** 원본에 있으나 아직 백엔드가 없는 버튼. 지우지 않고 사유를 붙여 비활성으로 남긴다. */
  const todo = (why: string) => ({ disabled: true, title: why })
  /** 주문을 담은 판매 — 툴바에서 주문 · 구매 · 전표 바코드 · 전표불러오기를 감춘다. 줄을 비우면(다시 작성) 돌아온다. */
  const orderLoaded = mode === 'sales' && lines.some((l) => l.itemId && l.sourceOrderId)

  const partnerDocs = docs.filter((d) => String(d.partnerId) === partnerId)

  /*
   * 원본 판매입력 아래 줄 ▲ 메뉴(2026-10-31 loginad 실측):
   *   [저장(F8)▲] 저장/전자결재 · 저장/내용유지 · 보류 · 저장/신규, [저장/전표(F7)▲] 저장/회계전표, [현금수금▲] 어음수금.
   * [보류] 는 툴바 [보류] 와 같다 — 보류 전표는 아직 없다(동작 미구현).
   */
  const saveMenu = [
    { label: '저장/전자결재', onClick: () => flash('전자결재 상신은 [그룹웨어 › 전자결재]에서 이 전표를 첨부해 올립니다(입력 화면에서 바로 올리는 길은 아직 없습니다).') },
    /* 원본: 저장하고 그 전표의 수정 화면(판매입력(수정))으로 바뀐다 — 입력한 내용이 그대로 남는다. */
    { label: '저장/내용유지', onClick: () => { afterSaveRef.current = KEEP_AFTER_SAVE; formRef.current?.requestSubmit() } },
    ...(mode !== 'sales' || isAdjust ? [] : [{ label: '보류', onClick: () => void ecAlert('보류 전표 기능은 아직 없습니다.') }]),
    { label: '저장/신규', onClick: () => formRef.current?.requestSubmit() },
  ]
  const slipMenu = [{ label: '저장/회계전표', onClick: () => { afterSaveRef.current = '/sales/accounting-reflection'; formRef.current?.requestSubmit() } }]
  // 판매: [어음수금] = 받을어음증가. 구매 [현금지급▲] 메뉴는 아직 원본을 못 봐서 예전 둘을 둔다.
  const cashMenu = mode === 'sales'
    ? [{ label: '어음수금', onClick: () => navigate('/accounting/notes-increase') }]
    : [
        { label: '수금 화면으로', onClick: () => navigate('/sales/collection') },
        { label: '지급 화면으로', onClick: () => navigate('/sales/payment') },
      ]
  /** 원본 아래 줄 맨 앞 종이비행기 — 무엇을 하는지 아직 못 봤다(동작 미구현). */
  const sendAction: SlipAction = { label: '보내기', icon: 'send', onClick: () => void ecAlert('전표 보내기는 아직 없습니다.') }

  const footerActions: SlipAction[] = [
    ...(mode === 'sales' && !isAdjust ? [sendAction] : []),
    {
      label: editing ? '수정저장(F8)' : '저장(F8)', primary: true, submit: true,
      /*
       * 원본 [저장(F8)▲] 메뉴(2026-10-06 loginaa 판매입력 실측): 저장/전자결재 · 저장/내용유지 · 보류 · 저장/신규.
       * [보류]는 툴바에도 있어 거기 하나로 둔다. [저장/결제]는 판매입력 II 의 메뉴(대조표 ecount-buttons)라 남긴다 —
       * 이 화면이 두 메뉴를 겸한다. 예전 메뉴의 임시저장 · 입력값 지우기는 원본에 없어 뺐다(지우기는 [다시 작성],
       * 임시저장은 60초마다 저절로 돈다).
       */
      menu: [
        ...saveMenu,
        // [저장/결제] 는 판매입력 II 의 메뉴다(대조표 ecount-buttons). 판매입력 ▲ 에는 없다(2026-10-31 loginad 실측).
        ...(isAdjust ? [{ label: '저장/결제', onClick: () => { afterSaveRef.current = cfg.cashTo; formRef.current?.requestSubmit() } }] : []),
        ...(editing ? [{
          label: '수정 취소(신규로)',
          onClick: () => { setEditing(null); setSearchParams({}, { replace: true }); reset(false) },
        }] : []),
      ],
    },
    {
      label: '저장/전표(F7)', onClick: saveAndPrintSlip,
      /*
       * 원본 [저장/전표(F7)▲] 의 [저장/회계전표]. [회계전표연결] 단추는 원본 대조표(ecount-buttons)에 있어 그대로 둔다
       * (2026-10-06 신규 입력 화면에서는 안 보였다 — 저장 뒤에 서는 단추로 보인다).
       * 원본 이 회사에서는 '회계반영여부를 확인해주세요' 알림으로 멈췄다(설정에 따라 매출전표 I 로 가는 자리) — 우리는 저장하고 회계반영 화면으로 간다.
       */
      menu: slipMenu,
    },
    {
      label: '회계전표연결',
      disabled: !savedDoc,
      disabledReason: '전표를 저장하면 회계반영 화면으로 넘어갑니다.',
      onClick: () => navigate('/sales/accounting-reflection'),
    },
    { label: '다시 작성', onClick: () => { reset(false); setSavedDoc(null) } },
    {
      label: cfg.cashLabel,
      onClick: () => {
        setCashMsg('')
        setCashForm({ date: todayYmd(), departmentId: '', projectId: '', method: mode === 'sales' ? '현금' : '', amount: String(net.total || ''), fee: '0', note: '' })
        api.get<typeof cashBanks>('/bank-cards/accounts').then((r) => setCashBanks(r.data)).catch(() => setCashBanks([]))
        api.get<typeof cashDepts>('/departments').then((r) => setCashDepts(r.data)).catch(() => setCashDepts([]))
        setCashOpen(true)
      },
      menu: cashMenu,
    },
    // 원본 푸터의 마지막 두 개는 [리스트][웹자료올리기] 다. '닫기' 가 아니라 조회 화면으로 간다.
    { label: '리스트', onClick: () => navigate(cfg.listTo) },
    { label: '웹자료올리기', disabled: true, disabledReason: '파일 첨부는 [전자결재·드라이브]에서 씁니다.' },
  // 원본 판매입력 II 아래 줄은 저장(F8)▴ · 저장/전표(F7)▴ · 다시 작성 · 현금수금▴ · 리스트 — 회계전표연결 · 웹자료올리기가 없다(2026-10-22).
  ].filter((a) => !isAdjust || (a.label !== '회계전표연결' && a.label !== '웹자료올리기'))

  /*
   * 판매조회 위 수정 창의 아래 버튼줄(원본 E040206 '판매입력(수정)' 2026-10-21 실측):
   *   저장(F8) · 저장/전표(F7) · 복사 · 반품처리 · 현금수금 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H · 최종이력.
   * 보내기(메일 · 팩스)는 받쳐 줄 것이 없어 흐리게 둔다. H · 최종이력은 판매만 전표 이력(거래이력조회(재고) 와 같은 줄)을 연다.
   */
  async function deleteInPopup() {
    if (!popup || !editing) return
    // 원본 '알림' 창: "전표를 삭제하겠습니까?" 아래 줄 " - 판매" · [확인] [취소] → 확인하면 창이 닫히고 목록에서 사라진다.
    /*
     * 회계반영된 판매(판매입력 II 로 저장한 전표 등)는 원본 알림이 '- 판매' '- 매출전표 I' 두 줄에 [매출전표포함 삭제] 가 켜져 있고,
     * [확인] 하면 매출전표까지 같이 지워진다(2026-10-22 E040253 실측).
     */
    const reflected = mode === 'sales' && !!docs.find((x) => x.id === editing.id && (x as SalesDoc).accountingReflected)
    if (!(await ecConfirm(`전표를 삭제하겠습니까?
 - ${mode === 'sales' ? '판매' : '구매'}${reflected ? '\n - 매출전표 I' : ''}`))) return
    try {
      if (reflected) await api.post('/accounting-reflection/delete-sales-with-journal', { kind: 'SALES', ids: [editing.id] })
      else await api.delete(`${cfg.endpoint}/${editing.id}`)
      popup.onClose(true)
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }
  const cashAction = footerActions.find((a) => a.label === cfg.cashLabel)
  const popupActions: SlipAction[] | null = !popup ? null : editing ? [
    { label: '저장(F8)', primary: true, submit: true },
    { label: '저장/전표(F7)', onClick: saveAndPrintSlip },
    /*
     * [복사] — 원본(2026-10-21 E040206 실측, 유통회사 10/24 -1 포장김치 50 × 9,000): 창이 '판매입력' 신규 창으로 바뀌고
     * 거래처 · 담당자 · 출하창고 · 품목줄은 그대로, 일자는 <b>오늘</b>, No. 는 비어 저장할 때 새로 받는다(10/21 -4).
     * 아래 버튼줄도 신규 창 것(저장(F8) · 저장/전표(F7) · 다시 작성 · 현금수금 · 닫기 · 웹자료올리기)으로 바뀐다.
     */
    { label: '복사', onClick: () => { copiedRef.current = true; setEditing(null); setDate(todayYmd()); popup.onCopy?.() } },
    { label: '반품처리', onClick: popup.onReturn },
    ...(cashAction ? [{ ...cashAction, menu: undefined }] : []),
    { label: '이전', onClick: () => popup.onMove('prev') },
    { label: '다음', onClick: () => popup.onMove('next') },
    { label: '닫기', onClick: () => popup.onClose(dateChangedRef.current) },
    { label: '삭제', onClick: () => void deleteInPopup() },
    { label: '보내기', disabled: true, disabledReason: '메일 · 팩스 보내기는 아직 없습니다.' },
    // 원본 구매 수정 창은 [H] 하나뿐 — [최종이력] 이 없다(2026-10-21 loginaa 구매 2026/10/21 -4 실측).
    { label: 'H', onClick: () => setSlipHistory('H') },
    ...(mode === 'sales' ? [{ label: '최종이력', onClick: () => setSlipHistory('last') }] : []),
  ] : [
    /*
     * 신규 창(판매조회 [신규(F2)] · 수정 창 [복사] 뒤) — 원본 아래 버튼줄(2026-10-21 실측):
     *   저장(F8) · 저장/전표(F7) · 다시 작성 · 현금수금 · 닫기 · 웹자료올리기.
     */
    // 원본 신규 창도 ✈ · 저장(F8)▲ · 저장/전표(F7)▲ · 현금수금▲ 이다(2026-10-31 loginad 판매조회 [신규(F2)]).
    // 구매조회 [신규(F2)] 창은 ✈ · 저장(F8)▲ · 저장/전표(F7) · 다시 작성 · 현금지급▲ · 닫기 · 웹자료올리기(같은 날 구매 QA — 저장/전표 ▲ 없음).
    // 구매 ▲ 안 항목은 원본에서 못 봤다 — 저장(F8)▲ 은 판매와 같은 줄(보류 빼고), 현금지급▲ 은 예전 줄(수금 · 지급 화면으로).
    sendAction,
    { label: '저장(F8)', primary: true, submit: true, menu: saveMenu },
    { label: '저장/전표(F7)', onClick: saveAndPrintSlip, ...(mode === 'sales' ? { menu: slipMenu } : {}) },
    { label: '다시 작성', onClick: () => { reset(false); setSavedDoc(null) } },
    ...(cashAction ? [{ ...cashAction, menu: cashMenu }] : []),
    { label: '닫기', onClick: () => void closeNewPopup() },
    { label: '웹자료올리기', disabled: true, disabledReason: '파일 첨부는 [전자결재·드라이브]에서 씁니다.' },
  ]
  /** 원본 신규 창 [닫기] — 품목을 넣은 채면 '알림 / 작성한 내용이 저장되지 않았습니다. 페이지를 벗어나겠습니까?' [확인] [취소]. */
  async function closeNewPopup() {
    if (!popup) return
    if (lines.some((l) => l.itemId) && !(await ecConfirm('작성한 내용이 저장되지 않았습니다. 페이지를 벗어나겠습니까?'))) return
    popup.onClose(false)
  }
  return { applyAdjust, applyExtraCost, applyPriceChange, applyQtyStep, applyTemp, computed, deleteChecked, deleteTemp, discount, doExcel, doPrint, footerActions, formRef, fx, fxAmountOf, lineCount, net, orderLoaded, partnerDocs, popupActions, profitRows, profitTotals, rate, reset, saveCash, scanBarcode, sortLines, submit, todo, totalTd, totals, verify }
}
