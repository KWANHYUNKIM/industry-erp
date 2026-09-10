import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockRow, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { stockCostMapFromLast } from '../../utils/stockValue'
import CodePickerField from '../../components/CodePickerField'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { periodOf } from '../../components/EcPeriodPicks'
import { useItemFlags } from '../../utils/useInactiveItems'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 재고 > 재고잔량분석표 (이카운트 E040727)
 * 현재고를 품목별로 집계해 안전재고 대비 과부족·상태와 재고금액(수량×단가)을 분석한다.
 * 데이터는 GET /api/stock(현재고) + GET /api/items(단가) 를 조인(백엔드 무변경).
 * 재고금액은 <b>취득원가</b>로 평가한다 — 실제 입고단가가 있으면 그것, 없으면 품목 구매단가.
 * 예전에는 판매단가(Item.unitPrice)로 평가해서 아직 팔지도 않은 이익이 재고에 얹혔다
 * (개발 자료에서 1억 8,457만 vs 3,490만, 5배 차이). 기준이 없으면 0 이 아니라 평가에서 뺀다.
 *
 * 원본 조건: 기준일자(한 날짜) · 품목 · 기타(재고수량0포함 / 수량관리제외품목포함 /
 * 사용중단품목포함 / 품목별안전재고설정미만표시).
 * 재고현황과 같이 <b>기준일자가 한 날짜</b>다 — 재고는 시점을 보는 것이라서 빠른선택도 금일·전일뿐이다.
 *
 * 원본에는 창고 조건이 없다(품목별로 전 창고를 합쳐 보는 분석표라서). 우리는 창고 조건이
 * 이미 있고 실제로 동작하므로 남긴다 — 원본에 없다고 되는 기능을 빼지는 않는다.
 *
 * <p>[기준일자]는 이제 <b>실제로 조회에 쓴다</b>. 예전에는 칸만 두고 무시했다 —
 * 날짜를 바꿔도 늘 현재고가 나왔다. 조건이 있으면 사람은 그 값이 반영된 줄 안다.
 * 서버가 현재고에서 그 뒤의 입출고를 빼서 그 시점 재고를 낸다(GET /stock?asOf=).
 */

interface AnalysisRow {
  itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  quantity: number; safetyStock: number; unitPrice: number; value: number
  whCount: number
}

const won = (n: number) => n.toLocaleString('ko-KR')

/** 원본 [정렬/소계기준] 의 축 — 팝업을 못 열어 후보를 못 쟀으므로 <b>우리가 거르는 축</b>만 둔다. */
const SUBTOTALS = ['없음', '품목구분', '품목그룹1'] as const

export default function StockAnalysisPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [warehouseId, setWarehouseId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [shortageOnly, setShortageOnly] = useState(false)
  /** 원본 '재고수량0포함' — 기본은 0 인 품목을 뺀다(분석표에 0 만 잔뜩 뜨면 못 읽는다). */
  const [includeZero, setIncludeZero] = useState(false)
  /** 재고 평가에 쓸 구매전표. 마지막 입고단가를 여기서 뽑는다. */
  /*
   * 원본 재고잔량분석표(E040727) [기타]는 <b>넷</b>이다(2026-09-02 실측):
   * 재고수량0포함 · <b>수량관리제외품목포함</b> · <b>사용중단품목포함</b> ·
   * 품목별안전재고설정미만표시. 우리에겐 첫째와 넷째뿐이었다 —
   * 재고현황·재고변동표·창고별재고현황에 이어 <b>네 번째 같은 구멍</b>이다.
   */
  const [withUntracked, setWithUntracked] = useState(false)
  /*
   * <b>[사용중단품목포함]은 기본이 켜짐이다</b>(2026-09-09 원본 실측). 우리는 꺼짐으로
   * 두고 있었다 — 그러면 <b>안 쓰기로 한 품목의 재고가 화면에서 사라진다.</b>
   * 창고에 그 물건이 그대로 쌓여 있는데도 잔량 분석에서 빠지니, 실사와 숫자가 어긋난다.
   * 원본이 굳이 켜 두는 까닭이 그것이다.
   */
  const [withInactive, setWithInactive] = useState(true)
  /* 품목의 [수량관리]·[사용여부] 는 품목 마스터가 든다 — 재고 줄에는 없어 따로 받는다. */
  const { inactive, untracked } = useItemFlags()
  const [buys, setBuys] = useState<{ itemId: number; unitPrice: number }[]>([])
  /* 원본 재고잔량분석표의 기준일자 기본값은 [금일] 이다(사본 실측). */
  /*
   * 원본 조건 <b>[품목구분]·[품목그룹1]</b>(2026-09-09 실측 — [품목] 바로 뒤에 선다).
   * 품목 마스터는 이 화면이 이미 통째로 받아 두고 있는데(<code>items</code>) 그 값으로
   * 거를 자리가 없었다. 재고 분석은 "원재료만" · "이 그룹만" 으로 보는 일이 잦다.
   */
  const [category, setCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  /*
   * 원본 조건 <b>[정렬/소계기준]</b>. 앞 바퀴에 '아직 안 만든 것' 으로 적어 두었던 자리다.
   *
   * <p>원본에서 이 줄은 <b>[설정] 링크 하나</b>라, 고를 수 있는 축이 무엇인지는 그 팝업을
   * 열어야 보인다 — <b>아직 못 쟀다.</b> 그래서 축은 <b>우리가 아는 것</b>으로만 둔다:
   * 이 화면이 이미 거르는 [품목구분]·[품목그룹1]. 지어낸 축은 넣지 않는다.
   * 소계 없이 보려면 [없음] 이다.
   */
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('없음')
  const [date, setDate] = useState(periodOf('금일')!.to)
  /**
   * 원본 격자의 마지막 열 <b>[미판매]</b>.
   *
   * <p><b>2026-09-09 원본에서 뜻을 가렸다.</b> 머리만 재 두고 그 칸이 수량인지 금액인지
   * 몰라 비워 두고 있었는데, 자료 줄을 읽어 <b>미판매현황(E040212)과 맞춰 봤다</b> —
   * 재고잔량분석표의 [미판매]가 AQD 19 · AQD 컨트롤러 4 · AQD 실외 온습도 센서 1 ·
   * AQD 펌프 4 였고, 미판매현황의 [미판매수량]이 AQD 3+16=19 · 4 · 1 · 4 로
   * <b>글자까지 같았다</b>. 즉 <b>그 품목의 미판매수량 합</b>이다(금액이 아니다).
   * 정렬도 실측대로 <b>우</b>다.
   *
   * <p>287줄 중 값이 있는 줄은 <b>넷뿐</b>이었다 — 수주가 남아 있는 품목만 찍힌다.
   */
  const [unsold, setUnsold] = useState<{ itemId: number; unsoldQty: number }[]>([])
  const unsoldByItem = useMemo(() => {
    const m = new Map<number, number>()
    for (const u of unsold) m.set(u.itemId, (m.get(u.itemId) ?? 0) + u.unsoldQty)
    return m
  }, [unsold])
  const today = ymd(new Date())

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, i, w, b, u] = await Promise.all([
        api.get<StockRow[]>('/stock', { params: { asOf: date } }),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        /*
         * <b>마지막 입고단가만 받는다.</b> 평가단가 지도 하나를 만들려고 구매 전표를
         * 통째로 받고 있었다(2026-09-10 실측 984KB · 이 화면 합계 2,205KB).
         */
        api.get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices'),
        /*
         * 원본 [미판매]. 기간을 안 건다 — 아래 실측대로 <b>아직 열려 있는 수주 잔량 전부</b>다.
         */
        api.get<{ itemId: number; unsoldQty: number }[]>('/sales-orders/unsold'),
      ])
      setStocks(s.data); setItems(i.data); setWarehouses(w.data); setBuys(b.data)
      setUnsold(u.data)
    } catch (err) { setError(extractErrorMessage(err)); setStocks([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const priceById = useMemo(() => stockCostMapFromLast(items, buys), [items, buys])

  /** 품목 마스터를 id 로 찾는다 — [품목구분]·[품목그룹1] 이 이 값을 쓴다. */
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const rows = useMemo(() => {
    const wid = warehouseId ? Number(warehouseId) : null
    const m = new Map<number, AnalysisRow>()
    for (const s of stocks) {
      if (wid != null && s.warehouseId !== wid) continue
      let a = m.get(s.itemId)
      if (!a) {
        a = { itemId: s.itemId, itemCode: s.itemCode, itemName: s.itemName, spec: s.spec, unit: s.unit,
          quantity: 0, safetyStock: s.safetyStock, unitPrice: priceById.get(s.itemId) ?? 0, value: 0, whCount: 0 }
        m.set(s.itemId, a)
      }
      a.quantity += s.quantity
      if (s.quantity > 0) a.whCount += 1
    }
    const kw = keyword.trim()
    const out = [...m.values()]
    for (const a of out) a.value = a.quantity * a.unitPrice
    return out
      /* [포함] 이라 이름 붙은 것은 기본이 '안 넣음' 이다 — 켜야 보인다. */
      .filter((a) => withUntracked || !untracked.has(a.itemId))
      .filter((a) => withInactive || !inactive.has(a.itemId))
      .filter((a) => !kw || a.itemName.includes(kw) || a.itemCode.includes(kw))
      .filter((a) => !category || (itemById.get(a.itemId)?.categoryName ?? '') === category)
      .filter((a) => !itemGroup || (itemById.get(a.itemId)?.itemGroupName ?? '') === itemGroup)
      .filter((a) => !shortageOnly || a.quantity < a.safetyStock)
      // 원본 '재고수량0포함' — 끄면 0 인 품목을 뺀다. 0 만 잔뜩 뜨면 분석표를 읽을 수 없다.
      .filter((a) => includeZero || a.quantity !== 0)
      .sort((a, b) => b.value - a.value)
  }, [stocks, priceById, warehouseId, keyword, category, itemGroup, itemById, shortageOnly, includeZero, withUntracked, withInactive, untracked, inactive])

  const reset = () => {
    setWarehouseId(''); setKeyword(''); setShortageOnly(false); setIncludeZero(false)
    setWithUntracked(false); setWithInactive(true); setCategory(''); setItemGroup('')
    setSubtotal('없음'); setDate(today)
  }

  const totals = useMemo(() => ({
    count: rows.length,
    value: rows.reduce((s, r) => s + r.value, 0),
    shortage: rows.filter((r) => r.quantity < r.safetyStock).length,
  }), [rows])


  return (
    <EcListShell
      title="재고잔량분석표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        single
        from={date} to={date}
        onPeriod={(r) => setDate(r.from)}
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
        picks={STOCK_PICKS}
      >
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={keyword} onChange={(v) => setKeyword(v)}
                           items={pickers.items} />
        </EcCond>
        {/*
          원본 차례는 <b>품목 · 품목구분 · 품목그룹1(2·3) · 품목계층그룹 · 기타 · 창고 ·
          창고계층그룹</b> 이다(2026-09-09 실측). 우리는 [창고]를 [기타] 앞에 두고 있었다.
        */}
        <EcCond label="품목구분">
          <select className="ec-input" value={category} style={{ width: 130 }}
                  onChange={(e) => setCategory(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(items.map((i) => i.categoryName).filter(Boolean))].sort()
              .map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1">
          <select className="ec-input" value={itemGroup} style={{ width: 150 }}
                  onChange={(e) => setItemGroup(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(items.map((i) => i.itemGroupName).filter((v): v is string => !!v))].sort()
              .map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        {/* 원본 [기타] 차례 그대로다(2026-09-02 E040727 실측). [결재방표시]는 인쇄 판이라 아직 없다. */}
        <EcCond label="기타">
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={includeZero}
                   onChange={(e) => setIncludeZero(e.target.checked)} /> 재고수량0포함
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={withUntracked}
                   onChange={(e) => setWithUntracked(e.target.checked)} /> 수량관리제외품목포함
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={withInactive}
                   onChange={(e) => setWithInactive(e.target.checked)} /> 사용중단품목포함
          </label>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={shortageOnly}
                   onChange={(e) => setShortageOnly(e.target.checked)} /> 품목별안전재고설정미만표시
          </label>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} value={warehouseId} onChange={setWarehouseId}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </EcCond>
      </EcStatusPanel>

      {date !== today && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          지금 보는 것은 <b>기준일자 시점의 재고</b>입니다. 현재고에서 그 뒤의 입출고를 빼서 냅니다.
          숫자가 달라지지 않습니다.
        </p>
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        품목 <b style={{ color: '#3c4553', fontSize: 14 }}>{won(totals.count)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        미달 <b style={{ color: '#c60a2e', fontSize: 14 }}>{won(totals.shortage)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        재고금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.value)}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/*
              <b>재고잔량분석표(E040727) 2026-09-09 원본 격자 실측</b>(자료 287줄).
              원본 머리는 <b>두 줄</b>이다 —
              위: [품목코드 · 품목명[규격] · 재고수량 · <b>재고수량현황</b>(5칸) · <b>미판매</b>],
              아래: 재고수량현황 밑에 [9월 · 8월 · 7월 · 6월 · 기타].
              즉 <b>지금 있는 재고가 언제 들어온 것인지</b>를 최근 넉 달로 갈라 보여 준다
              (달 이름은 [기준일자]에 따라 움직인다). 우리 표에는 그 다섯 칸과 [미판매]가
              없다 — pending-columns.json 에 적었다.
              <b>[미판매]는 2026-09-09 에 만들었다</b> — 무엇을 세는 칸인지 몰라 비워 두었는데,
              미판매현황과 자료를 맞춰 <b>그 품목의 미판매수량 합</b>임을 가렸다(위 상태 주석).
              재고수량현황 다섯 칸은 아직 없다 — 재고가 <b>언제 들어온 것인지</b>를 알려면
              입고 레이어를 쌓아야 하는데 우리 재고는 수량 하나로만 든다.
              고친 둘: 품목명과 규격을 <b>한 칸</b>으로 합쳤고(원본은 대괄호로 붙인다),
              [현재고]를 <b>[재고수량]</b> 으로 맞췄다 — 재고현황·재고변동표와 같은 이름이다.
              [단위]·[안전재고]·[과부족]·[상태]·[단가]·[재고금액]은 우리 열이다.
            */}
            <th>품목코드</th>
            <th>품목명[규격]</th>
            <th style={{ textAlign: 'center', width: 46 }}>단위</th>
            <th style={{ textAlign: 'right' }}>재고수량</th>
            <th style={{ textAlign: 'right' }}>안전재고</th>
            <th style={{ textAlign: 'right' }}>과부족</th>
            <th style={{ textAlign: 'center', width: 60 }}>상태</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>재고금액</th>
            <th style={{ width: 90, textAlign: 'right' }}>미판매</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {stocks.length === 0 ? '재고 자료가 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : rows.map((r, i) => {
            const diff = r.quantity - r.safetyStock
            const short = r.quantity < r.safetyStock
            return (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                {/* 원본은 규격을 품목명 뒤 대괄호에 붙인다. */}
                <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(r.quantity)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.safetyStock)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: diff < 0 ? '#c60a2e' : '#1c7c3c' }}>{diff > 0 ? '+' : ''}{won(diff)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: short ? '#fdecec' : '#eaf6ec', color: short ? '#c60a2e' : '#1c7c3c', padding: '1px 7px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{short ? '부족' : '적정'}</span>
                </td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.unitPrice)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.value)}</td>
                {/* 수주가 남은 품목만 찍는다 — 0 을 찍으면 287줄이 전부 0 으로 덮인다(원본도 비운다). */}
                <td style={{ textAlign: 'right', color: '#a5561b' }}>
                  {unsoldByItem.get(r.itemId) ? won(unsoldByItem.get(r.itemId)!) : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={9} style={{ textAlign: 'right' }}>재고금액 합계</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.value)}</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>
                {won(rows.reduce((n, r) => n + (unsoldByItem.get(r.itemId) ?? 0), 0))}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {subtotal !== '없음' && rows.length > 0 && (() => {
        /* 소계 축은 품목 마스터의 값이라 줄에서 바로 못 읽는다 — id 로 되짚는다. */
        const keyOf = (r: AnalysisRow) => {
          const it = itemById.get(r.itemId)
          return (subtotal === '품목구분' ? it?.categoryName : it?.itemGroupName) || ''
        }
        const groups = subtotalBy(rows, keyOf, {
          qty: (r) => r.quantity, value: (r) => r.value,
        })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>품목수</th>
                <th style={{ width: 130, textAlign: 'right' }}>재고수량</th>
                <th style={{ width: 150, textAlign: 'right' }}>재고금액</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{won(g.sums.qty)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue)' }}>
                      {won(g.sums.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
