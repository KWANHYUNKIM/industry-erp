import EcIcon from '../../../components/ui/EcIcon'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { fmtNumber } from '../../../utils/format'
import EcNumInput from '../../../components/EcNumInput'
import { ErrTip } from '../../../components/codepicker/GridCode'
import { dateText } from '../../../utils/dateText'
import { num, overriddenSupply, type LineInput } from '../tradeEntryConfig'
import type { RefObject, ReactElement, Dispatch, SetStateAction, ReactNode } from 'react'
import type { Item, CustomFieldDef, MyItem } from '../../../types/api'

/** 품목 격자(원본 #gridESD006Msubmain)와 판매입력 II 금액조정 표 — TradeEntry 에서 몸통 그대로 옮겼다. */
export default function TradeEntryGrid({
  checkedIdx,
  codeItems,
  cols,
  computed,
  discount,
  exchangeRate,
  findText,
  fx,
  fxAmountOf,
  gridRef,
  isAdjust,
  itemById,
  lineCount,
  lineDefs,
  lineLotCol,
  lineRemarkCol,
  lines,
  lotAfterQty,
  lotCell,
  myItems,
  net,
  qtyErr,
  removeLine,
  setLineCustom,
  setLines,
  setQtyErr,
  showExtraCost,
  stockAllOf,
  stockWhOf,
  taxable,
  toggleMyItem,
  totalTd,
  totals,
  updateLine,
}: {
  checkedIdx: number[]
  codeItems: { value: string; code: string; name: string; alias: string | null; sub: string | null; stopped: boolean; }[]
  cols: Record<"stockAll" | "stockWh" | "unit" | "priceVat" | "lineTotal" | "mgmtItem" | "srcType" | "srcDate" | "srcNo" | "qcRequest", boolean>
  computed: { supply: number; vat: number; total: number; typedVat: number | null; }[]
  discount: { supply: number; vat: number; total: number; }
  exchangeRate: string
  findText: string
  fx: boolean
  fxAmountOf: (l: LineInput) => number
  gridRef: RefObject<HTMLDivElement | null>
  isAdjust: boolean
  itemById: Map<string, Item>
  lineCount: number
  lineDefs: CustomFieldDef[]
  lineLotCol: boolean
  lineRemarkCol: boolean
  lines: LineInput[]
  lotAfterQty: boolean
  lotCell: (l: LineInput, idx: number) => ReactElement
  myItems: MyItem[]
  net: { supply: number; vat: number; total: number; }
  qtyErr: number | null
  removeLine: (idx: number) => void
  setLineCustom: (idx: number, key: string, value: string) => void
  setLines: Dispatch<SetStateAction<LineInput[]>>
  setQtyErr: Dispatch<SetStateAction<number | null>>
  showExtraCost: boolean
  stockAllOf: (itemId: string) => number
  stockWhOf: (itemId: string) => number
  taxable: boolean
  toggleMyItem: (itemId: string, qty: number) => Promise<void>
  totalTd: ReactNode
  totals: { qty: number; supply: number; vat: number; extra: number; foreign: number; total: number; }
  updateLine: (idx: number, field: keyof LineInput, value: string | boolean) => void
}) {
  return (
    <>
        {/* ── 명세 그리드 (원본 #gridESD006Msubmain) ─────────── */}
        {/*
          품목명 열은 폭을 안 줘서 남는 자리만 받았다 — [불러온 전표No.] 같은 선택 열이 켜지면 60px 로
          줄어 🔍·× 단추가 자리를 다 먹고 <b>품목명이 안 보였다</b>(2026-10-01, 주문을 불러오다 발견).
          최소 200 을 주고, 열이 많아 넘치면 표를 가로로 굴린다.
        */}
        <div ref={gridRef} className="overflow-x-auto">
          <table className="ec-grid-input no-ec" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col className="w-[26px]" />
              <col className="w-[26px]" />
              <col className="w-[100px]" />
              <col className="w-[200px]" />
              <col className="w-[110px]" />
              {!lotAfterQty && <col className="w-[110px]" />}
              {cols.stockAll && <col className="w-[70px]" />}
              {cols.stockWh && <col className="w-[70px]" />}
              {cols.unit && <col className="w-[50px]" />}
              <col className="w-[78px]" />
              {lotAfterQty && lineLotCol && <col className="w-[110px]" />}
              <col className="w-[96px]" />
              {cols.priceVat && <col className="w-[95px]" />}
              <col className="w-[110px]" />
              <col className="w-[96px]" />
              {cols.lineTotal && <col className="w-[100px]" />}
              {showExtraCost && <col className="w-[96px]" />}
              {cols.mgmtItem && <col className="w-[90px]" />}
              {lineRemarkCol && <col className="w-[130px]" />}
              {lineDefs.map((d) => <col key={d.fieldKey} className="w-[110px]" />)}
              {cols.srcType && <col className="w-[80px]" />}
              {cols.srcDate && <col className="w-[100px]" />}
              {cols.srcNo && <col className="w-[120px]" />}
              {cols.qcRequest && <col className="w-[90px]" />}
              <col className="w-[30px]" />
            </colgroup>
            <thead>
              <tr>
                {/*
                  원본 그리드의 첫 두 열은 [행번호][⊕] 다 — **체크박스가 없다.**
                  선택은 행번호 칸을 눌러서 한다(엑셀 행머리와 같다). 선택삭제·일괄단가조정이
                  쓰는 checkedIdx 는 그대로라 기능은 하나도 안 바뀐다.
                */}
                <th
                  style={{ cursor: lineCount > 0 ? 'pointer' : 'default' }}
                  title="전체 선택 / 해제"
                  onClick={() => {
                    if (lineCount === 0) return
                    const all = checkedIdx.length === lineCount
                    setLines((ls) => ls.map((l) => (l.itemId ? { ...l, checked: !all } : l)))
                  }}
                >
                  {lineCount > 0 && checkedIdx.length === lineCount ? '☑' : ''}
                </th>
                <th title="My품목 담기/빼기">★</th>
                <th className="text-left">품목코드</th>
                <th className="text-left">품목명</th>
                <th className="text-left">규격</th>
                {/* 원본 실측: [시리얼/로트]는 가운데, 금액 칸들은 오른쪽이다. 값은 이미 오른쪽인데 머리만 안 따라갔다. */}
                {!lotAfterQty && <th className="text-center">시리얼/로트</th>}
                {cols.stockAll && <th>전체수량</th>}
                {cols.stockWh && <th>창고수량</th>}
                {cols.unit && <th>단위</th>}
                {/* 2026-10-20 원본 구매입력(E040303) 머리도 [수량] 이다(전엔 [기본수량] 으로 쟀다 — 지금 원본과 다르다). */}
                {/* 값은 이미 오른쪽인데 <b>머리만</b> 왼쪽이었다 — 삼항으로 적은 칸이라
                    이름으로 찾는 검사가 여태 이 칸을 아예 못 보고 있었다. */}
                <th className="text-right">수량</th>
                {/* 원본 판매입력은 [수량] 다음이 [시리얼/로트No.] 다(2026-10-14 실측). */}
                {lotAfterQty && lineLotCol && <th className="text-center">시리얼/로트No.</th>}
                <th className="text-right">{fx ? '단가(외화)' : '단가'}</th>
                {cols.priceVat && !fx && <th>단가(vat포함)</th>}
                {fx && <th className="text-right">외화금액</th>}
                {fx && <th className="text-right">환율</th>}
                <th className="text-right">{fx ? '원화금액' : '공급가액'}</th>
                {!fx && <th className="text-right">부가세</th>}
                {cols.lineTotal && <th className="text-right">합계</th>}
                {showExtraCost && <th className="text-right">부대비용</th>}
                {cols.mgmtItem && <th>관리항목</th>}
                {lineRemarkCol && <th className="text-left">적요</th>}
                {/* 라인 추가항목. 정의한 것만 열이 생긴다 — 안 쓰는 회사는 표가 그대로다. */}
                {lineDefs.map((d) => (
                  <th key={d.fieldKey} className="text-left">{d.label}</th>
                ))}
                {cols.srcType && <th>불러온 전표</th>}
                {cols.srcDate && <th>불러온 전표일자</th>}
                {cols.srcNo && <th className="text-left">불러온 전표No.</th>}
                {/* 원본 구매입력 격자의 [품질검사요청]. 켜고 저장하면 입고검사 요청이 생긴다. */}
                {cols.qcRequest && <th>품질검사요청</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemById.get(l.itemId)
                const needle = findText.trim().toLowerCase()
                const hit = !needle || `${it?.name ?? ''} ${it?.code ?? ''} ${l.remark}`.toLowerCase().includes(needle)
                return (
                  <tr
                    key={idx}
                    data-export-skip={l.itemId ? undefined : 'true'}
                    style={{
                      display: hit ? undefined : 'none',
                      background: l.checked && l.itemId ? 'var(--ec-warn-bg)' : undefined,
                    }}
                  >
                    {/* 행번호 칸 = 행머리. 원본처럼 회색이고, 눌러서 그 줄을 고른다. */}
                    <td
                      style={{
                        textAlign: 'center',
                        background: l.checked && l.itemId ? 'var(--ec-blue-light)' : 'var(--ec-report-stripe)',
                        color: l.checked && l.itemId ? 'var(--ec-blue-dark)' : 'var(--ec-text-hint)',
                        fontWeight: l.checked && l.itemId ? 700 : 400,
                        cursor: l.itemId ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                      title={l.itemId ? '눌러서 이 줄을 고릅니다' : undefined}
                      onClick={() => { if (l.itemId) updateLine(idx, 'checked', !l.checked) }}
                    >
                      {idx + 1}
                    </td>
                    {/* 원본 2열의 ⊕ 자리. 우리는 이 줄의 품목을 My품목에 담고 빼는 ★ 로 쓴다. */}
                    <td className="text-center">
                      {l.itemId && (
                        <button
                          type="button" className="no-ec"
                          title={myItems.some((m) => String(m.itemId) === l.itemId)
                            ? 'My품목에서 빼기' : 'My품목에 담기'}
                          style={{
                            border: 'none', background: 'none', cursor: 'pointer', padding: 0,
                            fontSize: 13, lineHeight: 1,
                            color: myItems.some((m) => String(m.itemId) === l.itemId) ? '#f0a500' : 'var(--ec-text-off)',
                          }}
                          onClick={() => void toggleMyItem(l.itemId, num(l.quantity))}
                        >
                          ★
                        </button>
                      )}
                    </td>
                    <td className="pad text-ec-label overflow-hidden whitespace-nowrap">
                      {it?.code ?? ''}
                    </td>
                    <td className="pad">
                      {l.itemId ? (
                        /* 원본 판매입력 · 구매입력: 품목을 고르면 품목명 칸이 글자 칸이 되어 줄마다 이름을 고쳐 쓴다. 고르기 전에는 검색 칸. */
                        <div className="flex">
                          <input className="cell" placeholder="품목 선택" value={l.name ?? it?.name ?? ''} maxLength={200}
                                 onChange={(e) => updateLine(idx, 'name', e.target.value)} />
                          <button type="button" className="no-ec border-0 bg-transparent cursor-pointer text-ec-hint" title="품목 다시 고르기"
                                  onClick={() => updateLine(idx, 'itemId', '')}><EcIcon name="search" /></button>
                        </div>
                      ) : (
                        <CodePickerField
                          label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                          value={l.itemId} onChange={(v) => updateLine(idx, 'itemId', v)}
                          items={codeItems}
                        />
                      )}
                    </td>
                    <td className="pad">
                      <input className="cell" value={l.spec ?? it?.spec ?? ''} maxLength={200} disabled={!l.itemId}
                             onChange={(e) => updateLine(idx, 'spec', e.target.value)} />
                    </td>
                    {!lotAfterQty && lotCell(l, idx)}
                    {cols.stockAll && (
                      <td className="pad text-right text-ec-hint">{l.itemId ? fmtNumber(stockAllOf(l.itemId)) : ''}</td>
                    )}
                    {cols.stockWh && (
                      <td className="pad text-right text-ec-hint">{l.itemId ? fmtNumber(stockWhOf(l.itemId)) : ''}</td>
                    )}
                    {cols.unit && <td className="pad text-center text-ec-label">{it?.unit ?? ''}</td>}
                    <td className="relative">
                      <EcNumInput className="cell text-right"
                             value={l.quantity} onValue={(v) => { if (qtyErr === idx) setQtyErr(null); updateLine(idx, 'quantity', v) }} />
                      {qtyErr === idx && <ErrTip msg="유효키항목 필수입력" />}
                    </td>
                    {lotAfterQty && lineLotCol && lotCell(l, idx)}
                    <td>
                      <EcNumInput className="cell text-right"
                             value={l.unitPrice} onValue={(v) => updateLine(idx, 'unitPrice', v)} />
                    </td>
                    {cols.priceVat && !fx && (
                      <td className="pad text-right text-ec-hint">
                        {l.itemId ? fmtNumber(Math.round(num(l.unitPrice) * (taxable ? 1.1 : 1))) : ''}
                      </td>
                    )}
                    {fx && (
                      <td className="pad text-right">
                        {l.itemId ? fxAmountOf(l).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : ''}
                      </td>
                    )}
                    {fx && (
                      <td>
                        <EcNumInput className="cell text-right" disabled={!l.itemId} aria-label="줄 환율"
                               value={l.itemId ? (l.lineRate || exchangeRate) : ''}
                               onValue={(v) => updateLine(idx, 'lineRate', v)} />
                      </td>
                    )}
                    <td className={fx ? 'pad text-right' : undefined}>
                      {fx ? (l.itemId ? fmtNumber(computed[idx].supply) : '') : (
                      <EcNumInput className="cell text-right" disabled={!l.itemId}
                             aria-label="공급가액"
                             value={l.itemId ? (overriddenSupply(l) != null ? l.supplyOverride : String(computed[idx].supply)) : ''}
                             onValue={(v) => setLines((ls) => ls.map((x, i) => (i === idx
                               ? { ...x, supplyOverride: v, supplyBase: `${num(x.quantity)}|${num(x.unitPrice)}` } : x)))} />
                      )}
                    </td>
                    {!fx && (
                    <td>
                      <EcNumInput className="cell text-right" disabled={!l.itemId || !taxable}
                             aria-label="부가세"
                             value={l.itemId ? (computed[idx].typedVat != null ? l.vatOverride : String(computed[idx].vat)) : ''}
                             onValue={(v) => setLines((ls) => ls.map((x, i) => (i === idx
                               ? { ...x, vatOverride: v, vatBase: String(computed[idx].supply) } : x)))} />
                    </td>
                    )}
                    {cols.lineTotal && (
                      <td className="pad text-right font-semibold text-ec-text">
                        {l.itemId ? fmtNumber(computed[idx].supply + computed[idx].vat) : ''}
                      </td>
                    )}
                    {showExtraCost && (
                      <td>
                        <EcNumInput className="cell text-right" disabled={!l.itemId}
                               value={l.extraCost} onValue={(v) => updateLine(idx, 'extraCost', v)} />
                      </td>
                    )}
                    {/* 관리항목은 품목 마스터에 붙는 값이라 라인에서는 읽기 전용이다(원본도 disabled). */}
                    {cols.mgmtItem && (
                      <td className="pad text-center text-ec-hint">
                        {it?.managementItemName ?? ''}
                      </td>
                    )}
                    {lineRemarkCol && (
                    <td>
                      <input className="cell" value={l.remark} disabled={!l.itemId}
                             onChange={(e) => updateLine(idx, 'remark', e.target.value)} />
                    </td>
                    )}
                    {lineDefs.map((d) => (
                      <td key={d.fieldKey}>
                        {/*
                          머리의 추가항목과 <b>같은 잣대로</b> 그린다. 예전에는 줄만 선택지가
                          채워졌는지를 봤는데, 정의 화면은 [코드] 형식일 때만 선택지를 받으므로
                          선택지를 안 채운 코드 필드가 <b>머리에선 드롭다운, 줄에선 글자 칸</b>이
                          됐다 — 같은 화면의 같은 필드가 위아래에서 다르게 굴었다.
                          원본도 사용자정의 칸은 치는 칸이 아니라 고르는 칸이다(사본 실측: 잠김 20/20).
                        */}
                        {d.fieldType === 'CODE' ? (
                          <select className="cell" value={l.custom[d.fieldKey] ?? ''} disabled={!l.itemId}
                                  onChange={(e) => setLineCustom(idx, d.fieldKey, e.target.value)}>
                            <option value=""></option>
                            {(d.options ?? '').split(',').map((o) => o.trim()).filter(Boolean)
                              .map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            className="cell" disabled={!l.itemId}
                            type={d.fieldType === 'NUMBER' ? 'number' : d.fieldType === 'DATE' ? 'date' : 'text'}
                            value={l.custom[d.fieldKey] ?? ''}
                            onChange={(e) => setLineCustom(idx, d.fieldKey, e.target.value)} />
                        )}
                      </td>
                    ))}
                    {/* 불러온 전표 3열은 읽기 전용이다 — 근거전표는 [전표불러오기]로만 붙는다. */}
                    {cols.srcType && (
                      <td className="pad text-center text-ec-hint">{l.sourceDocType}</td>
                    )}
                    {cols.srcDate && (
                      <td className="pad text-center text-ec-hint">{dateText(l.sourceDocDate)}</td>
                    )}
                    {cols.srcNo && (
                      <td className="pad text-ec-hint overflow-hidden text-ellipsis whitespace-nowrap">
                        {l.sourceDocNo}
                      </td>
                    )}
                    {cols.qcRequest && (
                      <td className="pad text-center">
                        <input type="checkbox" checked={l.qcRequest} disabled={!l.itemId}
                               onChange={(e) => updateLine(idx, 'qcRequest', e.target.checked)} />
                      </td>
                    )}
                    <td className="text-center">
                      {l.itemId && (
                        <button type="button" onClick={() => removeLine(idx)} className="no-ec"
                                style={{ border: 'none', background: 'none', color: '#c0c5cc', cursor: 'pointer' }}>
                          <EcIcon name="close" size={12} glyph="✕" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} />
                <td colSpan={lotAfterQty ? 3 : 4} className="pl-[6px]">{isAdjust ? '' : `합계 (${lineCount}건)`}</td>
                {cols.stockAll && <td />}
                {cols.stockWh && <td />}
                {cols.unit && <td />}
                <td className="text-right">{fmtNumber(totals.qty)}</td>
                {lotAfterQty && lineLotCol && <td />}
                <td />
                {cols.priceVat && !fx && <td />}
                {fx && <td className="text-right">{totals.foreign.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</td>}
                {fx && <td />}
                <td className="text-right">{fmtNumber(totals.supply)}</td>
                {!fx && <td className="text-right">{fmtNumber(totals.vat)}</td>}
                {cols.lineTotal && totalTd}
                {showExtraCost && <td className="text-right">{fmtNumber(totals.extra)}</td>}
                {/*
                  합계행은 헤더와 칸 수가 정확히 같아야 한다. 선택 열을 켜면 그만큼 빈 칸을 끼워야
                  숫자가 제 열 아래에 선다. (관리항목은 부대비용과 적요 사이, 불러온 전표 3열은 적요 뒤다.)
                */}
                {cols.mgmtItem && <td />}
                {/* 합계 열이 켜져 있으면 합계는 그 아래, 아니면 예전처럼 적요 칸에 선다. */}
                {lineRemarkCol && (cols.lineTotal ? <td /> : totalTd)}
                {lineDefs.map((d) => <td key={d.fieldKey} />)}
                {cols.srcType && <td />}
                {cols.srcDate && <td />}
                {cols.srcNo && <td />}
                {cols.qcRequest && <td />}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/*
          판매입력 II 격자 아래 금액조정 표(원본 #totalsum, 2026-10-13 실측). 할인을 [적용] 하기 전에는
          '거래별 부가세 합계' 한 줄, 적용하면 '할인 감소(-)' 와 '조정 후 합계' 가 붙는다.
        */}
        {isAdjust && (
          <table className="ec-grid mt-[6px] w-full">
            <thead>
              <tr>
                <th>금액조정항목명</th>
                <th className="w-[200px]">증감구분</th>
                <th className="w-[150px] text-right">공급가액</th>
                <th className="w-[150px] text-right">부가세</th>
                <th className="w-[150px] text-right">합계</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>거래별 부가세 합계</td>
                <td />
                <td className="text-right">{fmtNumber(totals.supply)}</td>
                <td className="text-right">{fmtNumber(totals.vat)}</td>
                <td className="text-right">{fmtNumber(totals.total)}</td>
              </tr>
              {discount.total > 0 && (
                <>
                  <tr>
                    <td>할인</td>
                    <td className="text-center">감소(-)</td>
                    <td className="text-right">{fmtNumber(discount.supply)}</td>
                    <td className="text-right">{fmtNumber(discount.vat)}</td>
                    <td className="text-right">{fmtNumber(discount.total)}</td>
                  </tr>
                  <tr>
                    <td>조정 후 합계</td>
                    <td />
                    <td className="text-right">{fmtNumber(net.supply)}</td>
                    <td className="text-right">{fmtNumber(net.vat)}</td>
                    <td className="text-right">{fmtNumber(net.total)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        )}
    </>
  )
}
