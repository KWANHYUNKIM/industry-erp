import { useEffect, useMemo, useState, useRef} from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { usePartnerManagers } from '../../utils/partnerManagers'
import EcBarChart from '../../components/EcBarChart'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 영업관리 > 집계표 (이카운트 E040710)
 * 거래처(또는 품목) × 12개월 매출/매입 금액 피벗 표. 행별·월별 합계 포함.
 * 데이터는 GET /api/sales / /purchases 집계(백엔드 무변경).
 *
 * <p>2026-09-08 에 원본을 열어 조건 판을 재니 <b>마흔둘</b>이다 — 사본에는 열하나뿐이었다.
 * 화면코드도 바로잡았다: 대조표의 <b>ESG011R</b> 이 아니라 주소창의 prgId 는 <b>E040710</b> 이다
 * (판매구매집계표 ESZ006R→E040725 와 같은 꼴).
 *
 * <p>실측이 바로잡은 것들:
 * <ul>
 *   <li><b>[메뉴구분]은 여섯 갈래다</b> — 판매★ · 구매 · 주문 · 발주 · 생산입고 · 판매구매.
 *       우리는 둘뿐이었고 이름도 <b>매출/매입</b> 이라 원본과 달랐다. 판매·구매·판매구매
 *       셋으로 넓히고 이름을 원본대로 고친다(주문·발주·생산입고는 아래 [남은 것]).
 *   <li><b>[관리항목]은 원본 조건 판에 없다.</b> 사본을 보고 우리가 만들어 둔 것이라 뺀다 —
 *       원본에 없는 조건을 두면 대조표가 거짓이 된다.
 *   <li>기간 칸의 원본 이름은 <b>[기준일자]</b> 이고 기본은 <b>전월+금월</b> 이다.
 *       우리 표는 <b>한 해 × 12개월</b> 피벗이라 기간을 연 단위로만 고른다 — 이름만 원본에 맞춘다.
 * </ul>
 *
 * <p>이번에 만든 것: 담당자 · 거래처그룹1 · 거래처관리담당자 · 품목구분 · 품목그룹1 · 적요.
 * 값은 전부 이미 응답에 있다.
 */

/** 원본 [메뉴구분] 여섯 중 우리가 낼 수 있는 셋. 이름은 원본 그대로다. */
type Mode = '판매' | '구매' | '판매구매'
const MODES = ['판매', '구매', '판매구매'] as const
type GroupBy = 'partner' | 'item'

interface PivotRow { key: string; name: string; months: number[]; total: number }

const won = (n: number) => n.toLocaleString('ko-KR')
const thisYear = () => Number(ymd(new Date()).slice(0, 4))
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
/*
 * 원본의 숫자 범위 조건 다섯 — 수량 · 단가 · 공급가액 · 부가세 · 부대비용.
 * 다섯 다 라인이 이미 싣는 값이다(부대비용은 TradeLine.extraCost).
 */

export default function PivotSummaryPage() {
  const [year, setYear] = useState<number>(thisYear())
  const [mode, setMode] = useState<Mode>('판매')
  const [groupBy, setGroupBy] = useState<GroupBy>('partner')
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 집계표의 조건에 <b>[거래처]·[품목]</b> 이 있다(사본 실측).
   * 집계 화면이라 <b>합치기 전</b>에 건다 — 합쳐 놓은 줄을 이름으로 거르면
   * [거래처별]로 볼 때 품목 조건이 아무것도 안 걸린다(그 줄의 이름은 거래처명이다).
   */
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  /*
   * 원본 집계표 조건 차례: <b>메뉴구분</b> · <b>거래유형</b> · 내.외자구분 · 창고 ·
   * 프로젝트 · 관리항목 · 거래처 · 품목 · <b>거래구분</b>.
   *
   * <p>[메뉴구분]은 매출/매입 알약이 이미 하는 일인데 <b>이름표가 없었다.</b>
   * [거래유형]은 과세인가 면세인가, [거래구분]은 일반인가 반품이다 —
   * 둘 다 전표가 들고 있는데 합친 뒤라 거를 수가 없었다. <b>합치기 전에</b> 건다.
   * 반품이 섞여 있으면 금액이 상계돼서, 반품만 따로 보고 싶을 때가 실제로 있다.
   */
  const [taxCond, setTaxCond] = useState<'전체' | '과세' | '면세'>('전체')
  const [kindCond, setKindCond] = useState<'전체' | '일반' | '반품'>('전체')
  /* 2026-09-08 실측으로 만든 여섯. 값은 전부 이미 응답에 있다. */
  const [empCond, setEmpCond] = useState('')
  const [partnerGroupCond, setPartnerGroupCond] = useState('')
  const [partnerMgrCond, setPartnerMgrCond] = useState('')
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [statusCond, setStatusCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  /*
   * 원본의 숫자 범위 조건 다섯 — 수량 · 단가 · 공급가액 · 부가세 · 부대비용.
   * 다섯 다 라인이 이미 싣는 값이다. 한 덩이로 묶어 둔다(칸이 열 개라 상태를 흩으면 읽기 어렵다).
   */
  const [range, setRange] = useState<Record<string, string>>({})
  const setR = (k: string, v: string) => setRange((r) => ({ ...r, [k]: v }))
  const inRange = (v: number | null, k: string) => {
    const lo = range[k + 'From']; const hi = range[k + 'To']
    if (lo !== undefined && lo !== '' && (v ?? 0) < Number(lo)) return false
    if (hi !== undefined && hi !== '' && (v ?? 0) > Number(hi)) return false
    return true
  }
  const pgroup = usePartnerGroups()
  const pmgr = usePartnerManagers()
  const condPick = useCondPickers(['partners', 'items', 'projects', 'warehouses'])

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b] = await Promise.all([api.get<SalesDoc[]>('/sales'), api.get<PurchaseDoc[]>('/purchases')])
      setSales(s.data); setPurchases(b.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  /**
   * 원본 [관리항목]. 품목 마스터에 붙는 값이라 전표 응답에는 없다 —
   * 품목 마스터를 받아 줄의 itemId 로 잇는다(판매현황이 먼저 그렇게 했다).
   */
  const mgmt = useItemMgmt()
  /** 원본 [품목구분]·[품목그룹1] 한 줄 판정. 품목구분은 라인이 진작 싣고 있다. */
  const lineHit = (l: {
    itemId: number; itemCategoryName: string | null; spec: string | null
    quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number; extraCost: number | null
  }) =>
    (!categoryCond || (l.itemCategoryName ?? '') === categoryCond)
    && (!itemGroupCond || mgmt.groupOf(l.itemId) === itemGroupCond)
    && (!specCond || (l.spec ?? '').includes(specCond))
    && inRange(l.quantity, 'qty') && inRange(l.unitPrice, 'price')
    && inRange(l.supplyAmount, 'supply') && inRange(l.vatAmount, 'vat')
    && inRange(l.extraCost, 'extra')

  /**
   * 원본 [데이터 보기형식] · [그래프로 보기] — 조건 판 <b>맨 끝</b>이다([거래구분] 뒤).
   * 이 화면은 조건 판을 손으로 짰으므로 알약도 직접 그린다.
   *
   * <p>이 표는 <b>거래처(또는 품목) × 12개월</b> 피벗이다. 그림은 <b>줄 합계</b>를 그린다 —
   * 달마다 막대를 그리면 열두 배로 늘어서서 '누가 큰가' 가 안 보인다. 표에서 맨 오른쪽
   * 합계 칸을 눈으로 훑던 일을 그림이 대신한다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')

  const rows = useMemo<PivotRow[]>(() => {
    const flat = (d: SalesDoc | PurchaseDoc, date: string) => ({
      date, partnerId: d.partnerId, partnerName: d.partnerName, projectName: d.projectName,
      warehouseName: d.warehouseName, taxable: d.taxable, tradeKindName: d.tradeKindName,
      employeeName: d.employeeName, remark: d.remark, lines: d.lines,
      /*
       * 원본 [진행상태]. <b>판매 전표에만 있다</b> — 구매 전표(PurchaseDoc)에는
       * 확인 상태 칸이 없다. 없는 쪽은 null 로 두고, 고르면 그 줄이 빠진다.
       */
      confirmStatusName: 'confirmStatusName' in d ? d.confirmStatusName : null,
      createdBy: d.createdBy,
    })
    const inYear = (date: string) => date.slice(0, 4) === String(year)
    const saleDocs = sales.filter((d) => inYear(d.saleDate)).map((d) => flat(d, d.saleDate))
    const buyDocs = purchases.filter((d) => inYear(d.purchaseDate)).map((d) => flat(d, d.purchaseDate))
    /* 원본 [메뉴구분]의 <b>판매구매</b> — 두 전표를 한 표에 함께 더한다. */
    const docs = mode === '판매' ? saleDocs : mode === '구매' ? buyDocs : [...saleDocs, ...buyDocs]

    const map = new Map<string, PivotRow>()
    const bump = (key: string, name: string): PivotRow => {
      let r = map.get(key)
      if (!r) { r = { key, name, months: new Array(12).fill(0), total: 0 }; map.set(key, r) }
      return r
    }
    for (const d of docs) {
      if (taxCond !== '전체' && (taxCond === '과세') !== d.taxable) continue
      if (kindCond !== '전체' && d.tradeKindName !== kindCond) continue
      if (partnerCond && !d.partnerName.includes(partnerCond)) continue
      if (warehouseCond && !d.warehouseName.includes(warehouseCond)) continue
      if (projectCond && !(d.projectName ?? '').includes(projectCond)) continue
      if (empCond && (d.employeeName ?? '') !== empCond) continue
      if (partnerGroupCond && pgroup.groupOfName(d.partnerName) !== partnerGroupCond) continue
      if (partnerMgrCond && pmgr.managerOfName(d.partnerName) !== partnerMgrCond) continue
      if (remarkCond && !(d.remark ?? '').includes(remarkCond)) continue
      if (statusCond && (d.confirmStatusName ?? '') !== statusCond) continue
      if (authorCond && (d.createdBy ?? '') !== authorCond) continue
      if (itemCond && !d.lines.some((l) => l.itemName.includes(itemCond))) continue
      /*
       * 원본 [품목구분]·[품목그룹1]. [거래처별]로 더할 때는 라인을 자르지 않고
       * <b>그 조건에 맞는 줄을 하나라도 가진 전표</b>만 센다 — 라인을 자르면
       * 전표 합계가 아니게 된다(판매구매집계표와 같은 규칙).
       */
      if (!d.lines.some(lineHit)) continue
      const m = Number(d.date.slice(5, 7)) - 1
      if (groupBy === 'partner') {
        const supply = d.lines.reduce((a, l) => a + l.supplyAmount, 0)
        const r = bump(`P${d.partnerId}`, d.partnerName)
        r.months[m] += supply; r.total += supply
      } else {
        for (const l of d.lines) {
          if (itemCond && !l.itemName.includes(itemCond)) continue
          if (!lineHit(l)) continue
          const r = bump(`I${l.itemId}`, l.itemName)
          r.months[m] += l.supplyAmount; r.total += l.supplyAmount
        }
      }
    }
    const kw = keyword.trim()
    return [...map.values()].filter((r) => !kw || r.name.includes(kw)).sort((a, b) => b.total - a.total)
  }, [sales, purchases, mode, groupBy, year, keyword, partnerCond, itemCond, projectCond, warehouseCond, taxCond, kindCond,
      empCond, partnerGroupCond, partnerMgrCond, categoryCond, itemGroupCond, remarkCond,
      specCond, statusCond, authorCond, range])

  const colTotals = useMemo(() => {
    const t = new Array(12).fill(0)
    let grand = 0
    for (const r of rows) { r.months.forEach((v, i) => (t[i] += v)); grand += r.total }
    return { months: t, grand }
  }, [rows])

  const years = [thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2]
  const cell: React.CSSProperties = { textAlign: 'right', fontSize: 11.5, padding: '4px 6px', whiteSpace: 'nowrap' }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '집계표', [])

  return (
    <EcListShell
      title="집계표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">거래처/품목 × 월 매출·매입 금액 피벗. 공급가액 기준, 금액 큰 행 순.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        {/*
          원본 첫 조건은 [메뉴구분], 둘째가 [구분](집계조건), 셋째가 [기준일자]다.
          우리 표는 한 해 × 12개월 피벗이라 기간을 <b>연 단위</b>로만 고른다 —
          이름표만 원본대로 [기준일자]라 붙인다(원본 기본값은 전월+금월).
        */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>메뉴구분</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {MODES.map((m) => (
            <button key={m} onClick={() => setMode(m)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: mode === m ? 'var(--ec-blue)' : '#fff', color: mode === m ? '#fff' : '#3a4453', fontWeight: mode === m ? 700 : 400,
            }}>{m}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>기준일자</span>
        <select className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['partner', 'item'] as const).map((g) => (
            <button key={g} onClick={() => setGroupBy(g)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: groupBy === g ? '#3c4553' : '#fff', color: groupBy === g ? '#fff' : '#3a4453', fontWeight: groupBy === g ? 700 : 400,
            }}>{g === 'partner' ? '거래처별' : '품목별'}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>거래유형</span>
        <select className="ec-input" value={taxCond} style={{ width: 90 }}
                onChange={(e) => setTaxCond(e.target.value as '전체' | '과세' | '면세')}>
          <option>전체</option><option>과세</option><option>면세</option>
        </select>
        {/* 원본 조건 차례: … 창고 · <b>프로젝트</b> · … · 거래처 · 품목 — 프로젝트가 거래처보다 앞이다. */}
        <CodePickerField label="창고" width={150} emptyLabel="전체"
                         value={warehouseCond} onChange={setWarehouseCond} items={condPick.warehouses} />
        <CodePickerField label="프로젝트" width={150} emptyLabel="전체"
                         value={projectCond} onChange={setProjectCond} items={condPick.projects} />
        {/*
          <b>[관리항목]은 원본 조건 판에 없다</b>(2026-09-08 실측). 사본을 보고 우리가
          만들어 둔 것이라 뺀다 — 원본에 없는 조건을 두면 대조표가 거짓이 된다.
          원본 차례는 … 프로젝트 · 거래처 · 거래처그룹1 · 품목 · 품목구분 · 품목그룹1 ·
          거래구분 · 담당자 · 거래처관리담당자 … 다.
        */}
        <CodePickerField label="거래처" width={150} emptyLabel="전체"
                         value={partnerCond} onChange={setPartnerCond} items={condPick.partners} />
        <CodePickerField label="거래처그룹1" width={140} emptyLabel="전체"
                         value={partnerGroupCond} onChange={setPartnerGroupCond}
                         items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        <CodePickerField label="품목" width={150} emptyLabel="전체"
                         value={itemCond} onChange={setItemCond} items={condPick.items} />
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>품목구분</span>
        <select className="ec-input" value={categoryCond} style={{ width: 130 }}
                onChange={(e) => setCategoryCond(e.target.value)}>
          <option value="">전체</option>
          {[...new Set([...sales, ...purchases].flatMap((d) => d.lines.map((l) => l.itemCategoryName))
            .filter(Boolean) as string[])].sort().map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>품목그룹1</span>
        <select className="ec-input" value={itemGroupCond} style={{ width: 150 }}
                onChange={(e) => setItemGroupCond(e.target.value)}>
          <option value="">전체</option>
          {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {/* 원본 조건 차례의 맨 뒤 [거래구분] — 일반인가 반품인가. */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>거래구분</span>
        <select className="ec-input" value={kindCond} style={{ width: 90 }}
                onChange={(e) => setKindCond(e.target.value as '전체' | '일반' | '반품')}>
          <option>전체</option><option>일반</option><option>반품</option>
        </select>
        {/* 원본 차례: [거래구분] 다음이 [담당자]·[거래처관리담당자]다(2026-09-08 실측). */}
        <CodePickerField label="담당자" width={130} emptyLabel="전체"
                         value={empCond} onChange={setEmpCond}
                         items={[...new Set([...sales, ...purchases].map((d) => d.employeeName)
                           .filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        <CodePickerField label="거래처관리담당자" width={140} emptyLabel="전체"
                         value={partnerMgrCond} onChange={setPartnerMgrCond}
                         items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        {/* 원본 차례: … 거래처관리담당자 · (외화종류) · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 적요 · 부대비용 … */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>규격</span>
        <input className="ec-input" value={specCond} placeholder="규격"
               onChange={(e) => setSpecCond(e.target.value)} style={{ width: 120 }} />
        {/*
          이름표를 <b>글자 그대로</b> 적는다 — 배열을 map 으로 돌리면 화면에는 뜨지만
          대조 검사가 소스에서 이름을 못 찾아 '없다' 고 말한다(실제로 그랬다).
        */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>수량</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['qtyFrom'] ?? ''}
                 onChange={(e) => setR('qtyFrom', e.target.value)} />
          <span style={{ color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['qtyTo'] ?? ''}
                 onChange={(e) => setR('qtyTo', e.target.value)} />
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>단가</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['priceFrom'] ?? ''}
                 onChange={(e) => setR('priceFrom', e.target.value)} />
          <span style={{ color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['priceTo'] ?? ''}
                 onChange={(e) => setR('priceTo', e.target.value)} />
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>공급가액</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['supplyFrom'] ?? ''}
                 onChange={(e) => setR('supplyFrom', e.target.value)} />
          <span style={{ color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['supplyTo'] ?? ''}
                 onChange={(e) => setR('supplyTo', e.target.value)} />
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>부가세</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['vatFrom'] ?? ''}
                 onChange={(e) => setR('vatFrom', e.target.value)} />
          <span style={{ color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['vatTo'] ?? ''}
                 onChange={(e) => setR('vatTo', e.target.value)} />
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>적요</span>
        <input className="ec-input" value={remarkCond} placeholder="적요"
               onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 140 }} />
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>부대비용</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['extraFrom'] ?? ''}
                 onChange={(e) => setR('extraFrom', e.target.value)} />
          <span style={{ color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 90 }} value={range['extraTo'] ?? ''}
                 onChange={(e) => setR('extraTo', e.target.value)} />
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>진행상태</span>
        <select className="ec-input" value={statusCond} style={{ width: 110 }}
                onChange={(e) => setStatusCond(e.target.value)}>
          <option value="">전체</option>
          {[...new Set(sales.map((d) => d.confirmStatusName).filter(Boolean) as string[])]
            .sort().map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <CodePickerField label="최초작성자" width={130} emptyLabel="전체"
                         value={authorCond} onChange={setAuthorCond}
                         items={[...new Set([...sales, ...purchases].map((d) => d.createdBy)
                           .filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        {/* 원본 조건 차례의 맨 끝 — [정렬/소계기준] 다음이다. */}
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)' }}>데이터 보기형식</span>
        <div className="ec-pills">
          {(['표', '그래프'] as const).map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${view === v ? ' active' : ''}`}
                    onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>총계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(colTotals.grand)}</b></span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {view === '그래프' ? (
        <EcBarChart unit=" 원" emptyText="조회된 자료가 없습니다."
                    rows={rows.map((r) => ({ label: r.name, value: r.total }))} />
      ) : (
      <div style={{ overflowX: 'auto' }}>
        <table ref={tableRef} className="w-full text-left" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: '#f5f7fa', minWidth: 140 }}>{groupBy === 'partner' ? '거래처' : '품목'}</th>
              {MONTHS.map((m) => <th key={m} style={{ ...cell, fontWeight: 700 }}>{m}월</th>)}
              <th style={{ ...cell, fontWeight: 700, color: 'var(--ec-blue)' }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key}>
                <td style={{ position: 'sticky', left: 0, background: '#fff', fontWeight: 600 }}>{r.name}</td>
                {r.months.map((v, i) => <td key={i} style={{ ...cell, color: v ? '#3c4553' : '#d0d5db' }}>{v ? won(v) : ''}</td>)}
                <td style={{ ...cell, fontWeight: 700, color: 'var(--ec-blue)' }}>{won(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td style={{ position: 'sticky', left: 0, background: '#f7f9fb' }}>합계</td>
                {colTotals.months.map((v, i) => <td key={i} style={cell}>{v ? won(v) : ''}</td>)}
                <td style={{ ...cell, color: 'var(--ec-blue)' }}>{won(colTotals.grand)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
    </EcListShell>
  )
}
