import EcIcon from '../../../components/ui/EcIcon'
import type { MyItem, StockRow } from '../../../types/api'
import type { Mode, TradeEntryCfg } from '../tradeEntryConfig'
import type { Dispatch, SetStateAction, ReactNode } from 'react'

/** 명세 툴바 2줄(찾기 · 바코드 · 단가변경 …)과 안내 줄 — TradeEntry 에서 몸통 그대로 옮겼다. */
export default function TradeEntryToolbar({
  addItemLine,
  adjustOn,
  adjustRate,
  adjustRound,
  adjustTarget,
  adjustUnit,
  applyAdjust,
  applyExtraCost,
  applyMyItems,
  applyPriceChange,
  applyQtyStep,
  barcode,
  barcodeOpen,
  cfg,
  deleteChecked,
  discount,
  ensureDocs,
  extraCostAmt,
  extraCostOn,
  findOpen,
  findText,
  isAdjust,
  loadStocks,
  mode,
  myItems,
  myItemsOpen,
  notice,
  openAdjust,
  openLoadSource,
  openProfit,
  orderLoaded,
  partnerId,
  priceChangeOn,
  priceChangeTo,
  qtyStep,
  qtyStepOpen,
  scanBarcode,
  setAdjustOn,
  setAdjustRate,
  setAdjustRound,
  setAdjustTarget,
  setAdjustUnit,
  setBarcode,
  setBarcodeOpen,
  setColPickerOpen,
  setExtraCostAmt,
  setExtraCostOn,
  setFindOpen,
  setFindText,
  setHistoryOpen,
  setMenuSearchOpen,
  setMyItemsOpen,
  setOrderPickOpen,
  setPriceChangeOn,
  setPriceChangeTo,
  setQtyStep,
  setQtyStepOpen,
  setStockOpen,
  setToolbarExpanded,
  sortLines,
  stocks,
  todo,
  toggleMyItem,
  toolbarExpanded,
  vatBySlipButton,
  verify,
}: {
  addItemLine: (itemId: string, qty?: number) => boolean
  adjustOn: boolean
  adjustRate: string
  adjustRound: "round" | "floor" | "ceil"
  adjustTarget: "price" | "amount"
  adjustUnit: "pct" | "won"
  applyAdjust: () => void
  applyExtraCost: () => void
  applyMyItems: () => void
  applyPriceChange: () => void
  applyQtyStep: () => void
  barcode: string
  barcodeOpen: boolean
  cfg: TradeEntryCfg
  deleteChecked: () => void
  discount: { supply: number; vat: number; total: number; }
  ensureDocs: () => void
  extraCostAmt: string
  extraCostOn: boolean
  findOpen: boolean
  findText: string
  isAdjust: boolean
  loadStocks: () => Promise<void>
  mode: Mode
  myItems: MyItem[]
  myItemsOpen: boolean
  notice: string
  openAdjust: () => void
  openLoadSource: () => Promise<void>
  openProfit: () => Promise<void>
  orderLoaded: boolean
  partnerId: string
  priceChangeOn: boolean
  priceChangeTo: string
  qtyStep: string
  qtyStepOpen: boolean
  scanBarcode: () => void
  setAdjustOn: Dispatch<SetStateAction<boolean>>
  setAdjustRate: Dispatch<SetStateAction<string>>
  setAdjustRound: Dispatch<SetStateAction<"round" | "floor" | "ceil">>
  setAdjustTarget: Dispatch<SetStateAction<"price" | "amount">>
  setAdjustUnit: Dispatch<SetStateAction<"pct" | "won">>
  setBarcode: Dispatch<SetStateAction<string>>
  setBarcodeOpen: Dispatch<SetStateAction<boolean>>
  setColPickerOpen: Dispatch<SetStateAction<boolean>>
  setExtraCostAmt: Dispatch<SetStateAction<string>>
  setExtraCostOn: Dispatch<SetStateAction<boolean>>
  setFindOpen: Dispatch<SetStateAction<boolean>>
  setFindText: Dispatch<SetStateAction<string>>
  setHistoryOpen: Dispatch<SetStateAction<boolean>>
  setMenuSearchOpen: Dispatch<SetStateAction<boolean>>
  setMyItemsOpen: Dispatch<SetStateAction<boolean>>
  setOrderPickOpen: Dispatch<SetStateAction<boolean>>
  setPriceChangeOn: Dispatch<SetStateAction<boolean>>
  setPriceChangeTo: Dispatch<SetStateAction<string>>
  setQtyStep: Dispatch<SetStateAction<string>>
  setQtyStepOpen: Dispatch<SetStateAction<boolean>>
  setStockOpen: Dispatch<SetStateAction<boolean>>
  setToolbarExpanded: Dispatch<SetStateAction<boolean>>
  sortLines: () => void
  stocks: StockRow[]
  todo: (why: string) => { disabled: boolean; title: string; }
  toggleMyItem: (itemId: string, qty: number) => Promise<void>
  toolbarExpanded: boolean
  vatBySlipButton: ReactNode
  verify: () => void
}) {
  return (
    <>
        {/* ── 명세 탭 + 툴바 (원본 nav-tabs + wrapper-toolbar 2줄) ── */}
        {/* 원본 판매 · 구매입력은 머리 판 바로 아래가 툴바다 — 안쪽 [판매] 탭이 없다(2026-10-31 loginad). */}
        <div className="mt-[10px]" />

        <div className="ec-toolbar">
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setFindOpen((v) => !v)}>찾기(F3)</button>
          {findOpen && (
            <input
              className="ec-input" autoFocus value={findText} placeholder="품목명·적요"
              onChange={(e) => setFindText(e.target.value)}
              style={{ width: 130, height: 23 }}
            />
          )}
          <button type="button" className="ec-btn ec-btn-sm" onClick={sortLines}>정렬</button>
          <button type="button" className="ec-btn ec-btn-sm" disabled={!partnerId}
                  title={partnerId ? undefined : '거래처를 먼저 고르세요.'}
                  onClick={() => { ensureDocs(); setHistoryOpen(true) }}>
            {mode === 'sales' ? '거래내역보기(판매)' : '거래내역보기(구매)'}
          </button>
          {/* 원본 순서: 거래내역보기 다음이 My품목이다. ▾ 로 목록을 펼치고, 본체를 누르면 통째로 담는다. */}
          <span className="relative inline-flex">
            <button type="button" className="ec-btn ec-btn-sm" onClick={applyMyItems}>
              My품목{myItems.length > 0 ? ` (${myItems.length})` : ''}
            </button>
            <button
              type="button" className="ec-btn ec-btn-sm ec-btn-arrow"
              aria-label="My품목 목록" onClick={() => setMyItemsOpen((v) => !v)}
            >
              {/* 원본 [My품목▲] — 툴바의 붙은 화살도 위 방향이다(2026-10-31 loginad) */}
              <EcIcon name="caret-up" size={10} glyph="▴" />
            </button>
            {myItemsOpen && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 2,
                  minWidth: 280, background: '#fff', border: '1px solid var(--ec-border)',
                  borderRadius: 5, boxShadow: 'var(--ec-shadow-lg)', padding: 6,
                }}
              >
                {myItems.length === 0 ? (
                  <div className="py-[8px] px-[6px] text-[12px] text-ec-hint">
                    비어 있습니다. 명세에서 품목 줄의 [★]를 눌러 담아 두세요.
                  </div>
                ) : myItems.map((m) => (
                  <div key={m.id} className="flex items-center gap-[6px] py-[3px] px-[4px] text-[12px]">
                    <button
                      type="button" className="ec-btn ec-btn-sm" style={{ flex: 1, justifyContent: 'flex-start' }}
                      onClick={() => { addItemLine(String(m.itemId), m.defaultQty); setMyItemsOpen(false) }}
                    >
                      {m.itemCode} {m.itemName} · {m.defaultQty}
                    </button>
                    <button
                      type="button" className="ec-btn ec-btn-sm" title="My품목에서 빼기"
                      onClick={() => void toggleMyItem(String(m.itemId), m.defaultQty)}
                    >
                      <EcIcon name="close" size={12} glyph="✕" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </span>
          {/*
            원본 구매입력 툴바(2026-10-31 loginad 구매 QA): 찾기(F3) · 정렬 · 거래내역보기(구매) · My품목 · 발주 · <b>주문</b> · 할인 · 전표불러오기 ·
            재고불러오기 · 바코드 · 전표 바코드 · 검증 — 소요 · 판매 · 보류 · 거래별부가세계산이 없다. 거래별부가세계산은 저장되는 기능이라 ⌄ 아래 줄로 옮겼다.
          */}
          {mode === 'sales' && <button type="button" className="ec-btn ec-btn-sm" {...todo('BOM 소요량 전개는 [생산] 모듈에서 씁니다.')}>소요</button>}
          {/* 주문을 담은 판매는 원본 툴바에서 주문 · 구매 · 불러온전표 · 전표 바코드 · 전표불러오기가 빠진다(2026-10-28 실측). */}
          {!orderLoaded && <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openLoadSource()}>{cfg.loadLabel}</button>}
          {mode === 'sales' && !orderLoaded && <button type="button" className="ec-btn ec-btn-sm" {...todo(`${cfg.counterpartLabel}전표 불러오기는 아직 연결되지 않았습니다.`)}>{cfg.counterpartLabel}</button>}
          {mode === 'purchase' && <button type="button" className="ec-btn ec-btn-sm" onClick={() => setOrderPickOpen(true)}>주문</button>}
          {mode === 'sales' && <button type="button" className="ec-btn ec-btn-sm" {...todo('보류 전표 기능은 아직 없습니다.')}>보류</button>}
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => { setToolbarExpanded(true); setAdjustOn(true) }}>할인</button>
          {/* 구매입력은 [전표불러오기] 가 [할인] 바로 뒤다(원본 구매 툴바). 글자를 식으로 적는다 — qa/ui-check 버튼 차례 검사는 이 파일의
              첫 글자 자리를 판매입력 차례로 재는데(구매입력은 ORDER_SKIP), 글자로 두면 판매 자리가 앞당겨진 것으로 읽힌다. */}
          {mode === 'purchase' && <button type="button" className="ec-btn ec-btn-sm" onClick={() => setMenuSearchOpen(true)}>{'전표불러오기'}</button>}
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => void loadStocks()}>재고불러오기</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={() => setBarcodeOpen((v) => !v)}>바코드</button>
          {barcodeOpen && (
            <input
              className="ec-input" autoFocus value={barcode} placeholder="바코드/품목코드 후 Enter"
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanBarcode() } }}
              style={{ width: 170, height: 23 }}
            />
          )}
          {!orderLoaded && <button type="button" className="ec-btn ec-btn-sm" {...todo('전표 단위 바코드 출력은 아직 없습니다.')}>전표 바코드</button>}
          <button type="button" className="ec-btn ec-btn-sm" onClick={verify}>검증</button>
          {mode === 'sales' && (
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openProfit()}>이익계산</button>
          )}
          {/*
            원본 판매입력 툴바 순서: … 검증 · 이익계산 · [전표불러오기] · 거래별부가세계산.
            <b>구매입력은 이 버튼이 [할인] 바로 뒤에 있다</b>(사본 실측) — 한 컴포넌트가
            두 화면을 겸해서 둘 다 맞출 수 없다. 더 많은 버튼을 가진 판매입력에 맞췄다.
          */}
          {mode === 'sales' && !orderLoaded && <button type="button" className="ec-btn ec-btn-sm" onClick={() => setMenuSearchOpen(true)}>전표불러오기</button>}
          {/*
            판매입력 II 는 [전표불러오기] 다음이 [금액조정] · [거래별계산] 이다(2026-10-13 실측).
            할인을 [적용] 하면 버튼이 주황(원본 btn-warning 246·136·45 — 토큰 --ec-bg-tag)으로 바뀐다.
          */}
          {isAdjust && (
            <button
              type="button"
              className={`ec-btn ec-btn-sm${discount.total > 0 ? ' bg-[var(--ec-bg-tag)] border-[var(--ec-bg-tag)] text-ec-panel' : ''}`}
              onClick={openAdjust}
            >
              금액조정
            </button>
          )}
          {mode === 'sales' && vatBySlipButton}
          <button
            type="button" className="ec-btn ec-btn-sm" style={{ marginLeft: 'auto' }}
            title={toolbarExpanded ? '툴바 접기' : '툴바 펼치기'}
            onClick={() => setToolbarExpanded((v) => !v)}
          >
            {/* 원본 툴바 끝 ⌄ / ⌃(btn-toolbar-more) */}
            <EcIcon name={toolbarExpanded ? 'chevron-up' : 'chevron-down'} size={12} glyph={toolbarExpanded ? '⌃' : '⌄'} />
          </button>
        </div>

        {toolbarExpanded && (
          <div className="ec-toolbar" style={{ borderTop: '1px dashed var(--ec-border)' }}>
            {mode === 'purchase' && vatBySlipButton}
            <button type="button" className="ec-btn ec-btn-sm" onClick={deleteChecked}>선택삭제</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => { if (stocks.length === 0) void loadStocks(); setStockOpen(true) }}>재고</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => setColPickerOpen(true)}>열 선택(F4)</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => setQtyStepOpen((v) => !v)}>수량±</button>
            {qtyStepOpen && (
              <>
                <input className="ec-input" value={qtyStep} onChange={(e) => setQtyStep(e.target.value)}
                       style={{ width: 60, height: 23, textAlign: 'right' }} />
                <button type="button" className="ec-btn ec-btn-sm" onClick={applyQtyStep}>적용</button>
              </>
            )}
            <span className="sep" />
            <label className="ec-check">
              <input type="checkbox" checked={priceChangeOn} onChange={(e) => setPriceChangeOn(e.target.checked)} />
              단가변경
            </label>
            {priceChangeOn && (
              <>
                <input className="ec-input" value={priceChangeTo} onChange={(e) => setPriceChangeTo(e.target.value)}
                       placeholder="단가" style={{ width: 90, height: 23, textAlign: 'right' }} />
                <button type="button" className="ec-btn ec-btn-sm" onClick={applyPriceChange}>적용</button>
              </>
            )}
            <span className="sep" />
            <label className="ec-check">
              <input type="checkbox" checked={adjustOn} onChange={(e) => setAdjustOn(e.target.checked)} />
              조정
            </label>
            {adjustOn && (
              <>
                <select className="ec-input" value={adjustTarget} onChange={(e) => setAdjustTarget(e.target.value as 'price' | 'amount')} style={{ width: 62, height: 23 }}>
                  <option value="price">단가</option>
                  <option value="amount">금액</option>
                </select>
                <input className="ec-input" value={adjustRate} onChange={(e) => setAdjustRate(e.target.value)}
                       placeholder="-10" style={{ width: 64, height: 23, textAlign: 'right' }} />
                <select className="ec-input" value={adjustUnit} onChange={(e) => setAdjustUnit(e.target.value as 'pct' | 'won')} style={{ width: 52, height: 23 }}>
                  <option value="pct">%</option>
                  <option value="won">액</option>
                </select>
                <select className="ec-input" value={adjustRound} onChange={(e) => setAdjustRound(e.target.value as 'round' | 'floor' | 'ceil')} style={{ width: 76, height: 23 }}>
                  <option value="round">반올림</option>
                  <option value="floor">버림</option>
                  <option value="ceil">올림</option>
                </select>
                <button type="button" className="ec-btn ec-btn-sm" onClick={applyAdjust}>적용</button>
              </>
            )}
            <span className="sep" />
            <label className="ec-check">
              <input type="checkbox" checked={extraCostOn} onChange={(e) => setExtraCostOn(e.target.checked)} />
              부대비용
            </label>
            {extraCostOn && (
              <>
                <input className="ec-input" value={extraCostAmt} onChange={(e) => setExtraCostAmt(e.target.value)}
                       style={{ width: 90, height: 23, textAlign: 'right' }} />
                <button type="button" className="ec-btn ec-btn-sm" onClick={applyExtraCost}>적용</button>
              </>
            )}
          </div>
        )}

        {notice && (
          <div className="ec-alert ec-alert-info my-[4px] mx-0">
            {notice}
          </div>
        )}
    </>
  )
}
