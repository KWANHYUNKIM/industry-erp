import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Lot, StockRow } from '../../types/api'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import EcDateInput from '../../components/ui/EcDateInput'

/**
 * 재고 II > 시리얼/로트No. > 품목vs시리얼재고수량비교 (이카운트 E041018)
 * 품목 재고(창고 합계)와 그 품목의 시리얼/로트 재고 합계를 품목마다 나란히 놓는다.
 *
 * <p>원본(2026-10-14 loginaa 실측):
 * 조건 [비교기준] 시리얼/로트No.(기본) · 품목 — 시리얼/로트No. 면 로트 수량이 있는 품목만, 품목이면 품목 수량이 있는 품목만 찍는다
 * (A001 1,597.00 | -1.00 | 1,598.00 은 둘 다, A003 5,373.00 | (빈칸) 은 품목 기준에만, F001 (빈칸) | 6.00 은 시리얼 기준에만).
 * [기준일자] 금일 · [품목]. 격자 품목코드 · 품목명 · 규격 · 품목별수량 · 시리얼/로트수량 · 수량차이(= 품목 − 시리얼), 품목코드 차례,
 * 0 은 빈칸, 끝에 '합계'(세 칸을 묶음) 줄. 아래 단추 인쇄 · Excel.
 * 내역입력 구매 2(QA재고2-L02) → 시리얼/로트수량 +2 · 품목별수량 그대로 · 합계 325 → 327.
 */
interface Row {
  itemId: number
  itemCode: string
  itemName: string
  spec: string
  itemStock: number
  lotStock: number
}

const qty2 = (n: number) => (n ? n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
const BASES = ['시리얼/로트No.', '품목'] as const

export default function LotStockComparePage() {
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [base, setBase] = useState<typeof BASES[number]>('시리얼/로트No.')
  /* [기준일자] — 그 날 시점으로 품목 · 로트를 같이 되돌린다(한쪽만 되돌리면 없는 차이가 생긴다). 빈칸 = 금일. */
  const [asOf, setAsOf] = useState('')
  const [item, setItem] = useState('')
  /* [창고] — 대조표(ecount-form-fields)에 있는 조건. 고르면 그 창고의 품목 재고 · 로트만 다시 센다(창고 없는 로트는 빠진다). */
  const [warehouse] = useState('') // 원본 조건에 창고 없음(2026-10-21 실측)
  const pickers = useCondPickers(['items'])

  async function load() {
    setLoading(true); setError('')
    try {
      const params = asOf ? { asOf } : {}
      const [s2, l] = await Promise.all([
        api.get<StockRow[]>('/stock', { params }),
        api.get<Lot[]>('/lots', { params }),
      ])
      setStocks(s2.data); setLots(l.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [asOf])

  const rows = useMemo<Row[]>(() => {
    const map = new Map<number, Row>()
    const ensure = (itemId: number, code: string, name: string, spec: string | null): Row => {
      let r = map.get(itemId)
      if (!r) { r = { itemId, itemCode: code, itemName: name, spec: spec ?? '', itemStock: 0, lotStock: 0 }; map.set(itemId, r) }
      return r
    }
    const keep = (id: number | null) => !warehouse || String(id) === warehouse
    for (const lot of lots) if (keep(lot.warehouseId)) ensure(lot.itemId, lot.itemCode, lot.itemName, lot.spec).lotStock += Number(lot.stockQty)
    for (const st of stocks) if (keep(st.warehouseId)) ensure(st.itemId, st.itemCode, st.itemName, st.spec).itemStock += Number(st.quantity)
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    return [...map.values()]
      .filter((r) => (base === '품목' ? r.itemStock !== 0 : r.lotStock !== 0))
      .sort((a, b) => cmp(a.itemCode, b.itemCode))
  }, [stocks, lots, base, warehouse])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (kw && !r.itemName.includes(kw) && !r.itemCode.includes(kw)) return false
      if (item && String(r.itemId) !== item) return false
      return true
    })
  }, [rows, keyword, item])

  const total = useMemo(() => shown.reduce((t, r) => ({ item: t.item + r.itemStock, lot: t.lot + r.lotStock }), { item: 0, lot: 0 }), [shown])

  return (
    <EcListShell
      title="품목vs시리얼재고수량비교"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '인쇄' }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        {/* 원본 조건 차례: 비교기준 · 기준일자 · 품목 */}
        <EcCond label="비교기준">
          {BASES.map((b) => (
            <label key={b} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="lot-compare-base" checked={base === b} onChange={() => setBase(b)} /> {b}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <div className="flex items-center gap-[6px] flex-wrap">
            <EcDateInput className="ec-input w-[150px]" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} />
          </div>
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        {/* 원본 [양식] 탭(2026-10-21 실측): 적용양식 [기본(수정불가)] · 양식구분 [결재방표시] · 정렬/소계기준 [설정] — 모양만. */}
        <EcCond label="적용양식">
          <select className="ec-input w-[170px]" aria-label="적용양식" defaultValue="기본"><option value="기본">기본(수정불가)</option></select>
        </EcCond>
        <EcCond label="양식구분">
          <label className="inline-flex items-center gap-[3px]"><input type="checkbox" /> 결재방표시</label>
        </EcCond>
        <EcCond label="정렬/소계기준">
          <button type="button" className="ec-btn">설정</button>
        </EcCond>
      </ul>

      {/* 원본 격자는 출력물 꼴 — 머리 12px 700 · 27.6(6px 3px 3px) · 본문 24.1(3px) · 합계 회색(243 · 243 · 243) 700(2026-10-14 실측). */}
      <table className="ec-report w-full text-left">
        <thead>
          <tr>
            {/* 머리는 전역 규칙으로 가운데(원본 머리 가운데 · 700) — 정렬 클래스는 칸과 같게 둔다. */}
            <th>품목코드</th>
            <th>품목명</th>
            <th>규격</th>
            <th className="text-right">품목별수량</th>
            <th className="text-right">시리얼/로트수량</th>
            <th className="text-right">수량차이</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.itemId}>
              <td>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td>{r.spec}</td>
              <td className="text-right">{qty2(r.itemStock)}</td>
              <td className="text-right">{qty2(r.lotStock)}</td>
              <td className="text-right">{qty2(r.itemStock - r.lotStock)}</td>
            </tr>
          ))}
        </tbody>
        {!loading && shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} className="text-center">합계</td>
              <td className="text-right">{qty2(total.item)}</td>
              <td className="text-right">{qty2(total.lot)}</td>
              <td className="text-right">{qty2(total.item - total.lot)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
