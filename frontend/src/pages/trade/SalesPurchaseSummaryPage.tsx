import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { periodOf } from '../../components/EcPeriodPicks'

/**
 * 영업관리 > 판매구매집계표 (이카운트 E040725)
 * 기간 내 판매·매입을 거래처별 또는 품목별로 집계해 매출·매입·순액을 한 표로 본다.
 * 데이터는 GET /api/sales + GET /api/purchases 를 그대로 집계(백엔드 무변경).
 *
 * 거래처별: 전표 합계 기준. 품목별: 라인 합계 기준(수량·공급가액).
 *
 * <p>2026-09-08 에 원본을 열어 조건 판을 재니 <b>스물일곱</b>이다 — 사본에는 열뿐이었다.
 * 화면코드도 바로잡았다: 대조표에 <b>ESZ006R</b> 이라 적혀 있었는데 주소창의 prgId 는
 * <b>E040725</b> 였다(사본에서 주워 온 코드였다).
 *
 * <p>실측 차례: 기준일자 · 집계조건 · 내.외자구분 · 창고 · (창고계층그룹) · 프로젝트 ·
 * (프로젝트그룹1/2) · 담당자 · <b>거래처관리담당자</b> · 관리항목 · 거래처 ·
 * <b>거래처그룹1</b> · (거래처그룹2 · 거래처계층그룹) · 품목코드 · <b>품목구분 ·
 * 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · 적요 · 거래구분 · <b>거래유형</b> ·
 * (외화종류) · (양식 · 양식구분).
 *
 * <p>이름 둘도 원본대로 고쳤다 — 기간 칸은 <b>[기준일자]</b>, 우리가 [집계기준]이라 부르던
 * 것은 <b>[집계조건]</b> 이고 원본에서는 <b>기준일자 바로 다음</b>에 선다(맨 뒤가 아니다).
 *
 * <p><b>2026-09-09 격자를 재려다 알게 된 것: 이 화면에는 고정된 격자가 없다.</b>
 * [검색(F8)]을 누르면 표가 아니라 <b>"집계조건은 1개 이상 선택해야 합니다"</b> 가 뜬다.
 * [집계조건]은 하나가 아니라 <b>집계조건1~5 + 집계대상</b> 여섯 자리이고, 처음엔 모두
 * <code>none</code> 이다 — 사람이 고른 <b>그 축들이 그대로 표의 열</b>이 된다.
 * 즉 원본에는 대조표에 적을 <b>정해진 열 차례가 없다.</b> 그래서
 * <code>ecount-column-align.json</code> 에 이 화면을 넣지 않았다 — 축을 하나 골라
 * 나온 표를 적으면 <b>그 선택에만 맞는 열</b>을 원본이라고 적게 된다.
 *
 * <p>우리 표는 축이 <b>거래처별·품목별 둘</b>뿐이고 열은 [매출건수/수량 · 매출공급가 ·
 * 매입건수/수량 · 매입공급가 · 순액] 으로 고정이다. 원본만큼 자유롭지 않지만,
 * <b>고른 축이 곧 열</b>이라는 얼개는 같다. 축을 다섯까지 겹쳐 쌓는 것과
 * [집계대상]·[가로보기]·[비율표시]·[차이표시]는 아직 없다.
 * (조건 판은 눌러서 값을 고르는 <b>선택 팝업</b>이라 열지 않았다 — 저장을 건드릴 수 있다.)
 */

type GroupBy = 'partner' | 'item'

interface Agg {
  key: string
  name: string
  saleCount: number   // 거래처별=전표수, 품목별=라인수
  saleQty: number
  saleSupply: number
  buyCount: number
  buyQty: number
  buySupply: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const emptyAgg = (key: string, name: string): Agg => ({ key, name, saleCount: 0, saleQty: 0, saleSupply: 0, buyCount: 0, buyQty: 0, buySupply: 0 })

const initP = periodOf('금월(~오늘)')!

export default function SalesPurchaseSummaryPage() {
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  /*
   * 원본 판매구매집계표 조건의 <b>[품목코드]</b>·<b>[거래구분]</b>.
   * 품목은 집계 줄의 이름으로만 찾을 수 있었는데, 이름은 겹칠 수 있고 <b>코드로 훑는</b>
   * 일이 안 됐다. [거래구분]은 일반인가 반품인가 — 반품이 섞이면 금액이 상계돼서,
   * 반품만 따로 보고 싶을 때가 실제로 있다. 둘 다 <b>합치기 전에</b> 건다.
   */
  const [itemCond, setItemCond] = useState('')
  const [kindCond, setKindCond] = useState<'전체' | '일반' | '반품'>('전체')
  /*
   * 2026-09-08 실측으로 만든 넷. 값은 이미 다 있다 —
   * 거래처그룹1·거래처관리담당자는 거래처 마스터에서 이름으로 잇고,
   * 품목구분은 라인이 <code>itemCategoryName</code> 으로 진작 싣고 있으며,
   * 거래유형(과세·면세)은 전표의 <code>taxable</code> 이다.
   */
  const [partnerGroupCond, setPartnerGroupCond] = useState('')
  const [partnerMgrCond, setPartnerMgrCond] = useState('')
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [taxTypeCond, setTaxTypeCond] = useState('')
  const pgroup = usePartnerGroups()
  const pmgr = usePartnerManagers()
  const partnerPick = useCondPickers(['partners', 'projects', 'warehouses', 'employees', 'items'])

  /* 원본 판매구매집계표는 <b>금월</b>을 보고 열린다(사본 실측). 우리는 비워 두어 */
  /* 열자마자 몇 해치를 한 표로 더했다 — 이번 달 장사가 어땠는지 알 수 없는 숫자다. */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [groupBy, setGroupBy] = useState<GroupBy>('partner')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b] = await Promise.all([api.get<SalesDoc[]>('/sales'), api.get<PurchaseDoc[]>('/purchases')])
      setSales(s.data); setPurchases(b.data)
    } catch (err) { setError(extractErrorMessage(err)); setSales([]); setPurchases([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)
  /*
   * 원본 판매구매집계표의 조건에 <b>[거래처]</b> 가 있다(사본 실측).
   * 집계 화면이라 <b>합치기 전</b>에 걸러야 한다 — 합쳐 놓은 줄을 이름으로 거르면
   * [품목별] 로 볼 때 아무것도 안 걸린다(그 줄의 이름은 품목명이다).
   */
  const keepPartner = (name: string) => !partnerCond || name.includes(partnerCond)
  const keepProject = (name: string | null) => !projectCond || (name ?? '').includes(projectCond)
  const keepWarehouse = (name: string) => !warehouseCond || name.includes(warehouseCond)
  const keepEmp = (name: string | null) => !empCond || (name ?? '').includes(empCond)
  const keepRemark = (t: string | null) => !remarkCond || (t ?? '').includes(remarkCond)
  const keepGroup = (name: string) => !partnerGroupCond || pgroup.groupOfName(name) === partnerGroupCond
  const keepMgr = (name: string) => !partnerMgrCond || pmgr.managerOfName(name) === partnerMgrCond
  /** 원본 [거래유형] — 과세 · 면세. [거래구분](일반·반품)과 다른 축이다. */
  const keepTax = (taxable: boolean) => !taxTypeCond || (taxable ? '과세' : '면세') === taxTypeCond


  /**
   * 원본 [관리항목]. 품목 마스터에 붙는 값이라 전표 응답에는 없다 —
   * 품목 마스터를 받아 줄의 itemId 로 잇는다(판매현황이 먼저 그렇게 했다).
   */
  const mgmt = useItemMgmt()
  const [mgmtCond, setMgmtCond] = useState('')
  /**
   * 원본 [품목구분]·[품목그룹1]. <b>[거래처별] 로 볼 때도 걸려야 한다</b> —
   * 그때는 전표 단위로 더하므로 <b>그 조건에 맞는 줄을 하나라도 가진 전표</b>만 센다.
   * 라인 단위로 자르면 [거래처별] 의 전표 합계가 아니게 된다.
   */
  const lineHit = (l: { itemId: number; itemCategoryName: string | null }) =>
    (!categoryCond || (l.itemCategoryName ?? '') === categoryCond)
    && (!itemGroupCond || mgmt.groupOf(l.itemId) === itemGroupCond)
  const docHasItem = (lines: { itemId: number; itemCategoryName: string | null }[]) =>
    (!categoryCond && !itemGroupCond) || lines.some(lineHit)

  const rows = useMemo(() => {
    const m = new Map<string, Agg>()
    const bump = (key: string, name: string): Agg => {
      let a = m.get(key)
      if (!a) { a = emptyAgg(key, name); m.set(key, a) }
      return a
    }
    if (groupBy === 'partner') {
      for (const d of sales) {
        if (!inPeriod(d.saleDate)) continue
        if (!keepPartner(d.partnerName)) continue
        if (!keepProject(d.projectName)) continue
        if (!keepWarehouse(d.warehouseName)) continue
        if (!keepEmp(d.employeeName)) continue
        if (!keepRemark(d.remark)) continue
        if (!keepGroup(d.partnerName)) continue
        if (!keepMgr(d.partnerName)) continue
        if (!keepTax(d.taxable)) continue
        if (!docHasItem(d.lines)) continue
        if (kindCond !== '전체' && d.tradeKindName !== kindCond) continue
        const a = bump(`P${d.partnerId}`, d.partnerName)
        a.saleCount += 1; a.saleSupply += d.supplyAmount
        a.saleQty += d.lines.reduce((x, l) => x + l.quantity, 0)
      }
      for (const d of purchases) {
        if (!inPeriod(d.purchaseDate)) continue
        if (!keepPartner(d.partnerName)) continue
        if (!keepProject(d.projectName)) continue
        if (!keepWarehouse(d.warehouseName)) continue
        if (!keepEmp(d.employeeName)) continue
        if (!keepRemark(d.remark)) continue
        if (!keepGroup(d.partnerName)) continue
        if (!keepMgr(d.partnerName)) continue
        if (!keepTax(d.taxable)) continue
        if (!docHasItem(d.lines)) continue
        if (kindCond !== '전체' && d.tradeKindName !== kindCond) continue
        const a = bump(`P${d.partnerId}`, d.partnerName)
        a.buyCount += 1; a.buySupply += d.supplyAmount
        a.buyQty += d.lines.reduce((x, l) => x + l.quantity, 0)
      }
    } else {
      for (const d of sales) {
        if (!inPeriod(d.saleDate)) continue
        if (!keepPartner(d.partnerName)) continue
        if (!keepProject(d.projectName)) continue
        if (!keepWarehouse(d.warehouseName)) continue
        if (!keepEmp(d.employeeName)) continue
        if (!keepRemark(d.remark)) continue
        if (!keepGroup(d.partnerName)) continue
        if (!keepMgr(d.partnerName)) continue
        if (!keepTax(d.taxable)) continue
        if (kindCond !== '전체' && d.tradeKindName !== kindCond) continue
        for (const l of d.lines) {
          if (itemCond && l.itemCode !== itemCond) continue
          if (mgmtCond && mgmt.nameOf(l.itemId) !== mgmtCond) continue
          if (!lineHit(l)) continue
          const a = bump(`I${l.itemId}`, l.itemName)
          a.saleCount += 1; a.saleQty += l.quantity; a.saleSupply += l.supplyAmount
        }
      }
      for (const d of purchases) {
        if (!inPeriod(d.purchaseDate)) continue
        if (!keepPartner(d.partnerName)) continue
        if (!keepProject(d.projectName)) continue
        if (!keepWarehouse(d.warehouseName)) continue
        if (!keepEmp(d.employeeName)) continue
        if (!keepRemark(d.remark)) continue
        if (!keepGroup(d.partnerName)) continue
        if (!keepMgr(d.partnerName)) continue
        if (!keepTax(d.taxable)) continue
        if (kindCond !== '전체' && d.tradeKindName !== kindCond) continue
        for (const l of d.lines) {
          if (itemCond && l.itemCode !== itemCond) continue
          if (mgmtCond && mgmt.nameOf(l.itemId) !== mgmtCond) continue
          if (!lineHit(l)) continue
          const a = bump(`I${l.itemId}`, l.itemName)
          a.buyCount += 1; a.buyQty += l.quantity; a.buySupply += l.supplyAmount
        }
      }
    }
    const kw = keyword.trim()
    return [...m.values()]
      .filter((a) => !kw || a.name.includes(kw))
      .sort((a, b) => (b.saleSupply + b.buySupply) - (a.saleSupply + a.buySupply))
  }, [sales, purchases, groupBy, from, to, keyword, partnerCond, projectCond, warehouseCond, empCond, remarkCond, itemCond, kindCond,
      partnerGroupCond, partnerMgrCond, categoryCond, itemGroupCond, taxTypeCond, mgmtCond])

  const totals = useMemo(() => rows.reduce((s, r) => ({
    saleSupply: s.saleSupply + r.saleSupply, buySupply: s.buySupply + r.buySupply,
  }), { saleSupply: 0, buySupply: 0 }), [rows])

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  return (
    <EcListShell
      title="판매구매집계표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">기간 내 판매·매입을 거래처별 또는 품목별로 집계. 순액 = 매출공급가 − 매입공급가.</p>

      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        {/* 원본 첫째 조건은 [기준일자]다 — 우리는 [기간]이라 적고 있었다(2026-09-08 실측). */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 66 }}>기준일자</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        {/*
          원본 [집계조건] — <b>기준일자 바로 다음</b>이다. 우리는 [집계기준]이라 부르며
          맨 뒤에 두고 있었다. 원본은 집계조건1~5 를 겹쳐 고르지만 우리 표는 축이 하나라
          거래처별·품목별 둘로 둔다.
        */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 66 }}>집계조건</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['partner', 'item'] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} className="no-ec" style={{
                padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
                background: groupBy === g ? 'var(--ec-blue)' : '#fff', color: groupBy === g ? '#fff' : '#3a4453', fontWeight: groupBy === g ? 700 : 400,
              }}>{g === 'partner' ? '거래처별' : '품목별'}</button>
            ))}
          </div>
        </div>
        {/* 원본 차례: 창고 · <b>프로젝트</b> · 담당자 · 거래처 … — 프로젝트가 거래처보다 앞이다. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={partnerPick.warehouses} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>프로젝트</span>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond} items={partnerPick.projects} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>담당자</span>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond} items={partnerPick.employees} />
        </div>
        {/* 원본 차례: [담당자] 다음, [관리항목] 앞이다(2026-09-08 실측). */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 100 }}>거래처관리담당자</span>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={partnerMgrCond} onChange={setPartnerMgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </div>
        {/* 원본 차례: [프로젝트]·[담당자] 다음, [거래처] 앞이다 — 이 화면만 담당자가 끼어든다(사본 실측). */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>관리항목</span>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>거래처</span>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={partnerPick.partners} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 76 }}>거래처그룹1</span>
          <CodePickerField label="거래처그룹1" hideLabel width={150} emptyLabel="전체"
                           value={partnerGroupCond} onChange={setPartnerGroupCond}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </div>
        {/* 원본 차례: … 거래처 · 품목코드 · <b>적요</b> · 거래구분. 적요는 이미 응답에 온다. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>품목코드</span>
          <CodePickerField label="품목코드" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={partnerPick.items.map((x) => ({ ...x, value: x.code ?? x.value }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 66 }}>품목구분</span>
          <select className="ec-input" value={categoryCond} style={{ width: 130 }}
                  onChange={(e) => setCategoryCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set([...sales, ...purchases].flatMap((d) => d.lines.map((l) => l.itemCategoryName))
              .filter(Boolean) as string[])].sort().map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 66 }}>품목그룹1</span>
          <select className="ec-input" value={itemGroupCond} style={{ width: 150 }}
                  onChange={(e) => setItemGroupCond(e.target.value)}>
            <option value="">전체</option>
            {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>적요</span>
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>거래구분</span>
          <select className="ec-input" value={kindCond} style={{ width: 90 }}
                  onChange={(e) => setKindCond(e.target.value as '전체' | '일반' | '반품')}>
            <option>전체</option><option>일반</option><option>반품</option>
          </select>
        </div>
        {/* 원본 [거래유형] — 과세 · 면세. [거래구분](일반·반품)과 다른 축이다. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...label, width: 66 }}>거래유형</span>
          <select className="ec-input" value={taxTypeCond} style={{ width: 90 }}
                  onChange={(e) => setTaxTypeCond(e.target.value)}>
            <option value="">전체</option><option>과세</option><option>면세</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          매출계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.saleSupply)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          매입계 <b style={{ color: '#a5561b', fontSize: 14 }}>{won(totals.buySupply)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          순액 <b style={{ color: (totals.saleSupply - totals.buySupply) >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{won(totals.saleSupply - totals.buySupply)}</b>
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>{groupBy === 'partner' ? '거래처' : '품목'}</th>
            <th style={{ textAlign: 'right' }}>매출{groupBy === 'partner' ? '건수' : '수량'}</th>
            <th style={{ textAlign: 'right' }}>매출공급가</th>
            <th style={{ textAlign: 'right' }}>매입{groupBy === 'partner' ? '건수' : '수량'}</th>
            <th style={{ textAlign: 'right' }}>매입공급가</th>
            <th style={{ textAlign: 'right' }}>순액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => {
            const net = r.saleSupply - r.buySupply
            return (
              <tr key={r.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{r.name}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{groupBy === 'partner' ? won(r.saleCount) : won(r.saleQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.saleSupply)}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{groupBy === 'partner' ? won(r.buyCount) : won(r.buyQty)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{won(r.buySupply)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: net >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(net)}</td>
              </tr>
            )
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.saleSupply)}</td>
              <td></td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(totals.buySupply)}</td>
              <td style={{ textAlign: 'right', color: (totals.saleSupply - totals.buySupply) >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(totals.saleSupply - totals.buySupply)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
