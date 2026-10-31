import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../../api/client'
import type { Item, StockRow, Warehouse } from '../../../types/api'
import EcListShell from '../../../components/EcListShell'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import EcStatusPanel, { EcCond } from '../../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../../components/EcReportFrame'
import { useCondPickers } from '../../../utils/useCondPickers'
import { periodOf } from '../../../components/EcPeriodPicks'
import { useItemFlags } from '../../../utils/useInactiveItems'
import { subtotalBy } from '../../../utils/subtotalBy'

/**
 * 재고 I &gt; 출력물 &gt; 재고현황 &gt; <b>재고잔량분석표</b>(E040727) — 2026-10-13 loginaa 원본 실측(자료 든 판, 52품목).
 *
 * <p>조건: 기준일자(한 날짜, 금일 · 전일) · 품목(▾ 를 펼치면 품목구분 · 품목그룹1~3 · 품목계층그룹) · 기타(재고수량0포함 / 수량관리제외품목포함 / <b>사용중단품목포함</b>(켜짐) /
 * 품목별안전재고설정미만표시) · ⌄ 를 펼치면 <b>창고</b> · 양식(적용양식 · 결재방표시 · 정렬/소계기준 '설정').
 * 우리는 품목구분 · 품목그룹1 · 정렬/소계기준(없음 · 품목구분 · 품목그룹1)을 둔다 — 정렬/소계기준 팝업의 후보는 아직 못 쟀다.
 *
 * <p>격자(출력물): [회사명 · 기준일자] 머리 아래 품목코드 · 품목명[규격] · <b>재고수량</b>(파란 링크 → 그 품목 재고수불부) ·
 * <b>재고수량현황</b>(기준일자의 달부터 넉 달 + 기타) · <b>미판매</b>(파란 링크). 열 폭 200 / 450 / 100 / 100×5 / 100,
 * 머리 400 · 바탕 (247,248,249). 음수 재고 칸은 분홍 (242,222,222). 맨 끝 [합계] — 앞 두 칸 합쳐 가운데, 700 · 회색 243.
 * 숫자는 소수 둘째 자리(1,597.00), 0 인 달 칸은 비운다.
 *
 * <p><b>재고수량현황 — 지금 재고가 언제 들어온 것인가.</b> 원본을 원장과 맞춰 가렸다(H001 비밀의정원):
 * 재고 919 · 10월 입고 900 · 9월 입고 100 → 표는 10월 900 · 9월 19. 즉 <b>최근 달의 입고부터 거슬러 채우고</b>(그 달 입고만큼까지)
 * 넉 달을 넘는 몫은 [기타]다. A001 270 + 180 + 180 + 180 + 787 = 1,597 처럼 다섯 칸의 합이 재고수량이다.
 * 재고가 0 이하이면 통째로 이번 달 칸에 둔다(G002 -650 → 10월 -650).
 * 입고는 재고수불부의 입고수량(수량이 늘어난 줄)이다. 창고 전체로 볼 때는 창고이동(적요 '창고이동…')을 뺀다 —
 * 회사 밖에서 들어온 것이 아니라 창고끼리 옮긴 것이라서(원본에서 창고이동이 든 품목으로는 못 가렸다).
 *
 * <p>[미판매]는 그 품목의 열린 수주 잔량 합(미판매현황의 미판매수량과 같다 — 2026-09-09 가림).
 */

interface AnalysisRow {
  itemId: number; itemCode: string; itemName: string; spec: string | null
  quantity: number; months: number[]; etc: number
}
type LedgerRow = { itemId: number; quantityChange: number; transactionDate: string; note: string | null }

/** 원본 [정렬/소계기준] 의 축 — 팝업을 못 열어 후보를 못 쟀으므로 <b>우리가 거르는 축</b>만 둔다. */
const SUBTOTALS = ['없음', '품목구분', '품목그룹1'] as const

const n2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 0 인 칸은 비운다(원본 달 칸 · 미판매). */
const blank0 = (n: number) => (n ? n2(n) : '')

/** 기준일자의 달부터 거슬러 넉 달 — [{ym:'2026-10', label:'10월'}, …]. */
function monthsBack(date: string) {
  const [y, m] = date.split('-').map(Number)
  return [0, 1, 2, 3].map((k) => {
    const d = new Date(y, m - 1 - k, 1)
    return { ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${d.getMonth() + 1}월` }
  })
}

export default function StockAnalysisPage() {
  const navigate = useNavigate()
  const pickers = useCondPickers(['items'])
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [warehouseId, setWarehouseId] = useState('')
  // 품목 코드도움은 id 를 준다 — 이름이 같은 품목이 정상이라서다.
  const [itemCond, setItemCond] = useState('')
  const [shortageOnly, setShortageOnly] = useState(false)
  /** 원본 '재고수량0포함' — 기본은 0 인 품목을 뺀다. */
  const [includeZero, setIncludeZero] = useState(false)
  const [withUntracked, setWithUntracked] = useState(false)
  /** [사용중단품목포함]은 기본이 켜짐이다(원본 실측) — 끄면 안 쓰기로 한 품목의 재고가 사라진다. */
  const [withInactive, setWithInactive] = useState(true)
  const { inactive, untracked } = useItemFlags()
  const [category, setCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('없음')
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const [date, setDate] = useState(periodOf('금일')!.to)
  /** 화면에 그린 기준일자 — 검색을 눌러야 표가 그 날로 바뀐다. */
  const [shownDate, setShownDate] = useState(date)
  const [unsold, setUnsold] = useState<{ itemId: number; unsoldQty: number }[]>([])
  const unsoldByItem = useMemo(() => {
    const m = new Map<number, number>()
    for (const u of unsold) m.set(u.itemId, (m.get(u.itemId) ?? 0) + Number(u.unsoldQty))
    return m
  }, [unsold])
  const today = ymd(new Date())
  const months = useMemo(() => monthsBack(shownDate), [shownDate])

  async function load() {
    setLoading(true); setError('')
    try {
      const first = `${monthsBack(date)[3].ym}-01`
      const [s, i, w, u, l] = await Promise.all([
        api.get<StockRow[]>('/stock', { params: { asOf: date } }),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
        /* 원본 [미판매] — 기간을 안 건다. 아직 열려 있는 수주 잔량 전부다. */
        api.get<{ itemId: number; unsoldQty: number }[]>('/sales-orders/unsold'),
        /* 재고수량현황 — 넉 달치 입고. */
        api.get<{ rows: LedgerRow[] }>('/stock/ledger', { params: { from: first, to: date, warehouseId: warehouseId || undefined, all: true } }),
      ])
      setStocks(s.data); setItems(i.data); setWarehouses(w.data); setUnsold(u.data); setLedger(l.data.rows)
      setShownDate(date)
    } catch (err) { setError(extractErrorMessage(err)); setStocks([]) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  /** 품목 × 달 → 그 달 입고 합. */
  const inByItemMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of ledger) {
      const q = Number(r.quantityChange)
      const note = r.note ?? ''
      if (!warehouseId && note.startsWith('창고이동')) continue
      /*
       * 되돌림 줄('판매삭제 원복 SO-…' · '생산입고취소 PI-…') — 원본 수불부에는 지운 전표가 아예 없다.
       * 양수 되돌림은 출고를 되돌린 것이라 입고가 아니고, 음수 되돌림은 입고를 되돌린 것이라 그 달 입고에서 뺀다
       * (StockFifoService.isRevert 와 같은 판정). ITM-0003: 7월 생산입고 50 + 10월 판매삭제 원복 +1 ×2 → 7월 50.
       */
      const revert = /(원복|취소)$/.test(note.replace(/\s*[A-Z]{1,4}-\d{8}-\d+.*$/, '').trim())
      if (revert ? !(q < 0) : !(q > 0)) continue
      const k = `${r.itemId}|${r.transactionDate.slice(0, 7)}`
      m.set(k, (m.get(k) ?? 0) + q)
    }
    return m
  }, [ledger, warehouseId])

  const rows = useMemo(() => {
    const wid = warehouseId ? Number(warehouseId) : null
    const m = new Map<number, AnalysisRow>()
    const safety = new Map<number, number>()
    for (const s of stocks) {
      if (wid != null && s.warehouseId !== wid) continue
      let a = m.get(s.itemId)
      if (!a) {
        a = { itemId: s.itemId, itemCode: s.itemCode, itemName: s.itemName, spec: s.spec, quantity: 0, months: [0, 0, 0, 0], etc: 0 }
        m.set(s.itemId, a)
        safety.set(s.itemId, Number(s.safetyStock) || 0)
      }
      a.quantity += Number(s.quantity)
    }
    /* [재고수량0포함]을 켜면 재고 줄이 한 번도 없던 품목까지 0 으로 나온다(원본 2026-10-03 실측 52 → 73품목). */
    if (includeZero) {
      for (const it of items) {
        if (m.has(it.id)) continue
        m.set(it.id, { itemId: it.id, itemCode: it.code, itemName: it.name, spec: it.spec, quantity: 0, months: [0, 0, 0, 0], etc: 0 })
        safety.set(it.id, it.safetyStock ?? 0)
      }
    }
    for (const a of m.values()) {
      if (a.quantity <= 0) { a.months[0] = a.quantity; continue }
      let left = a.quantity
      months.forEach((mo, k) => {
        const take = Math.min(left, Math.max(0, inByItemMonth.get(`${a.itemId}|${mo.ym}`) ?? 0))
        a.months[k] = take
        left -= take
      })
      a.etc = left
    }
    return [...m.values()]
      /* [포함] 이라 이름 붙은 것은 기본이 '안 넣음' 이다 — 켜야 보인다. */
      .filter((a) => withUntracked || !untracked.has(a.itemId))
      .filter((a) => withInactive || !inactive.has(a.itemId))
      .filter((a) => !itemCond || String(a.itemId) === itemCond)
      .filter((a) => !category || (itemById.get(a.itemId)?.categoryName ?? '') === category)
      .filter((a) => !itemGroup || (itemById.get(a.itemId)?.itemGroupName ?? '') === itemGroup)
      .filter((a) => !shortageOnly || a.quantity < (safety.get(a.itemId) ?? 0))
      .filter((a) => includeZero || a.quantity !== 0)
      /* 원본은 품목코드 차례다(A001 · A002 …). */
      .sort((x, y) => x.itemCode.localeCompare(y.itemCode))
  }, [stocks, items, itemById, category, itemGroup, warehouseId, itemCond, shortageOnly, includeZero, withUntracked, withInactive, untracked, inactive, months, inByItemMonth])

  const reset = () => {
    setWarehouseId(''); setItemCond(''); setShortageOnly(false); setIncludeZero(false)
    setWithUntracked(false); setWithInactive(true); setCategory(''); setItemGroup(''); setSubtotal('없음'); setDate(today)
  }

  const sum = (f: (r: AnalysisRow) => number) => rows.reduce((s, r) => s + f(r), 0)
  /** [재고수량] 링크 — 원본은 그 품목의 재고수불부(넉 달 전 1일 ~ 기준일자)를 띄운다. */
  const openLedger = (r: AnalysisRow) => navigate(`/inventory/ledger?itemId=${r.itemId}&from=${months[3].ym}-01&to=${shownDate}`)

  return (
    <EcListShell
      title="재고잔량분석표"
      onSearch={load}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel single from={date} to={date} onPeriod={(r) => setDate(r.from)} picks={STOCK_PICKS}
        subtotal={subtotal} subtotals={SUBTOTALS} onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={itemCond} onChange={(v) => setItemCond(v)} items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분">
          <select className="ec-input w-[130px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(items.map((i) => i.categoryName).filter(Boolean))].sort().map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1">
          <select className="ec-input w-[150px]" value={itemGroup} onChange={(e) => setItemGroup(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(items.map((i) => i.itemGroupName).filter((v): v is string => !!v))].sort().map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12px] mr-[12px]">
            <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} /> 재고수량0포함
          </label>
          <label className="text-[12px] mr-[12px]">
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} /> 수량관리제외품목포함
          </label>
          <label className="text-[12px] mr-[12px]">
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} /> 사용중단품목포함
          </label>
          <label className="text-[12px]">
            <input type="checkbox" checked={shortageOnly} onChange={(e) => setShortageOnly(e.target.checked)} /> 품목별안전재고설정미만표시
          </label>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} value={warehouseId} onChange={setWarehouseId}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="overflow-x-auto">
        <div className="ec-report-frame">
          <EcReportHead title="재고잔량분석표" period={reportPeriod(shownDate)} />
          <table className="text-left ec-report ec-report-fixed ec-report-head400">
            <colgroup>
              <col className="w-[200px]" /><col className="w-[450px]" /><col className="w-[100px]" />
              <col className="w-[100px]" /><col className="w-[100px]" /><col className="w-[100px]" /><col className="w-[100px]" />
              <col className="w-[100px]" /><col className="w-[100px]" />
            </colgroup>
            <thead>
              <tr>
                {/* 원본 머리는 모두 가운데 · 400 — 출력물 틀(.ec-report th)이 가운데로 덮는다. text-right 는 칸 정렬을 적어 두는 것. */}
                <th rowSpan={2}>품목코드</th>
                <th rowSpan={2}>품목명[규격]</th>
                <th rowSpan={2} className="text-right">재고수량</th>
                <th colSpan={5}>재고수량현황</th>
                <th rowSpan={2} className="text-right">미판매</th>
              </tr>
              <tr>
                <th>{months[0].label}</th>
                <th>{months[1].label}</th>
                <th>{months[2].label}</th>
                <th>{months[3].label}</th>
                <th>기타</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center text-ec-ink">불러오는 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.itemId}>
                  <td>{r.itemCode}</td>
                  <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
                  <td className={`text-right${r.quantity < 0 ? ' bg-[var(--ec-bg-cell-negative)]' : ''}`}>
                    <a className="ec-link" onClick={() => openLedger(r)}>{n2(r.quantity)}</a>
                  </td>
                  <td className="text-right">{blank0(r.months[0])}</td>
                  <td className="text-right">{blank0(r.months[1])}</td>
                  <td className="text-right">{blank0(r.months[2])}</td>
                  <td className="text-right">{blank0(r.months[3])}</td>
                  <td className="text-right">{blank0(r.etc)}</td>
                  <td className="text-right">
                    {unsoldByItem.get(r.itemId)
                      ? <a className="ec-link" onClick={() => navigate('/sales/unsold')}>{n2(unsoldByItem.get(r.itemId)!)}</a>
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* 원본 [합계]는 본문 마지막 줄이다 — 앞 두 칸을 합쳐 가운데, 700 · 회색 243(출력물 꼬리줄과 같은 모양). */}
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-center">합계</td>
                  <td className="text-right">{n2(sum((r) => r.quantity))}</td>
                  <td className="text-right">{n2(sum((r) => r.months[0]))}</td>
                  <td className="text-right">{n2(sum((r) => r.months[1]))}</td>
                  <td className="text-right">{n2(sum((r) => r.months[2]))}</td>
                  <td className="text-right">{n2(sum((r) => r.months[3]))}</td>
                  <td className="text-right">{n2(sum((r) => r.etc))}</td>
                  <td className="text-right">{n2(sum((r) => unsoldByItem.get(r.itemId) ?? 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {subtotal !== '없음' && rows.length > 0 && (() => {
        /* 소계 축은 품목 마스터의 값이라 줄에서 바로 못 읽는다 — id 로 되짚는다. */
        const keyOf = (r: AnalysisRow) => {
          const it = itemById.get(r.itemId)
          return (subtotal === '품목구분' ? it?.categoryName : it?.itemGroupName) || ''
        }
        const groups = subtotalBy(rows, keyOf, { qty: (r) => r.quantity })
        return (
          <>
            <h3 className="text-[13px] font-bold mt-[16px] mx-0 mb-[6px]">{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th className="w-[90px] text-right">품목수</th>
                <th className="w-[130px] text-right">재고수량</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td>{g.label}</td>
                    <td className="text-right">{g.count}</td>
                    <td className="text-right">{n2(g.sums.qty)}</td>
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
