import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useItemFlags } from '../../utils/useInactiveItems'
import { stockCostMap } from '../../utils/stockValue'
import type { Item, PurchaseDoc } from '../../api/types'

/**
 * 회계 > 실제원가현황.
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 원가집계표 | 증가내역 | 감소내역 | 수율차이 | 노무비배부액 | 경비배부액
 *   기준월 · 품목 · 생산공정 · [기타] 결재방표시 · 수량관리제외품목포함 · 사용중단품목포함
 *
 * <p>[수량관리제외품목포함]은 품목이 재고수량관리를 들게 되면서 만들 수 있게 됐다.
 * 재고를 잡지 않는 품목(용역·운반비)에 원가를 매기는 것은 뜻이 없어 기본으로 뺀다.
 *
 * <p>원본 <b>원가집계표</b>의 열은 원가생성/수정 사본의 열 id 가 알려 준다 —
 * 품목코드 · 품목명[규격] · 품목구분 · 생산공정명 ·
 * 기초(B_QTY·B_PRICE·B_AMT) · 증가(I_*) · 감소(D_*) · 기말(L_*).
 * 즉 <b>수량·단가·금액의 기초 → 증가 → 감소 → 기말 롤포워드</b>다.
 *
 * <p>우리 화면은 품목별 실제재료비·노무비·경비 네 칸이 전부였다. 그 자료는 원가생성/수정에서
 * 넣고 차이분석에서 견주는 값이라 여기서 한 번 더 보여 줄 이유가 없었고, 정작 이 화면이
 * 답해야 할 <b>"이 달에 무엇이 얼마나 들어오고 나가서 얼마가 남았나"</b>는 없었다.
 *
 * <p>[구분] 여섯 중 셋만 만든다. 수율차이·노무비배부액·경비배부액은 배부 자료(공정별 노무비·
 * 경비와 배부기준)가 있어야 하는데 우리에겐 없다. 없는 값을 이름만 걸어 두면 화면이
 * 거짓말을 한다 — 자료가 생기면 그때 붙인다.
 *
 * <p>생산공정별로 가르지 않는 이유도 같다. 우리 재고는 창고 단위라 공정별 재공이 없다.
 */
type Mode = '원가집계표' | '증가내역' | '감소내역'
const MODES = ['원가집계표', '증가내역', '감소내역'] as const

interface MovementRow {
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  opening: number
  inQty: number
  outQty: number
  closing: number
}

interface LedgerRow {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseName: string
  type: 'INBOUND' | 'OUTBOUND'
  typeName: string
  quantityChange: number
  balanceAfter: number
  unitPrice: number | null
  transactionDate: string
  note: string | null
}

const num = (n: number) => n.toLocaleString('ko-KR')
const won = (n: number | null) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'))

/** 이번 달을 yyyy-MM 으로. 원본 [기준월]의 기본값이다. */
function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** yyyy-MM → 그 달의 첫날·마지막날. */
function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` }
}

export default function ActualCostPage() {
  const [mode, setMode] = useState<Mode>('원가집계표')
  const [period, setPeriod] = useState(thisMonth())
  const [keyword, setKeyword] = useState('')
  const [withInactive, setWithInactive] = useState(false)
  const [movement, setMovement] = useState<MovementRow[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { inactive, untracked } = useItemFlags()
  /**
   * 원본 조건 판 [기타]의 <b>수량관리제외품목포함</b>. 기본은 꺼져 있다 —
   * 재고를 잡지 않는 품목(용역·운반비)에 표준원가를 매기는 것은 뜻이 없어서,
   * 원본도 체크를 켜야 보여 준다.
   */
  const [withUntracked, setWithUntracked] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    const { from, to } = monthRange(period)
    try {
      const [mv, lg, it, pu] = await Promise.all([
        api.get<MovementRow[]>('/stock/movement', { params: { from, to } }),
        api.get<{ opening: number; rows: LedgerRow[] }>('/stock/ledger', { params: { from, to } }),
        api.get<Item[]>('/items'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setMovement(mv.data)
      setLedger(lg.data.rows)
      setItems(it.data)
      setPurchases(pu.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [period])

  /**
   * 단가는 재고자산평가와 <b>같은 규칙</b>(마지막 입고단가 → 품목 구매단가 → 모름).
   * 모르면 null 이다 — 0 으로 채우면 재고가 있는데 금액이 0 인 줄이 생겨,
   * 기말금액 합계가 조용히 작아진다.
   */
  const priceOf = useMemo(
    () => stockCostMap(items, purchases.map((d) => ({
      purchaseDate: d.purchaseDate,
      lines: (d.lines ?? []).map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice })),
    }))),
    [items, purchases],
  )

  const hit = (code: string, name: string, itemId: number) => {
    if (!withInactive && inactive.has(itemId)) return false
    if (!withUntracked && untracked.has(itemId)) return false
    if (!keyword) return true
    return code.includes(keyword) || name.includes(keyword)
  }

  const summary = useMemo(() => movement
    .filter((r) => hit(r.itemCode, r.itemName, r.itemId))
    .map((r) => {
      const price = priceOf.get(r.itemId) ?? null
      const amt = (q: number) => (price == null ? null : q * price)
      return { ...r, price, openAmt: amt(r.opening), inAmt: amt(r.inQty), outAmt: amt(r.outQty), closeAmt: amt(r.closing) }
    })
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode)),
  [movement, priceOf, keyword, withInactive, inactive, withUntracked, untracked])

  const detail = useMemo(() => ledger
    .filter((r) => (mode === '증가내역' ? r.quantityChange > 0 : r.quantityChange < 0))
    .filter((r) => hit(r.itemCode, r.itemName, r.itemId))
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : a.transactionDate > b.transactionDate ? -1 : b.id - a.id)),
  [ledger, mode, keyword, withInactive, inactive, withUntracked, untracked])

  const totals = summary.reduce((a, r) => ({
    open: a.open + (r.openAmt ?? 0), in: a.in + (r.inAmt ?? 0),
    out: a.out + (r.outAmt ?? 0), close: a.close + (r.closeAmt ?? 0),
    unknown: a.unknown + (r.price == null && (r.opening || r.inQty || r.outQty || r.closing) ? 1 : 0),
  }), { open: 0, in: 0, out: 0, close: 0, unknown: 0 })

  return (
    <EcListShell
      title="실제원가현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setPeriod(thisMonth()); setKeyword(''); setWithInactive(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          <div className="ec-pills">
            {MODES.map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="기준월" pick>
          <input className="ec-input" type="month" value={period}
                 onChange={(e) => setPeriod(e.target.value)} style={{ width: 150 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목코드·품명 일부" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단품목포함
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} />
            수량관리제외품목포함
          </label>
        </EcCond>
      </ul>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {mode === '원가집계표' ? (
        <div className="overflow-x-auto">
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ textAlign: 'right' }}>기초수량</th>
                <th style={{ textAlign: 'right' }}>기초금액</th>
                <th style={{ textAlign: 'right' }}>증가수량</th>
                <th style={{ textAlign: 'right' }}>증가금액</th>
                <th style={{ textAlign: 'right' }}>감소수량</th>
                <th style={{ textAlign: 'right' }}>감소금액</th>
                <th style={{ textAlign: 'right' }}>기말수량</th>
                <th style={{ textAlign: 'right' }}>단가</th>
                <th style={{ textAlign: 'right' }}>기말금액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : summary.map((r, i) => (
                <tr key={r.itemId}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                  <td>{r.itemName}</td>
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>{num(r.opening)}</td>
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.openAmt)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{num(r.inQty)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(r.inAmt)}</td>
                  <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(r.outQty)}</td>
                  <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(r.outAmt)}</td>
                  {/* 기말수량이 음수면 그 자체가 문제다. 0으로 감추면 아무도 못 본다. */}
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.closing < 0 ? '#c60a2e' : undefined }}>
                    {num(r.closing)}
                  </td>
                  <td style={{ textAlign: 'right', color: r.price == null ? '#c9ced6' : '#5a626e' }}>{won(r.price)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.closeAmt)}</td>
                </tr>
              ))}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                  <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({summary.length}품목)</td>
                  <td style={{ textAlign: 'right' }}>{won(totals.open)}</td>
                  <td></td>
                  <td style={{ textAlign: 'right' }}>{won(totals.in)}</td>
                  <td></td>
                  <td style={{ textAlign: 'right' }}>{won(totals.out)}</td>
                  <td colSpan={2}></td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                    {won(totals.close)}
                    {totals.unknown > 0 && (
                      <span title={`단가를 모르는 품목 ${totals.unknown}건은 금액에서 뺐습니다.`} style={{ color: '#c07a00' }}> *</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th style={{ width: 100 }}>일자</th>
                <th>품목코드</th>
                <th>품목명</th>
                <th>창고</th>
                <th style={{ textAlign: 'right' }}>수량</th>
                <th style={{ textAlign: 'right' }}>단가</th>
                <th style={{ textAlign: 'right' }}>금액</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
              ) : detail.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
              ) : detail.map((r, i) => {
                /* 거래에 단가가 남아 있으면 그것이 맞다 — 평가단가는 그 자리를 메우는 값일 뿐이다. */
                const price = r.unitPrice != null && r.unitPrice > 0 ? r.unitPrice : (priceOf.get(r.itemId) ?? null)
                const qty = Math.abs(r.quantityChange)
                return (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.transactionDate.replace(/-/g, '/')}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.warehouseName}</td>
                    <td style={{ textAlign: 'right' }}>{num(qty)} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.unit}</span></td>
                    <td style={{ textAlign: 'right', color: price == null ? '#c9ced6' : '#5a626e' }}>{won(price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(price == null ? null : qty * price)}</td>
                    <td style={{ color: '#5a626e' }}>{r.note ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
            {detail.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                  <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({detail.length}건)</td>
                  <td style={{ textAlign: 'right' }}>
                    {num(detail.reduce((n, r) => n + Math.abs(r.quantityChange), 0))}
                  </td>
                  <td></td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                    {won(detail.reduce((n, r) => {
                      const price = r.unitPrice != null && r.unitPrice > 0 ? r.unitPrice : (priceOf.get(r.itemId) ?? null)
                      return n + (price == null ? 0 : Math.abs(r.quantityChange) * price)
                    }, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </EcListShell>
  )
}
