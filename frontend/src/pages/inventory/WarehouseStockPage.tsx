import { useRef, useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, StockRow, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemFlags } from '../../utils/useInactiveItems'
import { EcReportHead, EcReportFoot, reportPeriod } from '../../components/EcReportFrame'

/** 원본 [횡] 음수 칸 바탕 — 2026-09-23 E040711 실측(bg-danger). 공용 토큰이 아직 없다. */
const NEG_BG = 'rgb(246, 215, 215)'
/** 원본 [횡] 사용중단 창고 머리 글자색 — 2026-09-23 E040711 실측([공구 창고]). */
const INACTIVE_HEAD = 'rgb(173, 181, 189)'

/** [횡] 수량 칸 — 0 은 빈칸, 음수는 분홍 바탕(원본 그대로). */
function QtyCell({ q }: { q: number }) {
  return (
    <td style={{ textAlign: 'right', background: q < 0 ? NEG_BG : undefined }}>
      {q === 0 ? '' : q.toLocaleString()}
    </td>
  )
}

/**
 * 재고 > 창고별재고현황 (이카운트 E040711)
 *
 * 재고현황 그룹의 두 번째 화면인데 우리에게 없었다. 재고현황(E040701)이 품목×창고를
 * 한 줄씩 늘어놓는 것과 달리, 이 화면은 <b>창고를 축으로</b> 본다 —
 * 원본 [구분]이 <b>창고별(종)</b>과 <b>창고별(횡)</b> 둘이다.
 *
 *   종 — 품목마다 창고를 아래로 늘어놓는다. 같은 품목이 이어지면 품목 칸을 비운다.
 *   횡 — 창고를 <b>열</b>로 돌린다. "이 품목이 어느 창고에 얼마나 있나"를 한 줄에서 본다.
 *
 * 2026-09-09 원본 실측 — 조건은 <b>열둘</b>이다(대조표에 적혀 있던 열둘 가운데 일곱은
 * [기타] 체크박스를 펴 놓은 것이라 실제로는 다섯만 맞았다): 구분 · 기준일자 · 창고 ·
 * 창고계층그룹 · 품목 · 품목구분 · 품목그룹1 · 품목그룹2 · 품목그룹3 · 품목계층그룹 ·
 * 대표품목으로 합산 · 기타.
 * 기타 중 '수량관리제외품목포함'은 품목에 그 구분이 없다.
 * '창고별안전재고수량포함'은 우리 안전재고가 <b>품목 단위</b>라서(창고별이 아니다) 뜻이 다르므로
 * 라벨을 '안전재고표시'로 적고 품목 안전재고를 보여 준다.
 *
 * <p>[기준일자]는 이제 <b>실제로 조회에 쓴다</b>. 예전에는 칸만 두고 무시했다 —
 * 날짜를 바꿔도 늘 현재고가 나왔다. 조건이 있으면 사람은 그 값이 반영된 줄 안다.
 * 서버가 현재고에서 그 뒤의 입출고를 빼서 그 시점 재고를 낸다(GET /stock?asOf=).
 */
export default function WarehouseStockPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [stock, setStock] = useState<StockRow[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = ymd(new Date())
  /**
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(E040711 실측). 결재란 자체는 이미 있었다
   * (utils/print.ts 의 signLineHtml · GET /api/print-sign-lines/default) —
   * 이 화면이 그 스위치를 안 달고 있었을 뿐이다.
   */
  const [signBox, setSignBox] = useState(false)
  /**
   * 원본 [구분] 기본값은 <b>창고별(횡)</b>이다(2026-09-09 E040711 실측). 우리는 [종]으로
   * 열고 있었다 — 열자마자 <b>표의 모양 자체가 다른</b> 것이다. 이 화면을 여는 까닭은
   * "이 품목이 어느 창고에 얼마씩 있나" 를 한 줄에서 보려는 것인데, [종]으로 열면
   * 같은 품목이 창고 수만큼 세로로 흩어져 그것을 눈으로 모아야 한다.
   */
  const [mode, setMode] = useState<'종' | '횡'>('횡')
  const [cond, setCond] = useState({
    date: today,
    warehouseId: '',
    item: '',
    zeroItem: false,
    zeroWarehouse: false,
    /**
     * 원본 <b>[사용중단품목포함]·[사용중단/삭제창고포함]은 둘 다 켜져 있다</b>
     * (2026-09-09 실측). 우리는 둘 다 꺼 두었다 — 재고잔량분석표·재고현황·재고수불부·
     * 재고변동표에 이어 <b>다섯 번째</b>로 같은 값이 뒤집혀 있었고, 창고 쪽은 여기서 처음이다.
     * 내린 창고에 남아 있는 재고가 통째로 빠지면 <b>합계가 실제 창고와 어긋난 채</b>
     * 맞는 것처럼 보인다 — 창고를 내리는 것은 그 재고를 옮긴 뒤에 하는 일이라,
     * 옮기기 전에 이 화면을 열면 그 수량이 어디에도 안 잡힌다.
     */
    inactiveItem: true,
    inactiveWarehouse: true,
    /** 원본 조건 [품목구분]·[품목그룹1] — [품목] 바로 뒤에 선다(2026-09-09 실측). */
    category: '',
    itemGroup: '',
    /*
     * 원본 [기타]의 <b>[수량관리제외품목포함]</b>(2026-09-02 E040711 실측).
     * 우리에게만 없어서, 용역·수수료처럼 수량을 안 세는 품목이 창고표에 0 으로 줄을 차지했다.
     * 재고현황·재고변동표에서도 같은 것이 빠져 있었다 — 세 화면이 같은 구멍이었다.
     */
    withUntracked: false,
    safety: false,
    /**
     * 원본 조건 <b>[대표품목으로 합산]</b>. 색·용량만 다른 형제 품목을 <b>대표품목 한 줄</b>로
     * 모아 본다. "이 물건이 통틀어 몇 개 있나" 는 규격별로 갈린 표에서는 눈으로 더해야 한다.
     * 원본과 같이 기본은 꺼 둔다 — 켜면 줄 수가 줄어드는데 말없이 그러면 빠진 줄 안다.
     */
    rollUp: false,
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<StockRow[]>('/stock', { params: { asOf: cond.date } }),
      api.get<Item[]>('/items'),
      api.get<Warehouse[]>('/warehouses'),
    ])
      .then(([s, i, w]) => { setStock(s.data); setItems(i.data); setWarehouses(w.data) })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /**
   * 품목 id → <b>대표품목 id</b>. 대표가 없으면 자기가 곧 대표다.
   * 합산을 끄면 자기 자신으로 돌려주므로 아래 계산은 한 벌로 끝난다.
   */
  const headOf = useMemo(() => {
    const m = new Map<number, number>()
    for (const it of items) m.set(it.id, cond.rollUp ? (it.parentItemId ?? it.id) : it.id)
    return (id: number) => m.get(id) ?? id
  }, [items, cond.rollUp])

  /** 재고가 0 인 칸도 보이려면 품목·창고 목록으로 격자를 만들어야 한다 — /stock 은 있는 것만 준다. */
  const qtyOf = useMemo(() => {
    const m = new Map<string, number>()
    /* 대표로 모을 때는 형제들의 수량이 <b>한 칸에 겹친다</b> — 덮어쓰지 말고 더한다. */
    stock.forEach((r) => {
      const k = `${headOf(r.itemId)}:${r.warehouseId}`
      m.set(k, (m.get(k) ?? 0) + r.quantity)
    })
    return m
  }, [stock, headOf])

  const shownWarehouses = useMemo(() => {
    const used = new Set(stock.filter((r) => r.quantity !== 0).map((r) => r.warehouseId))
    return warehouses
      .filter((w) => cond.inactiveWarehouse || w.active)
      .filter((w) => !cond.warehouseId || String(w.id) === cond.warehouseId)
      .filter((w) => cond.zeroWarehouse || used.has(w.id))
  }, [warehouses, stock, cond.inactiveWarehouse, cond.warehouseId, cond.zeroWarehouse])

  /* 품목의 [수량관리] 는 품목 마스터가 든다 — 재고 줄에는 없어 따로 받는다. */
  const { untracked, categoryOf, groupOf, categories, groups } = useItemFlags()

  const shownItems = useMemo(() => {
    const wid = new Set(shownWarehouses.map((w) => w.id))
    const total = (id: number) => stock
      .filter((r) => headOf(r.itemId) === id && wid.has(r.warehouseId))
      .reduce((n, r) => n + r.quantity, 0)
    return items
      /* 합산을 켜면 <b>대표만</b> 줄로 세운다 — 형제 줄은 대표 줄에 들어가 있다. */
      .filter((it) => !cond.rollUp || it.parentItemId == null)
      .filter((it) => cond.withUntracked || !untracked.has(it.id))
      .filter((it) => cond.inactiveItem || it.active)
      .filter((it) => !cond.item || it.name.includes(cond.item) || it.code.includes(cond.item))
      .filter((it) => !cond.category || categoryOf(it.id) === cond.category)
      .filter((it) => !cond.itemGroup || groupOf(it.id) === cond.itemGroup)
      .filter((it) => cond.zeroItem || total(it.id) !== 0)
  }, [items, stock, shownWarehouses, headOf, cond.rollUp, cond.inactiveItem, cond.item, cond.zeroItem,
    cond.withUntracked, untracked, cond.category, cond.itemGroup, categoryOf, groupOf])

  const itemTotal = (id: number) => shownWarehouses.reduce((n, w) => n + (qtyOf.get(`${id}:${w.id}`) ?? 0), 0)
  const warehouseTotal = (id: number) => shownItems.reduce((n, it) => n + (qtyOf.get(`${it.id}:${id}`) ?? 0), 0)
  const grandTotal = shownItems.reduce((n, it) => n + itemTotal(it.id), 0)

  /** 종 보기 한 줄 = 품목 × 창고. '재고수량0창고포함'을 끄면 0 인 칸은 줄을 만들지 않는다. */
  const flatRows = useMemo(() => shownItems.flatMap((it) => shownWarehouses
    .map((w) => ({ item: it, warehouse: w, qty: qtyOf.get(`${it.id}:${w.id}`) ?? 0 }))
    .filter((r) => cond.zeroWarehouse || r.qty !== 0)),
    [shownItems, shownWarehouses, qtyOf, cond.zeroWarehouse])

  const num = (n: number) => n.toLocaleString()
  const reset = () => {
    setMode('횡')
    setCond({ date: today, warehouseId: '', item: '', zeroItem: false, zeroWarehouse: false, inactiveItem: true, inactiveWarehouse: true, withUntracked: false, safety: false, rollUp: false, category: '', itemGroup: '' })
  }

  const flatCols = 5 + (cond.safety ? 1 : 0)
  const wideCols = 4 + shownWarehouses.length + (cond.safety ? 1 : 0)

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '창고별재고현황', [mode, cond.safety, shownWarehouses.length, shownItems.length])

  return (
    <EcListShell
      title="창고별재고현황"
      searchable={false}
      signLine={signBox}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        single
        from={cond.date} to={cond.date}
        onPeriod={(r) => setC({ date: r.from })}
        picks={STOCK_PICKS}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['종', '횡'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                창고별({m})
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouseId} onChange={(v) => setC({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분">
          <select className="ec-input" value={cond.category} style={{ width: 130 }}
                  onChange={(e) => setC({ category: e.target.value })}>
            <option value="">전체</option>
            {categories.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1">
          <select className="ec-input" value={cond.itemGroup} style={{ width: 150 }}
                  onChange={(e) => setC({ itemGroup: e.target.value })}>
            <option value="">전체</option>
            {groups.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        {/*
          원본 차례: <b>[대표품목으로 합산] 이 [기타] 앞</b>이다(2026-09-09 실측).
          예전에는 "[기타] 뒤가 마지막(세 화면이 다 같다)" 이라 적어 두었는데,
          사본만 보고 적은 것이라 <b>네 화면을 나란히</b> 틀렸다.
        */}
        <EcCond label="대표품목으로 합산">
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={cond.rollUp}
                   onChange={(e) => setC({ rollUp: e.target.checked })} /> 형제 품목을 대표 한 줄로
          </label>
        </EcCond>
        <EcCond label="기타">
          {/*
            원본 [기타] 차례 그대로다(2026-09-02 E040711 실측): 결재방표시 ·
            수량관리제외품목포함 · 사용중단품목포함 · 재고수량0품목포함 · 재고수량0창고포함 ·
            사용중단/삭제창고포함 · 창고별안전재고수량포함.
            뒤 둘은 이름을 원본대로 고쳤다 —
            우리는 창고를 지우지 않고 내리기만 하므로 [삭제]에 해당하는 것이 없다는 것만 다르다.

            <b>배열로 돌려 그리지 않는다.</b> 그러면 이름이 글자로 안 남아 조건 검사가 못 본다 —
            실제로 이 화면 여섯 칸이 통째로 '없다' 로 걸렸다.
          */}
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={signBox}
                   onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={cond.withUntracked}
                   onChange={(e) => setC({ withUntracked: e.target.checked })} /> 수량관리제외품목포함
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={cond.inactiveItem}
                   onChange={(e) => setC({ inactiveItem: e.target.checked })} /> 사용중단품목포함
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={cond.zeroItem}
                   onChange={(e) => setC({ zeroItem: e.target.checked })} /> 재고수량0품목포함
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={cond.zeroWarehouse}
                   onChange={(e) => setC({ zeroWarehouse: e.target.checked })} /> 재고수량0창고포함
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={cond.inactiveWarehouse}
                   onChange={(e) => setC({ inactiveWarehouse: e.target.checked })} /> 사용중단/삭제창고포함
          </label>
          <label style={{ fontSize: 12, marginRight: 12 }}>
            <input type="checkbox" checked={cond.safety}
                   onChange={(e) => setC({ safety: e.target.checked })} /> 창고별안전재고수량포함
          </label>
        </EcCond>
      </EcStatusPanel>

      {cond.date !== today && (
        <p style={{ marginBottom: 8, background: '#fff7e6', border: '1px solid #ffe0a3', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          지금 보는 것은 <b>기준일자 시점의 재고</b>입니다. 현재고에서 그 뒤의 입출고를 빼서 냅니다.
          숫자가 달라지지 않습니다.
        </p>
      )}

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        품목 <b style={{ color: '#3c4553' }}>{num(shownItems.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        창고 <b style={{ color: '#3c4553' }}>{num(shownWarehouses.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        재고수량 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(grandTotal)}</b>
      </div>

      {/*
        <b>출력물 격자 — 2026-09-23 원본(E040711) getComputedStyle 실측</b>, 자료 든 판(기준일자 오늘).
        머리글·꼬리는 재고현황(E040701)과 같다: 제목 24/700 가운데(제목 폭 1255 ≈ 표 1263),
        [회사명 : …]·기준일자(2026/09/23) 한 줄, 아래 [P.1]·출력 시각. 본문 12/400 검정 · 3px · 24px ·
        줄 간격 17.14 · <b>줄무늬 없음</b>(줄마다 읽음 — 회색 한 줄은 마우스가 올라간 hover 였다).
        합계줄 700 · 회색 243 · [합계] 가운데. 번호 열은 원본에 <b>없다</b> — 두 격자 모두 품목코드부터다.

        재고현황과 <b>다른</b> 것: 머리가 <b>보통 굵기(400)</b>다(바탕 247,248,249 · 6/3/3 · 27px 은 같다).
        .ec-report 가 머리를 700 으로 덮으므로 ec-report-head400 변형(index.css)을 붙였다.
      */}
      <div ref={tableRef} className="overflow-x-auto">
        <div className="ec-report-frame">
        <EcReportHead title="창고별재고현황" period={reportPeriod(cond.date)} />
        {mode === '종' ? (
          <table className="text-left ec-report ec-report-fixed ec-report-head400">
            {/*
              [종] 열 폭 — 원본 <b>678px · fixed · 96 / 222 / 120 / 120 / 120</b>
              (품목코드 · 품목명[규격] · 창고코드 · 창고명 · 재고수량). [안전재고]는 켜서 재지 못했다.
            */}
            <colgroup>
              <col style={{ width: 96 }} /><col style={{ width: 222 }} /><col style={{ width: 120 }} />
              <col style={{ width: 120 }} /><col style={{ width: 120 }} />
              {cond.safety && <col style={{ width: 100 }} />}
            </colgroup>
            <thead>
              <tr>
                {/*
                  <b>창고별재고현황(E040711) [창고별(종)] 2026-09-09 원본 격자 실측</b> —
                  [품목코드 · 품목명[규격] · <b>창고코드</b> · <b>창고명</b> · 재고수량].
                  원본은 규격을 품목명 뒤 대괄호에 붙이고, 창고는 코드와 이름을 나란히 둔다.
                  (원본 [종]에는 표시형식용 숨은 열 둘이 더 있다 — [품목명]·[품목코드(품명,
                  규격,단위포함)]. 높이 0 으로 안 보이는 칸이라 옮기지 않는다.)
                  <b>대조표(ecount-column-align.json)의 이 화면 차례는 [종] 기준</b>이다 —
                  한 화면이 격자 둘을 갈아 끼우는데 대조표는 화면마다 한 줄이라, [횡]에만
                  있는 이름([품목명]·[규격])은 뒤에 잇대어 두었다.
                */}
                <th>품목코드</th>
                <th>품목명[규격]</th>
                <th>창고코드</th>
                <th>창고명</th>
                <th style={{ textAlign: 'right' }}>재고수량</th>
                {cond.safety && <th style={{ textAlign: 'right' }}>안전재고</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={flatCols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : flatRows.length === 0 ? (
                <tr><td colSpan={flatCols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : flatRows.map((r) => (
                /*
                  원본 [종]은 같은 품목이 이어져도 품목코드·품목명을 <b>줄마다 다시 찍는다</b>
                  (16mm새들 · 17.242 가 두 줄 모두 코드를 단다). 우리는 비워 두었었다.
                  창고코드만 링크색(25,53,140)이고 나머지는 검정 400, 음수도 검정·바탕 없음이다.
                */
                <tr key={`${r.item.id}-${r.warehouse.id}`}>
                  <td>{r.item.code}</td>
                  <td>{r.item.name + (r.item.spec ? ` [${r.item.spec}]` : '')}</td>
                  <td><span className="ec-link" style={{ cursor: 'default' }}>{r.warehouse.code}</span></td>
                  <td>{r.warehouse.name}</td>
                  <td style={{ textAlign: 'right' }}>{num(r.qty)}</td>
                  {cond.safety && <td style={{ textAlign: 'right' }}>{num(r.item.safetyStock)}</td>}
                </tr>
              ))}
            </tbody>
            {flatRows.length > 0 && (
              <tfoot>
                <tr>
                  {/* 원본 [합계]는 앞 네 칸을 합친 칸의 가운데다(colSpan 4). */}
                  <td colSpan={4} style={{ textAlign: 'center' }}>합계</td>
                  <td style={{ textAlign: 'right' }}>{num(grandTotal)}</td>
                  {cond.safety && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="text-left ec-report ec-report-fixed ec-report-head400">
            {/*
              [횡] 열 폭 — 원본 <b>fixed · 96 / 222 / 104 / 120 + 창고마다 120</b>
              (품목코드 · 품목명 · 규격 · 재고수량 · 창고들; 창고 여섯이면 1262px). [단위]·번호 열은
              원본에 없어 뺐다. [안전재고]는 켜서 재지 못했다.
            */}
            <colgroup>
              <col style={{ width: 96 }} /><col style={{ width: 222 }} /><col style={{ width: 104 }} />
              <col style={{ width: 120 }} />
              {shownWarehouses.map((w) => <col key={w.id} style={{ width: 120 }} />)}
              {cond.safety && <col style={{ width: 100 }} />}
            </colgroup>
            <thead>
              <tr>
                {/*
                  <b>[창고별(횡)] 2026-09-09 원본 격자 실측</b> —
                  [품목코드 · 품목명 · <b>규격</b> · <b>재고수량</b> · 창고들…].
                  품목 합계는 창고들 <b>앞</b>의 [재고수량] 이다.
                  사용중단 창고의 머리는 <b>흐린 회색</b>(173,181,189)이다(2026-09-23 [공구 창고]).
                  (원본 앞 네 머리는 정렬 링크라 링크색·▼ 이 붙는다 — 우리는 이 격자에 정렬이 없어 옮기지 않았다.)
                */}
                <th>품목코드</th>
                <th>품목명</th>
                <th>규격</th>
                <th style={{ textAlign: 'right' }}>재고수량</th>
                {shownWarehouses.map((w) => (
                  <th key={w.id} style={{ textAlign: 'right' }}>
                    <span style={w.active ? undefined : { color: INACTIVE_HEAD }}>{w.name}</span>
                  </th>
                ))}
                {cond.safety && <th style={{ textAlign: 'right' }}>안전재고</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={wideCols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shownItems.length === 0 ? (
                <tr><td colSpan={wideCols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shownItems.map((it) => (
                /*
                  원본 [횡] 본문(2026-09-23): 품목코드·품목명은 링크색(25,53,140), 나머지 검정 400.
                  수량이 <b>0 이면 빈칸</b>, <b>음수면 칸 바탕이 분홍</b>(246,215,215 · 글자는 검정)이다 —
                  [재고수량] 칸도 창고 칸도 같다. 우리는 0 을 회색 글자로 찍고 재고수량을 굵은 파랑으로 칠했다.
                */
                <tr key={it.id}>
                  <td><span className="ec-link" style={{ cursor: 'default' }}>{it.code}</span></td>
                  <td><span className="ec-link" style={{ cursor: 'default' }}>{it.name}</span></td>
                  <td>{it.spec ?? ''}</td>
                  <QtyCell q={itemTotal(it.id)} />
                  {shownWarehouses.map((w) => <QtyCell key={w.id} q={qtyOf.get(`${it.id}:${w.id}`) ?? 0} />)}
                  {cond.safety && <td style={{ textAlign: 'right' }}>{num(it.safetyStock)}</td>}
                </tr>
              ))}
            </tbody>
            {shownItems.length > 0 && (
              <tfoot>
                <tr>
                  {/* 원본 [합계]는 앞 세 칸을 합친 칸의 가운데다. 합계줄 음수는 분홍 없이 회색 바탕 그대로다. */}
                  <td colSpan={3} style={{ textAlign: 'center' }}>합계</td>
                  <td style={{ textAlign: 'right' }}>{num(grandTotal)}</td>
                  {shownWarehouses.map((w) => (
                    <td key={w.id} style={{ textAlign: 'right' }}>{num(warehouseTotal(w.id))}</td>
                  ))}
                  {cond.safety && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        )}
        <EcReportFoot />
        </div>
      </div>
    </EcListShell>
  )
}
