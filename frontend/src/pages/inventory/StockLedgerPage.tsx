import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockTransaction, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { dateText } from '../../utils/dateText'
import { periodOf } from '../../components/EcPeriodPicks'
import { useItemFlags } from '../../utils/useInactiveItems'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

/**
 * 재고 > 재고수불부 (이카운트 E040702)
 * 기간·창고·품목으로 거른 입출고 원장. 각 거래를 입고/출고로 나눠 보이고 잔량을 위→아래로 읽는다.
 * 데이터는 GET /api/stock/ledger → { opening, rows } (rows는 일자·id 오름차순).
 *
 * 저장된 balanceAfter는 <b>입력(id)순</b> 기준이라, 일자정렬 화면에서 그대로 쓰면 어긋난다
 * (백업/실사로 과거일자 거래가 뒤에 입력될 수 있음). 그래서 잔량은 서버가 준 기초재고(opening)에
 * 각 행의 변동량을 <b>표시 순서대로 누적</b>해 재계산한다. 기초/기말은 품목·창고를 모두 특정했을 때만
 * 의미가 있어 그때만 표시한다.
 */

type TxType = 'INBOUND' | 'OUTBOUND' | 'ADJUST'
const TYPE_COLOR: Record<TxType, { bg: string; fg: string }> = {
  INBOUND: { bg: '#eef4ff', fg: 'var(--ec-blue)' },
  OUTBOUND: { bg: '#fdf3ea', fg: '#a5561b' },
  ADJUST: { bg: '#f3eefb', fg: '#6b3fb0' },
}

interface LedgerResponse {
  opening: number | null
  rows: StockTransaction[]
  /** 조건에 걸린 전체 줄 수. 잘렸을 때 "몇 줄 중 몇 줄" 을 말하려고 받는다. */
  totalRows: number
  /** 잘라서 온 것인가. 이때만 [오천건이상조회] 를 띄운다. */
  truncated: boolean
}

const num = (n: number) => n.toLocaleString('ko-KR')

interface ServerFilters {
  from: string; to: string; itemId: string; warehouseId: string
  /**
   * 원본 조건 <b>[대표품목으로 합산]</b>. 고른 품목을 <b>대표품목의 가족</b>으로 넓혀 본다.
   * <b>서버 조건</b>이다 — 이 화면은 5천 줄에서 자르고 기초잔량을 따로 세므로, 화면에서
   * 걸러 봐야 잘린 뒤에 거르는 것이라 수량이 조용히 모자란다.
   */
  rollUp: boolean
}

/*
 * 원본 재고수불부는 <b>[전월+금월]</b> 로 열린다(사본 실측). 수불은 <b>지난달에서
 * 넘어온 잔량</b>을 봐야 이번 달 움직임이 읽힌다 — 금월만 보면 기초가 어디서
 * 왔는지 알 수 없다. 우리는 금월 1일~오늘이었다.
 */
const initP = periodOf('전월+금월')!

export default function StockLedgerPage() {
  const [items, setItems] = useState<Item[]>([])
  /**
   * 전표번호 → 거래처명. 원본 재고수불부의 <b>[거래처명]</b> 을 이 지도로 붙인다.
   *
   * <p>여태 "재고 움직임 줄에 거래처가 없다 — inventory 가 trade 를 참조하면 순환이라
   * id 조차 안 둔다" 고 적어 두고 안 만들었다. <b>백엔드는 그대로 두는 것이 맞다</b>
   * (CLAUDE.md 4.1 — inventory 는 trade 를 몰라야 한다). 그런데 <b>화면은 둘 다 부를 수
   * 있다</b> — 담당자 이름·거래처그룹을 이미 그렇게 붙이고 있다.
   *
   * <p>이을 실은 <code>note</code> 다. 판매·구매가 재고를 움직일 때
   * <code>"판매 " + docNo</code> · <code>"구매반품 " + docNo</code> 꼴로 적어 둔다
   * (SalesService·PurchaseService). 그 <b>뒷토막</b>을 전표번호로 보고 지도에서 찾는다.
   *
   * <p><b>못 찾으면 빈칸이다.</b> 적요는 사람이 고쳐 쓸 수도 있는 자유 글자라
   * 억지로 맞추지 않는다 — 사내 이동·조정처럼 상대가 없는 줄도 빈칸이 맞다.
   */
  const [partnerOfDoc, setPartnerOfDoc] = useState<Map<string, string>>(new Map())
  const partnerOf = (note: string | null) => {
    const parts = (note ?? '').trim().split(' ').filter(Boolean)
    return partnerOfDoc.get(parts[parts.length - 1] ?? '') ?? ''
  }
  /**
   * 원본 조건 <b>[단가표시]</b>(차례는 [대표품목으로 합산] 과 [기타] 사이).
   *
   * <p>여태 "우리 재고이동은 단가를 하나만 들고 있어 고를 대상이 없다"고 적고 안 만들었다.
   * <b>절반만 맞는 말이었다</b> — 전표에서 넘어온 그 단가 말고도 품목 마스터가
   * <b>판매단가(<code>unitPrice</code>)·구매단가(<code>purchasePrice</code>)</b> 를 들고 있고,
   * 이 화면은 품목 마스터를 이미 통째로 받아 두고 있다. 원본이 [단가표시]로 고르게 하는 것이
   * 바로 그 축이다("이 수불을 판매단가로 보면 얼마인가").
   *
   * <p>원본의 셋 가운데 <b>[기타단가]</b> 는 우리 품목에 그 칸이 없어 못 만든다.
   * 대신 우리 기본값인 <b>[전표단가]</b>(그 거래에 실제로 매겨진 단가)를 앞에 둔다 —
   * 그게 없으면 "실제로 얼마에 오갔나" 를 볼 방법이 사라진다.
   *
   * <p><b>2026-09-09 원본(E040702)을 열어 [단가표시]를 끝까지 쟀다.</b> 앞 바퀴에
   * "기본값을 못 쟀다"고 적어 둔 것을 이제 채운다. 원본은 <b>한 줄이 아니라 네 묶음</b>이다:
   * <ul>
   *   <li><b>[표시안함 | 표시]</b> — 기본 <b>표시</b>. 단가·금액 칸을 통째로 끄는 스위치다.</li>
   *   <li>판매단가 기준: <b>판매단가</b>(기본) | 판매단가(vat 포함) | 월별원가 | 출고단가(품목)</li>
   *   <li>구매단가 기준: <b>구매단가</b>(기본) | 구매단가(vat 포함) | 월별원가 | 입고단가(품목)</li>
   *   <li>기타단가: <b>적용안함</b>(기본) | 월별원가 | 입고단가(품목)</li>
   * </ul>
   * 즉 원본은 판매·구매 단가를 <b>둘 다</b> 내놓고 각각 무엇으로 셀지를 고르게 한다.
   *
   * <p>우리는 그중 <b>[표시안함|표시]</b> 와 단가 <b>하나 고르기</b>까지 한다.
   * vat 포함·월별원가·출고단가(품목)·기타단가는 각각 값을 따로 들여야 해서 아직 없다 —
   * 지어내지 않고 여기 적어 둔다(보드에도 남겼다).
   */
  /** 품목 id → 마스터. [단가표시]가 고른 단가를 여기서 뽑는다. */
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])
  const PRICE_BASES = ['전표단가', '판매단가', '구매단가'] as const
  const [priceBasis, setPriceBasis] = useState<typeof PRICE_BASES[number]>('전표단가')
  /** 원본 [단가표시]의 첫 갈래 [표시안함 | 표시]. 기본은 <b>표시</b>다(실측). */
  const [showPrice, setShowPrice] = useState(true)
  /*
   * [단가표시]가 [표시안함] 이면 <b>[단가]·[금액] 두 칸이 사라진다</b> — 칸 수가 변하는 표라
   * 정적 검사(qa/ui-check.mjs)로는 셀 수 없다. 개발 모드에서 실제로 그려진 표를 재서
   * 머리와 몸이 어긋났는지 잡는다(일별이익현황과 같은 장치).
   */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '재고수불부', [showPrice, priceBasis])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<StockTransaction[]>([])
  /** 조건에 걸린 전체 줄 수와, 잘라서 받았는지. 원본 [오천건이상조회] 자리를 위한 값이다. */
  const [totalRows, setTotalRows] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [opening, setOpening] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 서버 필터(조회 버튼으로 반영)
  const [filters, setFilters] = useState<ServerFilters>({ from: initP.from, to: initP.to, itemId: '', warehouseId: '', rollUp: false })
  // 클라이언트 보조 필터
  const [typeFilter, setTypeFilter] = useState<'ALL' | TxType>('ALL')
  /*
   * <b>주소로 찾아 들어올 수 있게</b> 검색어를 URL 에서 받는다.
   * A/S 접수의 [생성한 전표]가 이리로 건너온다 — 그 A/S 로 나간 부품 전표만 보여 주려면
   * 화면을 열자마자 걸러져 있어야 한다. 열고 나서 사람이 다시 치게 하면 건너온 뜻이 없다.
   */
  const [searchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('keyword') ?? '')
  /** 원본 '거래내역없는품목제외'. 조회 결과에 변동이 0 인 행이 섞이면 원장이 지저분해진다. */
  /*
   * 원본 재고수불부(E040702) [기타]는 <b>여섯</b>이다(2026-09-02 실측):
   * 결재방표시 · <b>수량관리제외품목포함</b> · <b>사용중단품목포함</b> ·
   * 생산불출/창고이동포함 · 거래내역없는품목제외 · <b>품목명(정렬)</b>.
   * 우리에겐 [거래내역없는품목제외] 하나뿐이었다 — 재고현황·재고변동표·창고별재고현황·
   * 재고잔량분석표에 이어 <b>다섯 번째 같은 구멍</b>이다.
   */
  /**
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(E040702 실측). 결재란 자체는 이미 있었다
   * (utils/print.ts 의 signLineHtml · GET /api/print-sign-lines/default) —
   * 이 화면이 그 스위치를 안 달고 있었을 뿐이다.
   */
  const [signBox, setSignBox] = useState(false)
  const [withUntracked, setWithUntracked] = useState(false)
  /*
   * <b>[사용중단품목포함]은 기본이 켜짐이다</b>(2026-09-09 원본 실측). 우리는 꺼짐이었다 —
   * 수불부에서 그러면 <b>내린 품목의 입출고 기록이 통째로 사라진다.</b> 지난달까지
   * 사고팔던 물건인데 이력이 안 보이니, 재고가 왜 그 숫자인지 되짚을 수가 없다.
   * (재고잔량분석표·재고현황에 이어 세 번째로 같은 값이 뒤집혀 있었다.)
   */
  const [withInactive, setWithInactive] = useState(true)
  /*
   * 원본 조건 <b>[품목구분]·[품목그룹1]</b> — [품목] 바로 뒤에 선다(2026-09-09 실측).
   * 품목 마스터는 이 화면이 이미 통째로 받고 있고(<code>items</code>), 훅도 그 값을 든다.
   */
  const [category, setCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [byItemName, setByItemName] = useState(false)
  const [excludeNoTx, setExcludeNoTx] = useState(false)

  const reset = () => {
    setFilters({ from: initP.from, to: initP.to, itemId: '', warehouseId: '', rollUp: false })
    setTypeFilter('ALL'); setKeyword(''); setExcludeNoTx(false)
  }

  async function loadRefs() {
    const [i, w, sl, pu] = await Promise.all([
      api.get<Item[]>('/items'), api.get<Warehouse[]>('/warehouses'),
      /* 원본 [거래처명] 을 붙일 재료. 아래 partnerOf 주석 참고. */
      api.get<{ docNo: string; partnerName: string }[]>('/sales'),
      api.get<{ docNo: string; partnerName: string }[]>('/purchases'),
    ])
    setPartnerOfDoc(new Map([...sl.data, ...pu.data].map((d) => [d.docNo, d.partnerName])))
    setItems(i.data); setWarehouses(w.data)
  }

  /*
   * <b>넓게 물으면 앞 5천 줄만 받는다.</b> 이 화면은 기본 기간(전월+금월)만으로도 6만 4천 줄이
   * 나와서, 열 때마다 그만큼을 받아 그리다 멈췄다(전 기간이면 12만 줄·34MB).
   * 원본도 큰 결과를 그냥 주지 않는다 — 조회 화면 139곳에 [오천건이상조회] 버튼을 두고
   * 그 위로는 눌러야 가게 한다(사본 실측). 같은 방식으로 자르고, 자른 것을 숨기지 않는다.
   */
  async function loadLedger(all = false) {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (filters.itemId) params.itemId = filters.itemId
      if (filters.warehouseId) params.warehouseId = filters.warehouseId
      if (all) params.all = 'true'
      /* 품목을 안 골랐으면 넓힐 것이 없다 — 보낼 것도 없다. */
      if (filters.rollUp && filters.itemId) params.rollUp = 'true'
      const res = await api.get<LedgerResponse>('/stock/ledger', { params })
      setRows(res.data.rows)
      setOpening(res.data.opening)
      setTotalRows(res.data.totalRows)
      setTruncated(res.data.truncated)
    } catch (err) {
      setError(extractErrorMessage(err)); setRows([]); setOpening(null)
      setTotalRows(0); setTruncated(false)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadRefs(); loadLedger() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // 표시 순서(일자·id)대로 잔량 재계산: opening 이 있으면 누적, 없으면 저장된 balanceAfter(행별 실제 잔량) 사용.
  const runningById = useMemo(() => {
    const m = new Map<number, number>()
    if (opening != null) {
      let bal = opening
      for (const r of rows) { bal += r.quantityChange; m.set(r.id, bal) }
    } else {
      for (const r of rows) m.set(r.id, r.balanceAfter)
    }
    return m
  }, [rows, opening])

  /* 품목의 [수량관리]·[사용여부] 는 품목 마스터가 든다 — 원장 줄에는 없어 따로 받는다. */
  const { inactive, untracked, categoryOf, groupOf, categories, groups } = useItemFlags()

  const shown = useMemo(() => {
    const kw = keyword.trim()
    const out = rows.filter((r) => {
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false
      if (kw && !r.itemName.includes(kw) && !r.warehouseName.includes(kw) && !(r.note ?? '').includes(kw)) return false
      // 원본 '거래내역없는품목제외' — 변동량이 0 인 행은 원장을 지저분하게만 한다.
      if (excludeNoTx && r.quantityChange === 0) return false
      /* [포함] 이라 이름 붙은 것은 기본이 '안 넣음' 이다 — 켜야 보인다. */
      if (!withUntracked && untracked.has(r.itemId)) return false
      if (!withInactive && inactive.has(r.itemId)) return false
      if (category && categoryOf(r.itemId) !== category) return false
      if (itemGroup && groupOf(r.itemId) !== itemGroup) return false
      return true
    })
    /* 원본 [품목명(정렬)] — 켜면 품목명 가나다순. 안 켜면 서버가 준 차례(일자순) 그대로. */
    return byItemName
      ? [...out].sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko'))
      : out
  }, [rows, typeFilter, keyword, excludeNoTx, withUntracked, withInactive, byItemName, untracked, inactive,
    category, itemGroup, categoryOf, groupOf])

  const summary = useMemo(() => {
    let inQty = 0, outQty = 0
    for (const r of shown) {
      if (r.quantityChange >= 0) inQty += r.quantityChange
      else outQty += -r.quantityChange
    }
    // 기초/기말은 (품목,창고) 모두 특정 + 유형필터 없음일 때만 표시 (잔량 누계가 유효)
    const singleScope = opening != null && typeFilter === 'ALL'
    const netAll = rows.reduce((s, r) => s + r.quantityChange, 0)
    const closing = singleScope ? (opening as number) + netAll : null
    return { inQty, outQty, net: inQty - outQty, opening: singleScope ? opening : null, closing, singleScope }
  }, [shown, rows, opening, typeFilter])

  const setF = (patch: Partial<ServerFilters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <EcListShell
      title="재고수불부"
      signLine={signBox}
      search={keyword}
      onSearchChange={setKeyword}
      /* 인자 없이 부른다 — onSearch 가 무엇을 넘기든 all 로 새면 안 된다. */
      onSearch={() => void loadLedger()}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void loadLedger() },
        /* 잘려서 왔을 때만 누를 수 있다 — 안 잘렸으면 더 가져올 것이 없다. */
        { label: '오천건이상조회', onClick: () => void loadLedger(true), disabled: !truncated },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {/*
        원본 재고수불부(E040702)의 조건 판. 기준일자는 구간이고 빠른선택은 여덟 개다
        (금일·전일·금주(~오늘)·전주·금월(~오늘)·전월·전월+금월·종료일).
        원본 [단가표시]는 판매단가/구매단가/기타단가 중 **어느 단가로 금액을 볼지** 고른다.
        우리는 그중 둘(판매·구매)을 품목 마스터에서 대고, 앞에 [전표단가]를 하나 더 둔다.
        [기타단가]는 우리 품목에 그 칸이 없다.
      */}
      <EcStatusPanel
        from={filters.from} to={filters.to}
        onPeriod={(r) => setF({ from: r.from, to: r.to })}
        picks={INQUIRY_FULL_PICKS}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} value={filters.warehouseId}
                           onChange={(v) => setF({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} value={filters.itemId}
                           onChange={(v) => setF({ itemId: v })}
                           items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
        </EcCond>
        <EcCond label="품목구분">
          <select className="ec-input" value={category} style={{ width: 130 }}
                  onChange={(e) => setCategory(e.target.value)}>
            <option value="">전체</option>
            {categories.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1">
          <select className="ec-input" value={itemGroup} style={{ width: 150 }}
                  onChange={(e) => setItemGroup(e.target.value)}>
            <option value="">전체</option>
            {groups.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        {/*
          원본 차례: <b>[대표품목으로 합산] 이 [기타] 앞</b>이다(2026-09-09 실측).
          예전에는 "[기타] 뒤가 마지막" 이라 적어 두었는데 사본만 보고 적은 것이라 틀렸다.
        */}
        <EcCond label="대표품목으로 합산">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={filters.rollUp} disabled={!filters.itemId}
                   onChange={(e) => setF({ rollUp: e.target.checked })} />
            <span style={{ color: filters.itemId ? undefined : '#a8b0ba' }}> 형제 품목까지 함께</span>
          </label>
        </EcCond>
        {/*
          원본 [기타] 차례 그대로다(2026-09-02 E040702 실측). 안 만든 하나 —
          [생산불출/창고이동포함]은 우리 재고거래가 그 둘을 따로 표시하지 않아 가릴 축이 없다.
        */}
        {/* 원본 차례: [대표품목으로 합산] 다음이 [단가표시], 그다음이 [기타] 다. */}
        <EcCond label="단가표시">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* 원본의 첫 갈래 — 끄면 [단가]·[금액] 칸이 통째로 사라진다. */}
            <div className="ec-pills">
              {(['표시안함', '표시'] as const).map((v) => (
                <button key={v} type="button" className={`ec-pill no-ec${showPrice === (v === '표시') ? ' active' : ''}`}
                        onClick={() => setShowPrice(v === '표시')}>{v}</button>
              ))}
            </div>
            {showPrice && (
              <div className="ec-pills">
                {PRICE_BASES.map((b) => (
                  <button key={b} type="button" className={`ec-pill no-ec${priceBasis === b ? ' active' : ''}`}
                          onClick={() => setPriceBasis(b)}>{b}</button>
                ))}
              </div>
            )}
          </div>
        </EcCond>
        <EcCond label="기타">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={signBox}
                     onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
            </label>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={withUntracked}
                     onChange={(e) => setWithUntracked(e.target.checked)} /> 수량관리제외품목포함
            </label>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={withInactive}
                     onChange={(e) => setWithInactive(e.target.checked)} /> 사용중단품목포함
            </label>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={excludeNoTx}
                     onChange={(e) => setExcludeNoTx(e.target.checked)} /> 거래내역없는품목제외
            </label>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={byItemName}
                     onChange={(e) => setByItemName(e.target.checked)} /> 품목명(정렬)
            </label>
          </div>
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {/*
        잘라서 받았으면 <b>반드시 말한다.</b> 말 없이 앞부분만 보여 주면 사람은 그것이 전부인 줄
        알고 합계를 읽는다 — 틀린 숫자를 맞다고 믿게 하는 것이 안 보여 주는 것보다 나쁘다.
      */}
      {truncated && (
        <p style={{ background: '#fff8e1', color: '#7a5b00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>
          모두 {num(totalRows)}줄 중 앞 {num(rows.length)}줄만 보고 있습니다.
          기간을 좁히거나 품목·창고를 고르면 전부 볼 수 있고, 그대로 다 보려면 [오천건이상조회]를 누르세요.
        </p>
      )}

      {/* 유형 탭 + 요약 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['ALL', 'INBOUND', 'OUTBOUND', 'ADJUST'] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: typeFilter === t ? 'var(--ec-blue)' : '#fff', color: typeFilter === t ? '#fff' : '#3a4453', fontWeight: typeFilter === t ? 700 : 400,
            }}>{t === 'ALL' ? '전체' : t === 'INBOUND' ? '입고' : t === 'OUTBOUND' ? '출고' : '조정'} ({t === 'ALL' ? rows.length : rows.filter((r) => r.type === t).length})</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          {summary.singleScope && summary.opening != null && (
            <>기초 <b style={{ color: '#3c4553', fontSize: 14 }}>{num(summary.opening)}</b><span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span></>
          )}
          입고계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(summary.inQty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          출고계 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(summary.outQty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          순증감 <b style={{ color: summary.net >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{summary.net > 0 ? '+' : ''}{num(summary.net)}</b>
          {summary.singleScope && summary.closing != null && (
            <><span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>기말 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(summary.closing)}</b></>
          )}
        </div>
      </div>

      <div ref={tableRef}>
      <table className="w-full text-left">
        <thead>
          <tr>
            {/*
              <b>재고수불부(E040702) 2026-09-09 원본 격자 실측</b> — 원본은 <b>품목마다
              작은 표를 하나씩</b> 찍는다(자료 286개 품목 = 표 286개). 표 하나의 열은
              [일자 · <b>거래처명</b> · <b>적요</b> · <b>입고수량</b> · <b>출고수량</b> ·
              <b>재고수량</b>] 이고, 맨 윗줄이 <b>[전일재고]</b>, 맨 아랫줄이 <b>[합계]</b> 다.
              우리는 품목·창고를 <b>열</b>로 두고 한 표에 다 편다 — 품목을 안 고르고
              기간만으로도 볼 수 있어야 하기 때문이다(원본은 품목 수가 많으면
              "조회품목을 재지정하겠습니까" 를 먼저 묻는다).
              이름 넷이 어긋나 있었다: [입고]·[출고]·[잔량]·[비고] →
              <b>[입고수량]·[출고수량]·[재고수량]·[적요]</b>. [적요] 자리도 원본을 따라
              수량 앞으로 옮겼다. <b>[거래처명]은 2026-09-09 에 만들었다</b> —
              적요에 적힌 전표번호로 판매·구매를 찾아 화면이 붙인다(위 partnerOf 주석).
              백엔드는 그대로다.
              [유형]·[단가]·[금액]은 우리 열이다.
            */}
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center' }}>일자</th>
            <th style={{ textAlign: 'center', width: 60 }}>유형</th>
            <th>품목</th>
            <th>창고</th>
            <th style={{ width: 140 }}>거래처명</th>
            <th>적요</th>
            <th style={{ textAlign: 'right' }}>입고수량</th>
            <th style={{ textAlign: 'right' }}>출고수량</th>
            <th style={{ textAlign: 'right' }}>재고수량</th>
            {showPrice && <th style={{ textAlign: 'right' }}>단가</th>}
            {showPrice && <th style={{ textAlign: 'right' }}>금액</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '해당 기간의 입출고 내역이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => {
            const inQ = r.quantityChange >= 0 ? r.quantityChange : 0
            const outQ = r.quantityChange < 0 ? -r.quantityChange : 0
            /*
             * 원본 [단가표시]가 고른 단가로 [단가]·[금액]을 낸다. 품목 마스터에 그 단가를
             * 안 정했으면(0) <b>모른다</b>로 둔다 — 0 으로 쓰면 금액이 0 이 되어
             * "값이 없는 것" 과 "공짜로 오간 것" 이 화면에서 같아진다.
             */
            const master = priceBasis === '전표단가' ? null : itemById.get(r.itemId)
            const basePrice = priceBasis === '전표단가' ? r.unitPrice
              : priceBasis === '판매단가' ? (master?.unitPrice || null)
                : (master?.purchasePrice || null)
            const amount = basePrice != null ? Math.abs(r.quantityChange) * basePrice : null
            const bal = runningById.get(r.id)
            const c = TYPE_COLOR[r.type]
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{dateText(r.transactionDate)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: c.bg, color: c.fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{r.typeName}</span>
                </td>
                <td>{r.itemName}</td>
                <td>{r.warehouseName}</td>
                <td style={{ color: '#5a626e' }}>{partnerOf(r.note)}</td>
                <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
                <td style={{ textAlign: 'right', color: inQ ? 'var(--ec-blue)' : '#c5cbd3', fontWeight: inQ ? 600 : 400 }}>{inQ ? num(inQ) : ''}</td>
                <td style={{ textAlign: 'right', color: outQ ? '#a5561b' : '#c5cbd3', fontWeight: outQ ? 600 : 400 }}>{outQ ? num(outQ) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{bal != null ? num(bal) : ''}</td>
                {showPrice && (
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{basePrice != null ? num(basePrice) : ''}</td>
                )}
                {showPrice && (
                  <td style={{ textAlign: 'right', color: '#5a626e' }}>{amount != null ? num(amount) : ''}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </EcListShell>
  )
}
