import { useEffect, useMemo, useRef, useState } from 'react'
import { dateText } from '../../utils/dateText'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { periodOf } from '../../components/EcPeriodPicks'

/**
 * 영업관리 > 단가변동표 (이카운트 E040819)
 * 판매·매입 전표 라인의 실제 단가를 품목별로 모아 기간 내 최저·최고·평균·최근 단가와 변동폭을 본다.
 * 별도 단가이력 테이블 없이 거래 단가(라인 unitPrice)로 도출한다(백엔드 무변경).
 * 데이터는 GET /api/sales, /purchases, /items(표준단가).
 *
 * <p>2026-09-08 에 원본을 열어 조건 판을 재니 <b>[기본] 열일곱 · [전체] 스물둘</b>이다
 * (사본에는 여덟뿐이었다). 접힌 줄은 없다. 조건이 더 많은 <b>[전체]</b> 쪽에 맞춘다 —
 * 매출계획비교표·월별이익현황과 같은 규칙이다.
 * 차례: 구분 · 기준일자 · 창고 · (창고계층그룹) · 거래처 · <b>거래처그룹1</b> ·
 * (거래처그룹2 · 거래처계층그룹) · 품목 · <b>품목구분 · 품목그룹1</b> ·
 * (품목그룹2/3 · 품목계층그룹) · <b>프로젝트</b> · (프로젝트그룹1/2) · <b>담당자 ·
 * 거래처관리담당자</b> · 단가구분 · 단가기준 · <b>기타</b>.
 *
 * <p>실측이 바로잡은 둘:
 * <ul>
 *   <li><b>[기준일자] 기본값이 금월이다.</b> 우리는 <b>비워 두어</b> 열자마자 몇 해치
 *       거래 단가를 한 평균으로 뭉개고 있었다 — 단가가 언제 움직였는지를 보는 표인데.
 *   <li><b>[기타] 가 통째로 없었다.</b> 체크는 넷 — 결재방표시 · 수량표시 ·
 *       단가등락폭표시 · <b>변동없는단가포함</b>, 넷 다 꺼짐이 기본이다.
 *       특히 마지막 것 때문에 <b>한 번도 안 변한 단가</b>가 늘 표를 채우고 있었다.
 * </ul>
 *
 * <p>화면 안쪽 ecpath 는 <code>ESP021R_…</code> 이다 — 대조표에 적혀 있던 그 코드는
 * <b>양식의 내부 id</b> 이고, 메뉴가 쓰는 화면코드는 주소창의 <b>E040819</b> 다.
 */

/**
 * 원본 [단가구분]. <b>기본이 [전체]</b> 다(2026-09-09 E040819 실측) — 그래서 원본
 * [전표별] 격자에 <b>판매단가와 구매단가가 나란히</b> 선다. 우리에겐 전체가 없어
 * 한 번에 한쪽만 볼 수 있었다.
 *
 * <p><b>[품목별] 요약은 전체를 못 받는다.</b> 그 표는 품목마다 최저·최고·평균을 내는데
 * 판매단가와 구매단가를 <b>한 평균에 섞으면 거짓</b>이 된다(파는 값과 사는 값이다).
 * 원본은 그 자리에서 열을 판매·구매로 갈라 두 벌 내는데 우리는 아직 한 벌이다 —
 * 전체를 고른 채 [품목별]로 가면 <b>고르라고 말하고 표를 비운다.</b> 섞은 숫자를
 * 내놓는 것보다 낫다.
 */
type Mode = 'ALL' | 'SALE' | 'PURCHASE'

/**
 * 원본 단가변동표(ESP021R)의 <b>[단가기준]</b> — 체크박스 넷이고 처음엔
 * <b>단순평균단가만</b> 켜져 있다(사본 실측: 전체(0) · 단순평균단가(1, checked) ·
 * 최고단가(2) · 최저단가(3)).
 *
 * <p>[단가구분](판매·매입)과 <b>다른 것</b>이다. 그쪽은 어느 전표의 단가를 볼지이고,
 * 이쪽은 그 단가를 <b>무엇으로 요약해 보여 줄지</b>다. 우리는 셋을 늘 한꺼번에 냈다 —
 * 평균만 보고 싶어도 최고·최저가 늘 따라와 표가 넓었다.
 */
const PRICE_BASES = ['단순평균단가', '최고단가', '최저단가'] as const

interface PriceRow {
  itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  standard: number; count: number; quantity: number
  min: number; max: number; avg: number; latest: number; latestDate: string
}

const won = (n: number) => n.toLocaleString('ko-KR')

export default function PriceMovementPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 단가변동표의 조건 차례는 <b>구분 · 기준일자 · 창고 · 거래처 · 품목 …</b> 다(사본 실측).
   * 창고·거래처가 없었다 — 같은 품목도 창고나 거래처가 다르면 단가가 다른데,
   * 그것들을 <b>한 줄로 뭉쳐</b> 평균을 내고 있었다.
   */
  const [warehouse, setWarehouse] = useState('')
  const [partner, setPartner] = useState('')
  const pickers = useCondPickers(['warehouses', 'partners', 'projects'])

  /* 원본 [단가구분] 기본은 <b>전체</b>다(2026-09-09 실측). 우리는 판매로 열고 있었다. */
  const [mode, setMode] = useState<Mode>('ALL')
  /**
   * 원본 단가변동표의 <b>[구분]</b> — 조건 판의 <b>맨 앞</b> 줄이다(사본 실측: 선택상자이고
   * 열릴 때 값이 <b>'전표별'</b>이다). 무엇을 한 줄로 볼지를 고른다.
   *
   * <p>우리는 <b>품목별로만</b> 냈다 — 품목마다 평균·최고·최저를 요약해 보여 주는 표다.
   * 그래서 "그 최고단가가 <b>어느 전표</b>였나" 를 이 화면에서 짚을 수가 없어, 전표조회로
   * 건너가 날짜로 뒤져야 했다. 원본이 기본으로 여는 쪽이 그 전표별이다.
   */
  const [gubun, setGubun] = useState<'전표별' | '품목별'>('전표별')
  /* 원본 기본값 그대로 — 단순평균단가만 켠다. */
  const [bases, setBases] = useState<string[]>(['단순평균단가'])
  const withAvg = bases.includes('단순평균단가')
  const withMax = bases.includes('최고단가')
  const withMin = bases.includes('최저단가')
  /* 원본 [기준일자] 기본값은 <b>금월</b>이다(2026-09-08 실측 — 달 칸이 09 하나다). */
  const initP = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 단가변동표 조건 차례: 구분 · 기준일자 · 창고 · 거래처 · <b>품목</b> · <b>단가구분</b> · 단가기준.
   * [품목]은 검색상자로 갈음하고 있었는데, 그 상자는 규격까지 훑는 <b>글자 찾기</b>라
   * 품목 하나를 골라 그 단가 흐름만 보는 일은 못 했다. 코드도움으로 따로 세운다.
   */
  const [itemCond, setItemCond] = useState('')
  /* 2026-09-08 실측으로 만든 여섯. 값은 전부 이미 응답이나 마스터에 있다. */
  const [partnerGroup, setPartnerGroup] = useState('')
  const [partnerMgr, setPartnerMgr] = useState('')
  const [category, setCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [project, setProject] = useState('')
  const [employee, setEmployee] = useState('')
  const pgroup = usePartnerGroups()
  const pmgr = usePartnerManagers()
  const mgmt = useItemMgmt()
  /*
   * 원본 [기타] 넷. 넷 다 꺼짐이 기본이다.
   *   결재방표시 — 출력물에 결재란을 찍는다
   *   수량표시 — 요약표에 수량 열을 더한다
   *   단가등락폭표시 — 최고−최저 변동폭 열을 더한다
   *   변동없는단가포함 — 한 번도 안 변한 품목(최저=최고)까지 낸다
   */
  const [signBox, setSignBox] = useState(false)
  const [showQty, setShowQty] = useState(false)
  const [showSwing, setShowSwing] = useState(false)
  const [withFlat, setWithFlat] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b, i] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<Item[]>('/items'),
      ])
      setSales(s.data); setPurchases(b.data); setItems(i.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const priceById = useMemo(() => new Map(items.map((it) => [it.id, it.unitPrice])), [items])

  /** 전표 하나가 조건을 지나는가. 두 표(요약·전표별)가 같은 규칙을 써야 서로 짚을 수 있다. */
  const keepDoc = (d: SalesDoc | PurchaseDoc) =>
    (!warehouse || d.warehouseName.includes(warehouse))
    && (!partner || d.partnerName.includes(partner))
    && (!partnerGroup || pgroup.groupOfName(d.partnerName) === partnerGroup)
    && (!partnerMgr || pmgr.managerOfName(d.partnerName) === partnerMgr)
    && (!project || (d.projectName ?? '').includes(project))
    && (!employee || (d.employeeName ?? '') === employee)
  /** 라인 하나가 품목 조건을 지나는가. */
  const keepLine = (l: { itemId: number; itemCategoryName: string | null }) =>
    (!category || (l.itemCategoryName ?? '') === category)
    && (!itemGroup || mgmt.groupOf(l.itemId) === itemGroup)

  const rows = useMemo<PriceRow[]>(() => {
    const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)
    // (date, itemId, spec, unit, name, price) 포인트 수집
    interface Pt { itemId: number; itemName: string; spec: string | null; unit: string; date: string; price: number; quantity: number }
    const pts: Pt[] = []
    /* 품목별 요약은 한 갈래만 받는다 — 위 Mode 주석 참고. */
    const docs = mode === 'SALE'
      ? sales.filter(keepDoc).map((d) => ({ date: d.saleDate, lines: d.lines }))
      : mode === 'PURCHASE'
        ? purchases.filter(keepDoc).map((d) => ({ date: d.purchaseDate, lines: d.lines }))
        : []
    for (const d of docs) {
      if (!inPeriod(d.date)) continue
      for (const l of d.lines) {
        if (l.unitPrice == null) continue
        if (!keepLine(l)) continue
        pts.push({ itemId: l.itemId, itemName: l.itemName, spec: l.spec, unit: l.unit, date: d.date, price: l.unitPrice, quantity: l.quantity })
      }
    }

    const map = new Map<number, Pt[]>()
    for (const p of pts) { const a = map.get(p.itemId) ?? []; a.push(p); map.set(p.itemId, a) }

    const kw = keyword.trim()
    const pickedItem = itemCond.trim()
    const out: PriceRow[] = []
    for (const [itemId, list] of map) {
      // 최근 = 날짜(동일 날짜면 뒤에 온 것) 기준
      const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      const prices = sorted.map((p) => p.price)
      const sum = prices.reduce((a, x) => a + x, 0)
      const last = sorted[sorted.length - 1]
      const item = items.find((it) => it.id === itemId)
      out.push({
        itemId,
        itemCode: item?.code ?? '',
        itemName: last.itemName,
        spec: last.spec,
        unit: last.unit,
        standard: priceById.get(itemId) ?? 0,
        count: list.length,
        quantity: list.reduce((a, x) => a + x.quantity, 0),
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(sum / prices.length),
        latest: last.price,
        latestDate: last.date,
      })
    }
    return out
      .filter((r) => !kw || r.itemName.includes(kw) || r.itemCode.includes(kw))
      .filter((r) => !pickedItem || r.itemName === pickedItem)
      /* 원본 [기타]의 <b>변동없는단가포함</b> — 기본은 꺼짐이라 안 변한 품목은 뺀다. */
      .filter((r) => withFlat || r.min !== r.max)
      .sort((a, b) => (b.max - b.min) - (a.max - a.min))
  }, [sales, purchases, items, priceById, mode, from, to, keyword, warehouse, partner, itemCond,
      partnerGroup, partnerMgr, category, itemGroup, project, employee, withFlat])

  /**
   * [전표별] 한 줄 = 전표의 한 라인. 같은 조건으로 모은 점(Pt)을 요약하지 않고 그대로 편다.
   * 위 요약이 어디서 나왔는지를 이 표에서 바로 짚을 수 있어야 한다.
   */
  const lineRows = useMemo(() => {
    if (gubun !== '전표별') return []
    const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)
    /* [전체]면 판매·구매를 한 표에 모은다 — 원본 기본이 그렇다. */
    const saleDocs = sales.filter(keepDoc)
      .map((d) => ({ kind: 'SALE' as const, date: d.saleDate, no: d.docNo, partner: d.partnerName, lines: d.lines }))
    const buyDocs = purchases.filter(keepDoc)
      .map((d) => ({ kind: 'PURCHASE' as const, date: d.purchaseDate, no: d.docNo, partner: d.partnerName, lines: d.lines }))
    const docs = mode === 'SALE' ? saleDocs : mode === 'PURCHASE' ? buyDocs : [...saleDocs, ...buyDocs]
    const kw = keyword.trim()
    const pickedItem = itemCond.trim()
    const out = []
    for (const d of docs) {
      if (!inPeriod(d.date)) continue
      for (const l of d.lines) {
        if (l.unitPrice == null) continue
        if (kw && !l.itemName.includes(kw)) continue
        if (pickedItem && l.itemName !== pickedItem) continue
        if (!keepLine(l)) continue
        out.push({
          key: `${d.kind}-${d.no}-${l.itemId}-${out.length}`,
          kind: d.kind,
          date: d.date, no: d.no ?? '', partner: d.partner,
          itemCode: l.itemCode, itemName: l.itemName, spec: l.spec, unit: l.unit,
          quantity: l.quantity, price: l.unitPrice,
        })
      }
    }
    /* 값이 언제 어떻게 움직였나를 보는 표라 <b>날짜순</b>이다 — 요약표는 변동폭순이다. */
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [gubun, sales, purchases, mode, from, to, keyword, warehouse, partner, itemCond,
      partnerGroup, partnerMgr, category, itemGroup, project, employee])

  const label: React.CSSProperties = { width: 44, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  /*
   * [단가기준]으로 요약 칸이 켜지고 꺼지니 <b>정적으로는 못 세는 표</b>가 됐다.
   * 렌더된 표를 직접 재는 검사를 단다.
   */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '단가변동표', [withMin, withMax, withAvg, showQty, showSwing, rows.length])

  return (
    <EcListShell
      title="단가변동표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
      signLine={signBox}
    >
      <p className="mb-2 text-xs text-slate-500">품목별 실거래 단가의 최저·최고·평균·최근과 변동폭. 단가는 판매/매입 전표 라인에서 집계(변동폭 큰 순).</p>

      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        {/* 원본 차례: <b>[구분]</b> 이 조건 판의 맨 앞이다(사본 실측). */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>구분</span>
          <div className="ec-pills">
            {(['전표별', '품목별'] as const).map((g) => (
              <button key={g} type="button" className={`ec-pill no-ec${gubun === g ? ' active' : ''}`}
                      onClick={() => setGubun(g)}>{g}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* 원본 단가변동표는 이 줄을 <b>[기준일자]</b> 라고 부른다(사본 실측) — [기간]이 아니다. */}
          <span style={label}>기준일자</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        {/* 원본 조건 차례: 구분 · 기준일자 · <b>창고 · 거래처</b> · 품목 … */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={160} emptyLabel="전체"
                           value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>거래처</span>
          <CodePickerField label="거래처" hideLabel width={160} emptyLabel="전체"
                           value={partner} onChange={setPartner} items={pickers.partners} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 74 }}>거래처그룹1</span>
          <CodePickerField label="거래처그룹1" hideLabel width={140} emptyLabel="전체"
                           value={partnerGroup} onChange={setPartnerGroup}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>품목</span>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 60 }}>품목구분</span>
          <select className="ec-input" value={category} style={{ width: 130 }}
                  onChange={(e) => setCategory(e.target.value)}>
            <option value="">전체</option>
            {[...new Set([...sales, ...purchases].flatMap((d) => d.lines.map((l) => l.itemCategoryName))
              .filter(Boolean) as string[])].sort().map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 66 }}>품목그룹1</span>
          <select className="ec-input" value={itemGroup} style={{ width: 150 }}
                  onChange={(e) => setItemGroup(e.target.value)}>
            <option value="">전체</option>
            {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 60 }}>프로젝트</span>
          <CodePickerField label="프로젝트" hideLabel width={150} emptyLabel="전체"
                           value={project} onChange={setProject} items={pickers.projects} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>담당자</span>
          <CodePickerField label="담당자" hideLabel width={130} emptyLabel="전체"
                           value={employee} onChange={setEmployee}
                           items={[...new Set([...sales, ...purchases].map((d) => d.employeeName)
                             .filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 100 }}>거래처관리담당자</span>
          <CodePickerField label="거래처관리담당자" hideLabel width={140} emptyLabel="전체"
                           value={partnerMgr} onChange={setPartnerMgr}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </div>
        {/*
          원본 단가변동표 조건의 <b>[단가구분]</b>. 이 알약이 그 일을 하는데 <b>이름표가 없어</b>
          무엇을 고르는 줄인지 화면만 보고는 알 수 없었다.
        */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>단가구분</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['ALL', 'SALE', 'PURCHASE'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="no-ec" style={{
              padding: '5px 14px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: mode === m ? 'var(--ec-blue)' : '#fff', color: mode === m ? '#fff' : '#3a4453', fontWeight: mode === m ? 700 : 400,
            }}>{m === 'ALL' ? '전체' : m === 'SALE' ? '판매단가' : '매입단가'}</button>
          ))}
        </div>
        {/*
          원본 [단가기준] — 어느 요약을 낼지. [단가구분](판매·매입)과 다른 줄이다.
          전부 끄면 <b>요약 칸이 하나도 없는 표</b>가 되므로 [전체]로 한 번에 켠다.
        */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>단가기준</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={bases.length === PRICE_BASES.length}
                   onChange={(e) => setBases(e.target.checked ? [...PRICE_BASES] : [])} />전체
          </label>
          {PRICE_BASES.map((k) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
              <input type="checkbox" checked={bases.includes(k)}
                     onChange={(e) => setBases((v) => (e.target.checked ? [...v, k] : v.filter((x) => x !== k)))} />
              {k}
            </label>
          ))}
        </div>
        {/*
          원본 [기타] — 조건 판의 <b>맨 끝</b>이다(2026-09-08 실측). 넷 다 꺼짐이 기본이다.
          우리 화면에는 이 줄이 통째로 없어서, 특히 <b>한 번도 안 변한 단가</b>가
          늘 표를 채우고 있었다(변동폭이 0 인 줄이라 아무 말도 안 해 준다).
        */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>기타</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />결재방표시
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={showQty} onChange={(e) => setShowQty(e.target.checked)} />수량표시
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={showSwing} onChange={(e) => setShowSwing(e.target.checked)} />단가등락폭표시
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={withFlat} onChange={(e) => setWithFlat(e.target.checked)} />변동없는단가포함
          </label>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>품목수 <b style={{ color: '#3c4553', fontSize: 14 }}>{rows.length}</b></div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        [전표별] 은 요약하지 않고 그대로 편다 — 요약표의 최고·최저가 <b>어느 전표였나</b>를
        여기서 바로 짚는다. 열이 고정이라 렌더 검사(useTableColumnCheck)를 걸지 않는다.
      */}
      {gubun === '전표별' ? (
      <table className="w-full text-left">
        <thead>
          <tr>
            {/*
              <b>단가변동표(E040819) [구분]=전표별 2026-09-09 원본 격자 실측</b> —
              [품목코드 · 품목명 · 규격 · <b>전표별</b> · 판매단가(단순평균) ·
              구매단가(단순평균)]. 넷째 칸의 이름이 <b>[구분]으로 고른 값 그대로</b>이고
              칸 안에는 일자와 전표번호가 <b>한 덩어리</b>로 들어간다(2026/09/04 -1).
              우리는 (1) 품목을 뒤에 두고 일자·전표번호를 두 칸으로 갈라 두었으며,
              (2) <b>[품목코드]가 없었다</b> — 줄이 진작 싣고 있는 값이다(l.itemCode).
              단가 칸 이름은 아직 [단가] 하나다: 원본은 [단가구분] 기본이 <b>전체</b>라
              판매·구매 단가를 <b>나란히</b> 두는데 우리 [단가구분]에는 전체가 없다
              (pending-columns.json 에 적었다).
              [거래처]·[단위]·[수량]은 우리 열이다.
            */}
            <th style={{ width: 34 }}></th>
            <th style={{ width: 110 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ width: 110 }}>규격</th>
            <th style={{ width: 170 }}>전표별</th>
            <th>거래처</th>
            <th style={{ width: 70 }}>단위</th>
            <th style={{ width: 90, textAlign: 'right' }}>수량</th>
            {/*
              원본은 [단가구분] 기본이 [전체]라 <b>판매단가와 구매단가를 나란히</b> 둔다.
              (원본 머리에는 [단가기준]으로 고른 값이 괄호로 붙는다 — [판매단가(단순평균)].
              우리 이 표는 <b>전표의 실제 단가</b>를 줄마다 찍는 것이라 평균이 아니어서
              그 괄호를 붙이지 않는다. 품목별 평균은 아래 [품목별] 표가 낸다.)
            */}
            <th style={{ width: 110, textAlign: 'right' }}>판매단가</th>
            <th style={{ width: 110, textAlign: 'right' }}>구매단가</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : lineRows.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : lineRows.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td>{r.spec ?? ''}</td>
              {/* 원본은 일자와 전표번호를 한 칸에 적는다. */}
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.date)} {r.no}</td>
              <td>{r.partner}</td>
              <td>{r.unit}</td>
              <td style={{ textAlign: 'right' }}>{r.quantity.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.kind === 'SALE' ? undefined : '#c5cbd3' }}>
                {r.kind === 'SALE' ? r.price.toLocaleString() : ''}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.kind === 'PURCHASE' ? undefined : '#c5cbd3' }}>
                {r.kind === 'PURCHASE' ? r.price.toLocaleString() : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      ) : (
      <div ref={tableRef}>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목코드</th>
            <th>품목명</th>
            <th>규격</th>
            <th style={{ textAlign: 'center', width: 46 }}>단위</th>
            <th style={{ textAlign: 'right' }}>표준단가</th>
            <th style={{ textAlign: 'right' }}>거래수</th>
            {/* 원본 [기타]의 <b>수량표시</b> — 기본은 꺼짐이다. */}
            {showQty && <th style={{ textAlign: 'right' }}>수량</th>}
            {/* 원본 [단가기준]으로 켜고 끈다 — 처음엔 평균만 보인다. */}
            {withMin && <th style={{ textAlign: 'right' }}>최저</th>}
            {withMax && <th style={{ textAlign: 'right' }}>최고</th>}
            {withAvg && <th style={{ textAlign: 'right' }}>평균</th>}
            <th style={{ textAlign: 'right' }}>최근</th>
            {/* 원본 [기타]의 <b>단가등락폭표시</b> — 기본은 꺼짐인데 우리는 늘 그리고 있었다. */}
            {showSwing && <th style={{ textAlign: 'right' }}>변동폭</th>}
            <th style={{ textAlign: 'right' }}>최근vs표준</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9 + (withMin ? 1 : 0) + (withMax ? 1 : 0) + (withAvg ? 1 : 0) + (showQty ? 1 : 0) + (showSwing ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9 + (withMin ? 1 : 0) + (withMax ? 1 : 0) + (withAvg ? 1 : 0) + (showQty ? 1 : 0) + (showSwing ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {mode === 'ALL'
                ? '[단가구분]을 판매단가 또는 매입단가로 골라 주세요 — 파는 값과 사는 값을 한 평균에 섞으면 거짓이 됩니다.'
                : (mode === 'SALE' ? sales.length : purchases.length) === 0 ? '거래 내역이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : rows.map((r, i) => {
            const range = r.max - r.min
            const vsStd = r.standard > 0 ? ((r.latest - r.standard) / r.standard) * 100 : 0
            return (
              <tr key={r.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ color: '#8a929c' }}>{r.spec ?? ''}</td>
                <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.standard)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.count}</td>
                {showQty && <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.quantity.toLocaleString()}</td>}
                {withMin && <td style={{ textAlign: 'right' }}>{won(r.min)}</td>}
                {withMax && <td style={{ textAlign: 'right' }}>{won(r.max)}</td>}
                {withAvg && <td style={{ textAlign: 'right', color: '#5a626e' }}>{won(r.avg)}</td>}
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.latest)}</td>
                {showSwing && <td style={{ textAlign: 'right', fontWeight: range ? 600 : 400, color: range ? '#c07a00' : '#c5cbd3' }}>{range ? won(range) : ''}</td>}
                <td style={{ textAlign: 'right', fontWeight: 600, color: vsStd > 0 ? '#1c7c3c' : vsStd < 0 ? '#c60a2e' : '#8a929c' }}>
                  {r.standard > 0 ? `${vsStd > 0 ? '+' : ''}${vsStd.toFixed(1)}%` : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      )}
    </EcListShell>
  )
}
