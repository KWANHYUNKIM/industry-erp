import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Warehouse } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS, ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemFlags } from '../../utils/useInactiveItems'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { stockBuckets, bucketTotals, type BucketTx, type StockBucket } from '../../utils/stockBuckets'

/**
 * 재고 > 재고변동표 (이카운트 E040719)
 *
 * 원본에는 [구분]이 <b>집계 / 일별 / 월별</b> 셋이다. 우리는 집계(품목별 한 줄)만 있었다.
 * "이번 달에 재고가 어떻게 움직였나"를 보려면 날짜 축이 있어야 하는데 그게 없었다.
 *
 *   집계 — 품목별 기초·입고·출고·기말 한 줄. GET /api/stock/movement 가 계산해 준다.
 *   일별·월별 — 기간의 재고이동을 날짜/월로 묶는다. GET /api/stock/ledger 로 이동 내역을 받고,
 *               기초는 movement 의 품목별 기초를 합친 값에서 시작해 앞 구간의 기말을 다음 구간의
 *               기초로 굴린다. 그래야 구간끼리 이어진다(기말 = 기초 + 입고 − 출고).
 *
 * 2026-09-09 원본 실측 — 조건은 <b>열셋</b>이다(대조표에 적혀 있던 열하나는 [기타] 체크박스를
 * 펴 놓은 것이었다): 구분 · 기준일자 · 창고 · 창고계층그룹 · 품목 · 품목구분 · 품목그룹1 ·
 * 품목그룹2 · 품목그룹3 · 품목계층그룹 · 대표품목으로 합산 · 관리항목 · 기타.
 * [구분] 칸 안에는 <b>[입출고표시방법](표시/상세표시)</b> 라디오가 하나 더 들어 있는데,
 * 우리 변동표는 줄 단위 입출고 내역을 펼치지 않아 대응하는 개념이 없다.
 */

interface MovementRow {
  itemId: number; itemCode: string; itemName: string; unit: string
  opening: number; inQty: number; outQty: number; closing: number
}

/** 일별·월별 보기의 한 줄. 구간(날짜 또는 월)마다 기초·입고·출고·기말을 낸다(utils/stockBuckets). */
type BucketRow = StockBucket

const num = (n: number) => n.toLocaleString('ko-KR')
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => ymd(new Date())

export default function StockMovementPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [rows, setRows] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [warehouseId, setWarehouseId] = useState('')
  const [keyword, setKeyword] = useState('')
  // 품목 코드도움은 id 를 준다 — 검색창(부분일치)과 칸을 나눈다. 이름이 같은 품목이 정상이라서다.
  const [itemCond, setItemCond] = useState('')
  const [hideZero, setHideZero] = useState(false)
  /**
   * 원본 [생산불출/창고이동포함] — <b>꺼진 채</b> 열린다(2026-10-03 loginaa 재고변동표 실측). 꺼져 있고 전 창고로 볼 때는 창고이동 줄을
   * 입고 · 출고에서 뺀다(회사 전체로는 같은 물건이 자리만 옮긴 것이라 둘 다 세면 부푼다 · 같은 날 두 다리가 빠져 기말은 그대로).
   * 창고를 고르면 이동은 그 창고의 실제 입출고라 그대로 센다. 우리 생산불출은 소모(출고 한 다리)라 대상이 아니다.
   */
  const [withTransfers, setWithTransfers] = useState(false)
  /*
   * 원본 재고변동표(E040719) [기타]는 <b>일곱</b>이다(2026-09-02 실측):
   * 결재방표시 · 수량관리제외품목포함 · 사용중단품목포함 · 생산불출/창고이동포함 ·
   * 입출고수량0제외 · 품목명(정렬) · 개별창고기준. 우리에겐 [입출고수량0제외] 하나뿐이라,
   * 재고현황과 똑같이 <b>안 세는 품목과 내린 품목이 늘 섞여</b> 있었고 차례도 못 바꿨다.
   * 뜻이 분명한 셋을 만든다 — 나머지 넷은 아래 주석에 까닭을 적었다.
   */
  /**
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(E040719 실측). 결재란 자체는 이미 있었다
   * (utils/print.ts 의 signLineHtml · GET /api/print-sign-lines/default) —
   * 이 화면이 그 스위치를 안 달고 있었을 뿐이다.
   */
  const [signBox, setSignBox] = useState(false)
  const [withUntracked, setWithUntracked] = useState(false)
  /**
   * 원본 <b>[사용중단품목포함]은 켜져 있다</b>(2026-09-09 실측). 우리는 꺼 두었다 —
   * 재고잔량분석표·재고현황·재고수불부에 이어 <b>네 번째</b>로 같은 값이 뒤집혀 있었다.
   * 변동표에서 이게 꺼지면 <b>내린 품목이 이 달에 얼마나 움직였는지</b>가 통째로 빠져,
   * 기초·입고·출고·기말 합계가 실제 창고와 어긋난 채 맞는 것처럼 보인다.
   */
  const [withInactive, setWithInactive] = useState(true)
  /*
   * 원본 조건 <b>[품목구분]·[품목그룹1]</b> — [품목] 바로 뒤에 선다(2026-09-09 실측).
   * 훅이 이미 품목 마스터를 들고 있어 값을 더 받아 올 것이 없다.
   */
  const [category, setCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  /**
   * 원본 조건 <b>[관리항목]</b> — [대표품목으로 합산]과 [기타] 사이다(2026-09-09 실측).
   * 관리항목은 품목 마스터에 붙는 값이라 변동표 줄에는 안 실려 온다. 이 화면은 이미
   * 품목 마스터를 통째로 받고 있으니(<code>items</code>) 줄의 itemId 로 화면에서 잇는다.
   */
  const [mgmtCond, setMgmtCond] = useState('')
  const [byItemName, setByItemName] = useState(false)
  /**
   * 원본 조건 <b>[대표품목으로 합산]</b>. 색·용량만 다른 형제 품목을 <b>대표품목 한 줄</b>로
   * 모아 본다. 규격별로 갈린 표에서는 "이 물건이 이 달에 통틀어 얼마나 움직였나" 를
   * 눈으로 더해야 한다. 원본과 같이 기본은 꺼 둔다.
   */
  const [rollUp, setRollUp] = useState(false)
  /** 대표품목을 알려면 품목 마스터가 필요하다 — 변동표 응답에는 품목 id 만 온다. */
  const [items, setItems] = useState<Item[]>([])
  /** 원본 [구분] — 집계·일별·월별. */
  const [mode, setMode] = useState<'집계' | '일별' | '월별'>('집계')
  const [buckets, setBuckets] = useState<BucketRow[]>([])

  async function loadRefs() {
    const [w, i] = await Promise.all([
      api.get<Warehouse[]>('/warehouses'),
      api.get<Item[]>('/items'),
    ])
    setWarehouses(w.data)
    setItems(i.data)
  }
  async function load() {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      if (warehouseId) params.warehouseId = warehouseId
      const res = await api.get<MovementRow[]>('/stock/movement', { params: { ...params, includeTransfers: String(withTransfers) } })
      setRows(res.data)

      if (mode === '집계') {
        setBuckets([])
      } else {
        const openingTotal = res.data.reduce((n, r) => n + r.opening, 0)
        /*
         * <b>all=true</b> — 재고수불부 API 는 기본으로 앞 5천 줄에서 자른다(원본 [오천건이상조회]).
         * 여기서는 줄을 보여 주는 것이 아니라 <b>다 더하는</b> 것이라, 잘린 채 더하면 뒤쪽 날짜의
         * 입고·출고가 조용히 빠지고 마지막 구간 기말이 집계 보기의 기말과 어긋난다.
         */
        const led = await api.get<{ rows: BucketTx[] }>('/stock/ledger', { params: { ...params, all: 'true' } })
        const dropMoves = !withTransfers && !warehouseId
        setBuckets(stockBuckets(openingTotal, dropMoves ? led.data.rows.filter((r) => !(r.note ?? '').startsWith('창고이동')) : led.data.rows, mode))
      }
    } catch (err) { setError(extractErrorMessage(err)); setRows([]); setBuckets([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadRefs() }, [])
  // 보기 구분이 바뀌면 계산 근거가 달라지므로 다시 조회한다. 기간·창고도 서버가 거르는 조건이라 바꾸면 다시 받는다
  // — 예전엔 [검색]을 눌러야 해서, 창고를 골라도 목록은 전 창고 그대로였다(QA 22회차, 재고수불부와 같은 문제).
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mode, from, to, warehouseId, withTransfers])

  /** 일별·월별 보기에서 '입출고수량0제외' 를 걸면 움직임이 없는 날은 뺀다. */
  const shownBuckets = useMemo(
    () => buckets.filter((b) => !hideZero || b.inQty !== 0 || b.outQty !== 0),
    [buckets, hideZero],
  )

  const reset = () => {
    setFrom(firstOfMonth()); setTo(today())
    setWarehouseId(''); setKeyword(''); setItemCond(''); setHideZero(false); setMode('집계'); setRollUp(false)
    setCategory(''); setItemGroup(''); setMgmtCond(''); setWithInactive(true)
  }

  /* 품목의 [수량관리]·[사용여부] 는 품목 마스터가 든다 — 변동표 줄에는 없어 따로 받는다. */
  const { inactive, untracked, categoryOf, groupOf, categories, groups } = useItemFlags()
  /* 원본 격자의 [규격]. 줄에는 없고 품목 마스터가 든다 — id 로 잇는다. */
  const specOf = (itemId: number) => items.find((x) => x.id === itemId)?.spec ?? ''
  const mgmt = useItemMgmt(items)

  const shown = useMemo(() => {
    const kw = keyword.trim()
    // 대표로 모으면 줄의 id 가 대표 품목이 된다 — 고른 품목도 그 대표로 바꿔 견준다.
    const picked = itemCond ? Number(itemCond) : null
    const pickedId = picked != null && rollUp
      ? (items.find((it) => it.id === picked)?.parentItemId ?? picked) : picked
    /*
     * 대표로 모을 때는 <b>더한 뒤에 거른다.</b> 먼저 거르면 형제 하나가 검색어에 안 걸려
     * 빠지고, 그러면 대표 줄의 수량이 조용히 모자란다.
     */
    let base = rows
    if (rollUp) {
      const head = new Map(items.map((it) => [it.id, it.parentItemId ?? it.id]))
      const names = new Map(items.map((it) => [it.id, it]))
      const m = new Map<number, MovementRow>()
      for (const r of rows) {
        const id = head.get(r.itemId) ?? r.itemId
        const h = names.get(id)
        const cur = m.get(id) ?? {
          ...r, itemId: id,
          itemCode: h?.code ?? r.itemCode, itemName: h?.name ?? r.itemName,
          opening: 0, inQty: 0, outQty: 0, closing: 0,
        }
        cur.opening += r.opening; cur.inQty += r.inQty
        cur.outQty += r.outQty; cur.closing += r.closing
        m.set(id, cur)
      }
      base = [...m.values()]
    }
    const filtered = base.filter((r) => {
      /* [포함] 이라 이름 붙은 것은 기본이 '안 넣음' 이다 — 켜야 보인다. */
      if (!withUntracked && untracked.has(r.itemId)) return false
      if (!withInactive && inactive.has(r.itemId)) return false
      if (category && categoryOf(r.itemId) !== category) return false
      if (itemGroup && groupOf(r.itemId) !== itemGroup) return false
      if (mgmtCond && mgmt.nameOf(r.itemId) !== mgmtCond) return false
      if (kw && !r.itemName.includes(kw) && !r.itemCode.includes(kw)) return false
      if (pickedId != null && r.itemId !== pickedId) return false
      if (hideZero && r.inQty === 0 && r.outQty === 0) return false
      return true
    })
    /* 원본 [품목명(정렬)] — 켜면 품목명 가나다순. 안 켜면 서버가 준 차례 그대로. */
    return byItemName
      ? [...filtered].sort((a, b) => a.itemName.localeCompare(b.itemName, 'ko'))
      : filtered
  }, [rows, keyword, itemCond, hideZero, rollUp, items, withUntracked, withInactive, byItemName, untracked, inactive,
    category, itemGroup, categoryOf, groupOf, mgmtCond, mgmt])

  /* [일별]·[월별] 이면 그 표의 구간들로 센다 — 집계 줄(품목·검색어로 걸러진)로 세면 위 줄들과 어긋난다. */
  const totals = useMemo(() => (mode !== '집계' ? bucketTotals(shownBuckets) : shown.reduce((s, r) => ({
    opening: s.opening + r.opening, inQty: s.inQty + r.inQty, outQty: s.outQty + r.outQty, closing: s.closing + r.closing,
  }), { opening: 0, inQty: 0, outQty: 0, closing: 0 })), [mode, shown, shownBuckets])


  return (
    <EcListShell
      title="재고변동표"
      signLine={signBox}
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
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['집계', '일별', '월별'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} value={warehouseId} onChange={setWarehouseId}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name, sub: w.location }))} />
        </EcCond>
        {mode === '집계' && (
          <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={itemCond} onChange={(v) => setItemCond(v)}
                           items={pickers.items} />
        </EcCond>
        )}
        {mode === '집계' && (
          <EcCond label="품목구분">
            <select className="ec-input" value={category} style={{ width: 130 }}
                    onChange={(e) => setCategory(e.target.value)}>
              <option value="">전체</option>
              {categories.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </EcCond>
        )}
        {mode === '집계' && (
          <EcCond label="품목그룹1">
            <select className="ec-input" value={itemGroup} style={{ width: 150 }}
                    onChange={(e) => setItemGroup(e.target.value)}>
              <option value="">전체</option>
              {groups.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </EcCond>
        )}
        {/*
          원본 차례: <b>[대표품목으로 합산] 이 [기타] 앞</b>이다(2026-09-09 실측).
          예전에는 "[기타] 뒤가 마지막(세 화면이 다 같다)" 이라 적어 두었는데 사본만 보고 적은 것이라 틀렸다.
          집계 보기에서만 뜻이 있다 — 일별·월별은 이미 품목을 한 덩어리로 굴린 표다.
        */}
        {mode === '집계' && (
          <EcCond label="대표품목으로 합산">
            <label className="text-[12px]">
              <input type="checkbox" checked={rollUp}
                     onChange={(e) => setRollUp(e.target.checked)} /> 형제 품목을 대표 한 줄로
            </label>
          </EcCond>
        )}
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        {/*
          원본 [기타] 일곱 중 하나는 아직 없다 —
          [개별창고기준]은 무엇을 가르는지 자료 없이 못 재어 지어내지 않았다.
        */}
        <EcCond label="기타">
          <div className="flex gap-[12px] flex-wrap">
            <label className="text-[12px]">
              <input type="checkbox" checked={signBox}
                     onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
            </label>
            <label className="text-[12px]">
              <input type="checkbox" checked={withUntracked}
                     onChange={(e) => setWithUntracked(e.target.checked)} /> 수량관리제외품목포함
            </label>
            <label className="text-[12px]">
              <input type="checkbox" checked={withInactive}
                     onChange={(e) => setWithInactive(e.target.checked)} /> 사용중단품목포함
            </label>
            <label className="text-[12px]">
              <input type="checkbox" checked={withTransfers}
                     onChange={(e) => setWithTransfers(e.target.checked)} /> 생산불출/창고이동포함
            </label>
            <label className="text-[12px]">
              <input type="checkbox" checked={hideZero}
                     onChange={(e) => setHideZero(e.target.checked)} /> 입출고수량0제외
            </label>
            <label className="text-[12px]">
              <input type="checkbox" checked={byItemName}
                     onChange={(e) => setByItemName(e.target.checked)} /> 품목명(정렬)
            </label>
          </div>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        {mode === '집계' ? '품목' : mode === '일별' ? '일수' : '월수'}{' '}
        <b className="text-ec-text">{(mode === '집계' ? shown.length : shownBuckets.length).toLocaleString()}</b>
        <span className="my-0 mx-[8px] text-ec-off">|</span>
        입고계 <b className="text-ec-blue text-[14px]">{num(totals.inQty)}</b>
        <span className="my-0 mx-[8px] text-ec-off">|</span>
        출고계 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.outQty)}</b>
      </div>

      {mode !== '집계' ? (
        <table className="w-full text-left">
          <colgroup>
            <col className="w-[5%]" /><col /><col className="w-[11%]" />
            <col className="w-[15%]" /><col className="w-[15%]" />
            <col className="w-[15%]" /><col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>{mode === '일별' ? '일자' : '월'}</th>
              <th className="text-right">건수</th>
              <th className="text-right">기초</th>
              <th className="text-right">입고</th>
              <th className="text-right">출고</th>
              <th className="text-right">기말</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-ec-ink">불러오는 중…</td></tr>
            ) : shownBuckets.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
            ) : shownBuckets.map((b, i) => (
              <tr key={b.key}>
                <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>
                <td>{b.key.replace(/-/g, '/')}</td>
                <td className="text-right text-ec-hint">{num(b.count)}</td>
                <td className="text-right">{num(b.opening)}</td>
                <td className="text-right text-ec-blue">{num(b.inQty)}</td>
                <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(b.outQty)}</td>
                <td className="text-right font-bold">{num(b.closing)}</td>
              </tr>
            ))}
          </tbody>
          {shownBuckets.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} className="text-right font-bold bg-ec-page">합계</td>
                <td className="text-right font-bold bg-ec-page">{num(shownBuckets[0].opening)}</td>
                <td className="text-right font-bold bg-ec-page">{num(totals.inQty)}</td>
                <td className="text-right font-bold bg-ec-page">{num(totals.outQty)}</td>
                <td className="text-right font-bold bg-ec-page">
                  {num(shownBuckets[shownBuckets.length - 1].closing)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            {/*
              <b>재고변동표(E040719) [구분]=집계·종 2026-09-09 원본 격자 실측</b> —
              [품목코드 · 품목명 · <b>규격</b> · <b>전일재고</b> · <b>입고수량</b> ·
              <b>출고수량</b> · <b>재고수량</b>] (맨 뒤에 품목코드를 한 번 더 찍는다 —
              가로로 넓은 표에서 오른쪽 끝을 보다 어느 품목인지 놓치지 않게 하는 칸이라
              우리 일곱 칸짜리 표에는 두지 않는다).
              우리는 (1) 수량 넷을 <b>[기초]·[입고]·[출고]·[기말]</b> 이라 불렀고 —
              재고수불부와도 어긋난 이름이다(거기서도 원본은 [입고수량]·[출고수량]·
              [재고수량] 이었다), (2) <b>[규격] 열이 없었다</b>.
              [단위]는 우리가 더 두는 열이다.
            */}
            <th className="w-[34px]"></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th className="w-[110px]">규격</th>
            <th className="text-center w-[50px]">단위</th>
            <th className="text-right">전일재고</th>
            <th className="text-right">입고수량</th>
            <th className="text-right">출고수량</th>
            <th className="text-right">재고수량</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} className="text-center text-ec-hint p-[20px]">
              {rows.length === 0 ? '해당 기간의 재고 변동이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.itemId}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td className="text-ec-label">{specOf(r.itemId)}</td>
              <td className="text-center text-ec-hint">{r.unit}</td>
              <td className="text-right text-ec-label">{num(r.opening)}</td>
              <td style={{ textAlign: 'right', color: r.inQty ? 'var(--ec-blue)' : 'var(--ec-text-off)', fontWeight: r.inQty ? 600 : 400 }}>{r.inQty ? num(r.inQty) : ''}</td>
              <td style={{ textAlign: 'right', color: r.outQty ? '#a5561b' : 'var(--ec-text-off)', fontWeight: r.outQty ? 600 : 400 }}>{r.outQty ? num(r.outQty) : ''}</td>
              <td className="text-right font-bold">{num(r.closing)}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={5} className="text-right">합계</td>
              <td className="text-right">{num(totals.opening)}</td>
              <td className="text-right text-ec-blue">{num(totals.inQty)}</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totals.outQty)}</td>
              <td className="text-right">{num(totals.closing)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      )}
    </EcListShell>
  )
}
