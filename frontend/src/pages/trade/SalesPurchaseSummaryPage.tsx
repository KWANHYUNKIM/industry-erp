import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc, SalesDoc } from '../../types/api'
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

/**
 * 원본 [집계조건1~3] 고르기(2026-10-21 기록: 기준일자 일별~연별 · 창고 · 거래유형 · 관리항목 · 거래처 · 거래처그룹1/2 ·
 * 품목명[규격] · 품목그룹1~3 · 프로젝트 · 프로젝트그룹1/2). 우리 자료로 낼 수 있는 것만 둔다 — 그룹2/3 · 프로젝트그룹은 마스터가 없어 뺀다.
 * 고른 축이 그대로 표의 앞머리 칸이 된다. 전부 사용안함이면 원본 문구를 낸다.
 * [집계대상] · [비교기간] · [가로보기] · [비율표시] · [차이표시] 는 원본 격자 꼴을 재지 못해 아직 없다(원본 재기 필요).
 */
const AXES = ['사용안함', '기준일자(일별)', '기준일자(월별)', '기준일자(연별)', '창고', '거래유형', '관리항목',
  '거래처', '거래처그룹1', '품목명[규격]', '품목그룹1', '프로젝트'] as const
type Axis = typeof AXES[number]
/** 품목에 붙는 축 — 하나라도 있으면 줄(라인) 단위로 더한다. 없으면 전표 합계 기준(거래처별 같은 기존 규칙). */
const LINE_AXES: Axis[] = ['관리항목', '품목명[규격]', '품목그룹1']
const AXIS_HEAD: Record<Axis, string> = {
  '사용안함': '', '기준일자(일별)': '일자', '기준일자(월별)': '월', '기준일자(연별)': '연도', '창고': '창고', '거래유형': '거래유형',
  '관리항목': '관리항목', '거래처': '거래처명', '거래처그룹1': '거래처그룹1', '품목명[규격]': '품목명[규격]', '품목그룹1': '품목그룹1', '프로젝트': '프로젝트',
}

interface Agg {
  key: string
  names: string[]
  saleCount: number   // 거래처별=전표수, 품목별=라인수
  saleQty: number
  saleSupply: number
  saleVat: number
  buyCount: number
  buyQty: number
  buySupply: number
  buyVat: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
/** 원본 판매구매집계표의 수량은 소수 둘째 자리까지 찍힌다('1.00' · 2026-10-20 실측). */
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 원본 축 이름 열은 '품목명[규격]' 이다. */
const itemLabel = (name: string, spec: string | null) => spec ? `${name}[${spec}]` : name
const emptyAgg = (key: string, names: string[]): Agg => ({ key, names, saleCount: 0, saleQty: 0, saleSupply: 0, saleVat: 0, buyCount: 0, buyQty: 0, buySupply: 0, buyVat: 0 })

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
  const [axis1, setAxis1] = useState<Axis>('거래처')
  const [axis2, setAxis2] = useState<Axis>('사용안함')
  const [axis3, setAxis3] = useState<Axis>('사용안함')
  const axes = [axis1, axis2, axis3].filter((a) => a !== '사용안함')
  const lineLevel = axes.some((a) => LINE_AXES.includes(a))
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      /*
       * <b>고른 기간을 서버에도 보낸다.</b> 여태 전표를 통째로 받아 아래 inPeriod 로
       * 걸렀다 — 화면은 [기간]을 묻고 서버에는 아무것도 안 보내는 꼴이었다.
       * 거르는 규칙은 그대로 두고(같은 창을 두 번 보는 것은 해가 없다) 받는 것만 줄인다.
       */
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const [s, b] = await Promise.all([
        api.get<SalesDoc[]>('/sales', { params: period }),
        api.get<PurchaseDoc[]>('/purchases', { params: period }),
      ])
      setSales(s.data); setPurchases(b.data)
    } catch (err) { setError(extractErrorMessage(err)); setSales([]); setPurchases([]) }
    finally { setLoading(false) }
  }
  /* 기간을 바꾸면 그 기간으로 다시 받는다 — 안 그러면 서버 창과 화면 창이 어긋난다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)
  /*
   * 원본 판매구매집계표의 조건에 <b>[거래처]</b> 가 있다(사본 실측).
   * 집계 화면이라 <b>합치기 전</b>에 걸러야 한다 — 합쳐 놓은 줄을 이름으로 거르면
   * [품목별] 로 볼 때 아무것도 안 걸린다(그 줄의 이름은 품목명이다).
   */
  /* 거래처·창고·품목 조건은 코드도움의 id 로 견준다 — 이름은 겹칠 수 있다. */
  const keepPartner = (id: number) => !partnerCond || String(id) === partnerCond
  const keepProject = (id: number | null) => !projectCond || String(id) === projectCond
  const keepWarehouse = (id: number | null) => !warehouseCond || String(id) === warehouseCond
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
    type Line = SalesDoc['lines'][number]
    type AnyDoc = { partnerId: number; partnerName: string; projectId: number | null; projectName: string | null
      warehouseId: number; warehouseName: string; employeeName: string | null; remark: string | null
      taxable: boolean; tradeKindName: string; supplyAmount: number; vatAmount: number; lines: Line[] }
    const add = (d: AnyDoc, date: string, side: 'sale' | 'buy') => {
      if (!inPeriod(date)) return
      if (!keepPartner(d.partnerId)) return
      if (!keepProject(d.projectId)) return
      if (!keepWarehouse(d.warehouseId)) return
      if (!keepEmp(d.employeeName)) return
      if (!keepRemark(d.remark)) return
      if (!keepGroup(d.partnerName)) return
      if (!keepMgr(d.partnerName)) return
      if (!keepTax(d.taxable)) return
      if (kindCond !== '전체' && d.tradeKindName !== kindCond) return
      /* 축 하나의 값. 줄(라인)에 붙는 축은 line 이 있을 때만 쓴다. */
      const valueOf = (ax: Axis, l?: Line): string => {
        switch (ax) {
          case '기준일자(일별)': return date.replace(/-/g, '/')
          case '기준일자(월별)': return date.slice(0, 7).replace('-', '/')
          case '기준일자(연별)': return date.slice(0, 4)
          case '창고': return d.warehouseName
          case '거래유형': return d.taxable ? '과세' : '면세'
          case '거래처': return d.partnerName
          case '거래처그룹1': return pgroup.groupOfName(d.partnerName) || '(미지정)'
          case '프로젝트': return d.projectName ?? ''
          case '관리항목': return l ? (mgmt.nameOf(l.itemId) || '') : ''
          case '품목그룹1': return l ? (mgmt.groupOf(l.itemId) || '(미지정)') : ''
          case '품목명[규격]': return l ? itemLabel(l.itemName, l.spec) : ''
          default: return ''
        }
      }
      const put = (l?: Line) => {
        const names = axes.map((ax) => valueOf(ax, l))
        const key = names.join('\u0001')
        let a = m.get(key)
        if (!a) { a = emptyAgg(key, names); m.set(key, a) }
        if (l) {
          if (side === 'sale') { a.saleCount += 1; a.saleQty += l.quantity; a.saleSupply += l.supplyAmount; a.saleVat += l.vatAmount }
          else { a.buyCount += 1; a.buyQty += l.quantity; a.buySupply += l.supplyAmount; a.buyVat += l.vatAmount }
        } else {
          const q = d.lines.reduce((x, ln) => x + ln.quantity, 0)
          if (side === 'sale') { a.saleCount += 1; a.saleSupply += d.supplyAmount; a.saleVat += d.vatAmount; a.saleQty += q }
          else { a.buyCount += 1; a.buySupply += d.supplyAmount; a.buyVat += d.vatAmount; a.buyQty += q }
        }
      }
      if (lineLevel) {
        for (const l of d.lines) {
          if (itemCond && String(l.itemId) !== itemCond) continue
          if (mgmtCond && mgmt.nameOf(l.itemId) !== mgmtCond) continue
          if (!lineHit(l)) continue
          put(l)
        }
      } else {
        /* 전표 합계 기준 — 품목 조건은 '그 조건에 맞는 줄을 가진 전표'만 센다(옛 [거래처별] 규칙). */
        if (itemCond && !d.lines.some((l) => String(l.itemId) === itemCond)) return
        if (mgmtCond && !d.lines.some((l) => mgmt.nameOf(l.itemId) === mgmtCond)) return
        if (!docHasItem(d.lines)) return
        put()
      }
    }
    if (axes.length > 0) {
      for (const d of sales) add(d as unknown as AnyDoc, d.saleDate, 'sale')
      for (const d of purchases) add(d as unknown as AnyDoc, d.purchaseDate, 'buy')
    }
    const kw = keyword.trim()
    return [...m.values()]
      .filter((a) => !kw || a.names.join(' ').includes(kw))
      .sort((x, y) => {
        for (let i = 0; i < x.names.length; i++) {
          const c = x.names[i].localeCompare(y.names[i], 'ko')
          if (c) return c
        }
        return 0
      })
  }, [sales, purchases, axis1, axis2, axis3, from, to, keyword, partnerCond, projectCond, warehouseCond, empCond, remarkCond, itemCond, kindCond,
      partnerGroupCond, partnerMgrCond, categoryCond, itemGroupCond, taxTypeCond, mgmtCond])

  const totals = useMemo(() => rows.reduce((s, r) => ({
    saleQty: s.saleQty + r.saleQty, saleSupply: s.saleSupply + r.saleSupply, saleVat: s.saleVat + r.saleVat,
    buyQty: s.buyQty + r.buyQty, buySupply: s.buySupply + r.buySupply, buyVat: s.buyVat + r.buyVat,
  }), { saleQty: 0, saleSupply: 0, saleVat: 0, buyQty: 0, buySupply: 0, buyVat: 0 }), [rows])

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: 'var(--ec-text)', fontWeight: 600 }

  return (
    <EcListShell
      title="판매구매집계표"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ border: '1px solid var(--ec-line)', borderRadius: 4, background: 'var(--ec-bg-page)', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        {/* 원본 첫째 조건은 [기준일자]다 — 우리는 [기간]이라 적고 있었다(2026-09-08 실측). */}
        <div className="flex items-center">
          <span style={{ ...label, width: 66 }}>기준일자</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span className="my-0 mx-[6px] text-ec-hint">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
        {/*
          원본 [집계조건] — <b>기준일자 바로 다음</b>이다. 우리는 [집계기준]이라 부르며
          맨 뒤에 두고 있었다. 원본은 집계조건1~5 를 겹쳐 고르지만 우리 표는 축이 하나라
          거래처별·품목별 둘로 둔다.
        */}
        {([['집계조건1', axis1, setAxis1], ['집계조건2', axis2, setAxis2], ['집계조건3', axis3, setAxis3]] as const).map(([lb, v, set]) => (
          <div key={lb} className="flex items-center">
            <span style={{ ...label, width: 66 }}>{lb}</span>
            <select className="ec-input" value={v} style={{ width: 130 }}
                    onChange={(e) => set(e.target.value as Axis)}>
              {AXES.map((ax) => <option key={ax} value={ax}>{ax === '사용안함' ? 'none' : ax}</option>)}
            </select>
          </div>
        ))}
        {/* 원본 차례: 창고 · <b>프로젝트</b> · 담당자 · 거래처 … — 프로젝트가 거래처보다 앞이다. */}
        <div className="flex items-center">
          <span style={label}>창고</span>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={partnerPick.warehouses} />
        </div>
        <div className="flex items-center">
          <span style={label}>프로젝트</span>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond} items={partnerPick.projects} />
        </div>
        <div className="flex items-center">
          <span style={label}>담당자</span>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond} items={partnerPick.employees} />
        </div>
        {/* 원본 차례: [담당자] 다음, [관리항목] 앞이다(2026-09-08 실측). */}
        <div className="flex items-center">
          <span style={{ ...label, width: 100 }}>거래처관리담당자</span>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={partnerMgrCond} onChange={setPartnerMgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </div>
        {/* 원본 차례: [프로젝트]·[담당자] 다음, [거래처] 앞이다 — 이 화면만 담당자가 끼어든다(사본 실측). */}
        <div className="flex items-center">
          <span style={label}>관리항목</span>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </div>
        <div className="flex items-center">
          <span style={label}>거래처</span>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={partnerPick.partners} />
        </div>
        <div className="flex items-center">
          <span style={{ ...label, width: 76 }}>거래처그룹1</span>
          <CodePickerField label="거래처그룹1" hideLabel width={150} emptyLabel="전체"
                           value={partnerGroupCond} onChange={setPartnerGroupCond}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </div>
        {/* 원본 차례: … 거래처 · 품목코드 · <b>적요</b> · 거래구분. 적요는 이미 응답에 온다. */}
        <div className="flex items-center">
          <span style={label}>품목코드</span>
          <CodePickerField label="품목코드" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={partnerPick.items} />
        </div>
        <div className="flex items-center">
          <span style={{ ...label, width: 66 }}>품목구분</span>
          <select className="ec-input" value={categoryCond} style={{ width: 130 }}
                  onChange={(e) => setCategoryCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set([...sales, ...purchases].flatMap((d) => d.lines.map((l) => l.itemCategoryName))
              .filter(Boolean) as string[])].sort().map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center">
          <span style={{ ...label, width: 66 }}>품목그룹1</span>
          <select className="ec-input" value={itemGroupCond} style={{ width: 150 }}
                  onChange={(e) => setItemGroupCond(e.target.value)}>
            <option value="">전체</option>
            {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="flex items-center">
          <span style={label}>적요</span>
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 170 }} />
        </div>
        <div className="flex items-center">
          <span style={label}>거래구분</span>
          <select className="ec-input" value={kindCond} style={{ width: 90 }}
                  onChange={(e) => setKindCond(e.target.value as '전체' | '일반' | '반품')}>
            <option>전체</option><option>일반</option><option>반품</option>
          </select>
        </div>
        {/* 원본 [거래유형] — 과세 · 면세. [거래구분](일반·반품)과 다른 축이다. */}
        <div className="flex items-center">
          <span style={{ ...label, width: 66 }}>거래유형</span>
          <select className="ec-input" value={taxTypeCond} style={{ width: 90 }}
                  onChange={(e) => setTaxTypeCond(e.target.value)}>
            <option value="">전체</option><option>과세</option><option>면세</option>
          </select>
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/*
        원본 격자(2026-10-20 실측, 집계조건1 = 품목명[규격]): 머리 두 줄 — [축 │ 판매 │ 구매] 아래
        [수량 · 판매금액 · 부가세 · 합계 │ 수량 · 구매금액 · 부가세 · 합계], 끝에 '합계' 줄. 건수 · 순액 열은 없다.
      */}
      <table className="w-full text-left">
        <thead>
          <tr>
            {axes.map((ax) => <th key={ax} rowSpan={2}>{AXIS_HEAD[ax]}</th>)}
            <th colSpan={4} className="text-center">판매</th>
            <th colSpan={4} className="text-center">구매</th>
          </tr>
          <tr>
            <th className="text-right">수량</th>
            <th className="text-right">판매금액</th>
            <th className="text-right">부가세</th>
            <th className="text-right">합계</th>
            <th className="text-right">수량</th>
            <th className="text-right">구매금액</th>
            <th className="text-right">부가세</th>
            <th className="text-right">합계</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8 + axes.length} className="ec-empty">불러오는 중…</td></tr>
          ) : axes.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">집계조건은 1개 이상 선택해야 합니다</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8 + axes.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key}>
              {r.names.map((n, i) => <td key={i}>{n}</td>)}
              <td className="text-right">{qty2(r.saleQty)}</td>
              <td className="text-right">{won(r.saleSupply)}</td>
              <td className="text-right">{won(r.saleVat)}</td>
              <td className="text-right">{won(r.saleSupply + r.saleVat)}</td>
              <td className="text-right">{qty2(r.buyQty)}</td>
              <td className="text-right">{won(r.buySupply)}</td>
              <td className="text-right">{won(r.buyVat)}</td>
              <td className="text-right">{won(r.buySupply + r.buyVat)}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={Math.max(axes.length, 1)}>합계</td>
              <td className="text-right">{qty2(totals.saleQty)}</td>
              <td className="text-right">{won(totals.saleSupply)}</td>
              <td className="text-right">{won(totals.saleVat)}</td>
              <td className="text-right">{won(totals.saleSupply + totals.saleVat)}</td>
              <td className="text-right">{qty2(totals.buyQty)}</td>
              <td className="text-right">{won(totals.buySupply)}</td>
              <td className="text-right">{won(totals.buyVat)}</td>
              <td className="text-right">{won(totals.buySupply + totals.buyVat)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
