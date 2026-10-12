import { useEffect, useMemo, useState } from 'react'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../api/client'
import type { CommonCode, Item, StockAdjustment } from '../../types/api'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import EcListShell from '../../components/EcListShell'
import { periodOf } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { subtotalBy } from '../../utils/subtotalBy'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'

/** 원본 [생산수량]의 재료. 이 화면이 쓰는 칸만 든다. */
interface ProductionRow {
  productId: number; productCode: string; productName: string; productUnit: string
  warehouseId: number
  warehouseName: string
  producedQty: number; productionDate: string
  projectId: number | null
  projectName: string | null
}

/**
 * 재고 I > 기타이동 — 불량률파악보고서 (이카운트 E040512)
 * 창고 × 품목마다 <b>생산수량</b>(생산실적)과 <b>불량수량</b>(불량처리)을 놓고 불량률 = 불량수량 ÷ 생산수량.
 *
 * <p>2026-10-13 원본 격자 일곱 열로 맞췄다 — [창고코드 · 창고명 · 품목코드 · 품목명[규격명] · 생산수량 · 불량수량 · 불량률].
 * 예전에는 품질검사의 검사수량 · 검사불량으로 불량률을 내고 불량처리 · 폐기를 우리 열 둘로 따로 찍었다.
 * <ul>
 *   <li>[불량수량]은 <b>불량처리</b>다: 원본 [처리방법] 조건의 후보가 전체 · 폐기 · 품목대체 · 정상사용(2026-09-08 실측) —
 *       불량처리입력(E040507)의 처리방법 그대로이고, 원본에서 불량처리 '폐기' 로 저장한 것이 폐기현황에 1.00 으로
 *       선다(2026-10-12 C000088 실측). 그래서 폐기는 따로가 아니라 불량처리의 한 갈래로 같이 센다.</li>
 *   <li>불량률 밑은 <b>생산수량</b>이다: 원본 합계줄 생산 524 · 불량 2 → 불량률 <b>0</b>(2026-09-21 실측). 소수 자리를 안 찍는다.</li>
 *   <li>품질검사의 부적격이 [불량수량]에 드는지는 원본에서 못 쟀다 — 위 두 사실(처리방법 조건 · 메뉴가 기타이동)로
 *       불량처리만 센다. 검사 불량률은 품질검사현황이 본다.</li>
 * </ul>
 */

interface Row {
  /**
   * 원본은 <b>창고 × 품목</b>으로 묶는다(2026-09-09 E040512 실측: 첫 두 칸이
   * [창고코드]·[창고명]). 우리는 품목 하나로만 묶고 있었다 — 같은 품목이라도
   * <b>어느 창고에서 불량이 났는지</b>가 안 보였다.
   * 창고를 안 적은 조정은 <b>(미지정)</b> 으로 한 덩어리가 된다 — 0 으로
   * 지어내거나 아무 창고에 붙이지 않는다.
   */
  warehouseName: string; warehouseCode: string
  /** 원본 격자가 [품목명[규격명]] 한 칸으로 적는다 — 규격을 줄에 실어 둔다. */
  itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string
  /**
   * 원본 격자의 <b>[생산수량]</b> — 2026-09-21 원본(E040512) 실측으로 뜻을 가렸다.
   *
   * <p>여태 '우리 숫자는 검사에서 나온다 — 검사 안 한 생산분은 줄에 없어 생산수량이라
   * 부르면 거짓이 된다' 고 적어 두고 안 만들었다. <b>그 판단이 틀렸다.</b> 원본의 이 칸은
   * 검사와 아무 상관이 없고 <b>생산실적 수량</b>이다. 실측 판(2024/01/01~2026/09/21):
   * 반제품제조 창고에 AQD 몸체 156 · AQD 뚜껑 156(계 312), 완제품제조에 AQD 133 …(계 212),
   * 합계 524. 그리고 <b>제품자재창고의 송풍기 줄은 생산수량이 비어 있고 불량수량만 2</b> 다 —
   * 두 칸이 서로 다른 자료에서 오고, 줄은 <b>둘의 합집합</b>이라는 증거다.
   *
   * <p><b>안 잰 것</b>: 원본이 생산실적의 <b>받는창고</b>로 묶는지 <b>생산된공장</b>으로 묶는지는
   * 못 쟀다(생산입고조회 C000032 가 "작업 진행중 오류" 를 내 열리지 않았다 — 보드에 적힌
   * 그 화면 문제 그대로다). 우리는 <b>받는창고</b>로 둔다: 같은 줄의 불량처리 수량도
   * '그 창고에 있던 재고' 를 빼는 것이라 축이 같다. 합계는 어느 쪽으로 묶어도 같고,
   * <b>창고별로 갈리는 줄만</b> 달라질 수 있다. 재면 그때 맞춘다.
   */
  producedQty: number
  /** 원본 [불량수량] — 불량처리(처리방법 폐기 · 품목대체 · 정상사용)로 나간 수량. 정상품목 줄은 뺀다. */
  defectQty: number
  /** 불량수량 ÷ 생산수량 × 100. 생산이 없으면 0. */
  defectRate: number
}

/** 원본 [처리방법] 후보(2026-09-08 실측) — 불량처리입력의 처리방법과 같다. */
const HANDLINGS = ['전체', '폐기', '품목대체', '정상사용'] as const
type Handling = typeof HANDLINGS[number]
/** 불량처리 줄의 처리방법. 처리방법 없이 들어온 예전 줄과 옛 [폐기] 유형은 폐기다(입력의 기본값). */
const handlingOf = (a: StockAdjustment): Exclude<Handling, '전체'> =>
  a.type === 'DISPOSAL' ? '폐기' : ((a.handling as Exclude<Handling, '전체'> | null | undefined) || '폐기')

const won = (n: number) => n.toLocaleString('ko-KR')
/** 원본 불량률 — 소수 자리 없이(합계 2 ÷ 524 → 0). */
const rateText = (r: number) => Math.round(r).toLocaleString('ko-KR')

export default function DefectReportPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'warehouses', 'projects', 'employees'])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /*
   * 원본 불량률파악보고서는 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
   * 우리는 비워 두어서, 열면 몇 해치 불량이 한 비율로 뭉개졌다 — 이번 달이 나쁜지
   * 좋은지 알 수 없는 숫자다.
   */
  const [from, setFrom] = useState(periodOf('금월(~오늘)')!.from)
  const [to, setTo] = useState(periodOf('금월(~오늘)')!.to)
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 조건 차례: 창고 · 프로젝트 · <b>담당자</b> · 불량유형 · <b>처리방법</b>.
   * 다섯 다 <b>불량처리 전표</b>의 값이다(머리 담당자 · 발견창고 · 처리방법 · 프로젝트, 줄 불량유형).
   * 생산실적은 창고 · 프로젝트만 함께 걸린다 — 담당자 · 불량유형 · 처리방법은 불량을 묻는 축이다.
   */
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [employeeCond, setEmployeeCond] = useState('')
  /* 원본 [불량유형] — 공통코드 불량유형(DEFECT_TYPE). 불량처리 줄은 그 <b>이름</b>을 적는다. */
  const [defectTypeCond, setDefectTypeCond] = useState('')
  const [defectTypes, setDefectTypes] = useState<CommonCode[]>([])
  const [handleCond, setHandleCond] = useState<Handling>('전체')
  /*
   * 2026-09-08 에 원본(E040512)의 조건 판을 재니 <b>스물하나</b>다(사본에는 여덟).
   * 접힌 줄은 없다. 여기서 만든 셋: 품목구분 · 품목그룹1 · 규격.
   * 셋 다 <b>품목 마스터</b>의 값이라 마스터를 받아 itemId 로 잇는다 —
   * 이 화면은 품목별로 합친 표라 줄에 그 값이 없다.
   *
   * <p>기간 이름표도 [기간] 이라 적고 있었는데 원본은 <b>[기준일자]</b> 다.
   */
  const [items, setItems] = useState<Item[]>([])
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const mgmt = useItemMgmt()
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  async function load() {
    setLoading(true); setError('')
    try {
      const [a, d, it, p] = await Promise.all([
        /*
         * <b>all: true</b> — 목록은 5,000 줄에서 자른다(원본 [오천건이상조회]). 이 화면은 줄을 보여 주는 게 아니라
         * <b>더하는</b> 보고서라, 잘리면 불량수량 합계가 아무 표시 없이 작아진다(경영보고서와 같은 까닭).
         */
        api.get<{ rows: StockAdjustment[] }>('/stock-adjustments', { params: { from, to, all: true } }),
        api.get<CommonCode[]>('/codes/DEFECT_TYPE'),
        api.get<Item[]>('/items'),
        /*
         * 원본 [생산수량]의 재료 — <b>생산실적</b>이다(위 Row.producedQty 주석의 실측).
         * 기간은 <b>생산일</b>로 보낸다: 이 화면의 [기준일자]가 불량처리에 거는 것과
         * 같은 축이다(작업지시가 언제 났는지를 묻는 자리가 아니다).
         */
        api.get<ProductionRow[]>('/productions', { params: { from, to } }),
      ])
      setAdjustments(a.data.rows); setDefectTypes(d.data); setItems(it.data)
      setProductions(p.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  /* 기간이 바뀌면 다시 물어본다 — 예전에는 전 기간을 받아 브라우저에서 걸렀다. */
  useEffect(() => { load() }, [from, to])

  /**
   * 원본 [데이터 보기형식] · [그래프로 보기].
   *
   * <p>이 화면은 <b>불량률</b>을 보는 표다(제목이 그렇고 정렬도 불량률 높은 순이다).
   * 그러니 수량이 아니라 <b>율</b>을 그린다 — 수량으로 그리면 많이 만든 품목이 늘 위에
   * 서서 '많이 만드니까 많이 틀린' 것과 '자주 틀리는' 것을 가릴 수가 없다.
   *
   * <p>생산이 없는 품목(생산수량 0)은 뺀다 — 율의 밑이 없어 <b>모르는 품목</b>이다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')

  const rows = useMemo<Row[]>(() => {
    const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)
    /* 창고코드는 줄에 없다 — 조건 목록(창고 마스터)에서 이름으로 되짚는다. */
    const codeOfWarehouse = (name: string) =>
      pickers.warehouses.find((w) => w.name === name)?.code ?? ''
    const map = new Map<string, Row>()
    const get = (wh: string | null, itemId: number, code: string, name: string, unit: string): Row => {
      const w = wh || '(미지정)'
      const key = w + '\u0000' + itemId
      let r = map.get(key)
      if (!r) {
        r = { warehouseName: w, warehouseCode: w === '(미지정)' ? '' : codeOfWarehouse(w),
          itemId, itemCode: code, itemName: name, spec: items.find((x) => x.id === itemId)?.spec ?? null, unit,
          producedQty: 0, defectQty: 0, defectRate: 0 }
        map.set(key, r)
      }
      return r
    }
    /* [불량유형] 코드도움은 코드를 주고, 불량처리 줄은 그 이름을 적는다. */
    const defectTypeName = defectTypeCond ? (defectTypes.find((d) => d.code === defectTypeCond)?.name ?? defectTypeCond) : ''
    for (const a of adjustments) {
      if (!inPeriod(a.adjustDate)) continue
      if (a.type !== 'DEFECT' && a.type !== 'DISPOSAL') continue
      if (a.normal) continue   // 불량처리의 정상품목 줄(들어온 재고)은 불량이 아니다
      if (handleCond !== '전체' && handlingOf(a) !== handleCond) continue
      if (defectTypeName && (a.kind ?? '') !== defectTypeName) continue
      if (employeeCond && String(a.employeeId) !== employeeCond) continue
      if (whCond && String(a.warehouseId) !== whCond) continue
      if (projCond && String(a.projectId) !== projCond) continue
      const r = get(a.warehouseName, a.itemId, a.itemCode, a.itemName, a.unit)
      r.defectQty += Math.abs(a.quantityChange)
    }
    /*
     * 원본 <b>[생산수량]</b>. 불량처리와 <b>같은 줄에 얹는다</b> — 원본에서 줄은
     * 둘의 합집합이라(송풍기 줄이 생산수량 없이 불량수량만 2였다), 생산만 있는 품목도
     * 줄이 선다.
     *
     * <p>조건은 <b>불량처리와 겹치는 것만</b>(창고 · 프로젝트) 건다. [불량유형] · [담당자]로 물었으면
     * 생산은 답하지 않는다 — 불량 전표의 축이라, 끼워 주면 무엇으로 걸린 표인지 알 수 없다.
     * [처리방법]은 불량을 어떻게 뺐나를 묻는 것이라 생산과 상관이 없다.
     */
    for (const p of productions) {
      if (!inPeriod(p.productionDate)) continue
      if (defectTypeCond || employeeCond) continue
      if (whCond && String(p.warehouseId) !== whCond) continue
      if (projCond && String(p.projectId) !== projCond) continue
      const r = get(p.warehouseName, p.productId, p.productCode, p.productName, p.productUnit)
      r.producedQty += p.producedQty
    }
    const kw = keyword.trim()
    const out = [...map.values()]
    for (const r of out) r.defectRate = r.producedQty > 0 ? (r.defectQty / r.producedQty) * 100 : 0
    return out
      // 품목 코드도움은 id 를 준다 — 이름이 같고 규격만 다른 품목이 섞이지 않게.
      .filter((r) => !kw || String(r.itemId) === kw)
      /* 품목구분·품목그룹1·규격은 <b>품목 마스터</b>의 값이라 itemId 로 이어 거른다. */
      .filter((r) => !categoryCond || (itemById.get(r.itemId)?.categoryName ?? '') === categoryCond)
      .filter((r) => !itemGroupCond || mgmt.groupOf(r.itemId) === itemGroupCond)
      .filter((r) => !specCond || (itemById.get(r.itemId)?.spec ?? '').includes(specCond))
      /*
       * <b>표의 차례는 창고 × 품목코드다</b> — 2026-09-21 원본 실측. 여태 <b>불량률 높은 순</b>
       * 하나로 세웠는데, 원본은 창고로 묶고 그 안에서 <b>품목코드 오름차순</b>으로 세운다
       * (완제품제조: AQD · AQD_BD · AQD_C · AQD_CT · AQD_CV · AQD_OS · AQD_PP).
       * 창고별 소계줄이 있으니 표가 창고로 묶여야 소계가 설 자리가 생긴다.
       *
       * <p><b>창고 사이의 차례는 못 쟀다</b> — 원본은 200 · 201 · 100 순이라 창고코드 순이
       * 아니었다(창고 마스터의 등록·정렬 순서일 수 있다). 여기서는 <b>창고명 오름차순</b>으로
       * 두고 '(미지정)' 을 맨 뒤로 보낸다(subtotalBy 의 규칙). 재면 그때 맞춘다.
       *
       * <p>불량률 높은 순은 <b>그래프</b>가 그대로 들고 간다 — 거기서는 무엇이 자주 틀리는지가
       * 읽는 목적이라 순서가 뜻을 지닌다.
       */
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustments, productions, defectTypes, from, to, keyword, employeeCond, handleCond, whCond, projCond, defectTypeCond,
      categoryCond, itemGroupCond, specCond, itemById, mgmt.groupOptions])

  /**
   * 원본 격자의 <b>창고별 소계줄</b> — 2026-09-21 실측('반제품제조 계 312' · '완제품제조 계 212' ·
   * '제품자재창고 계 2'). 우리 표에는 없어서 창고가 여럿이면 <b>어느 창고가 얼마인지</b>를
   * 사람이 눈으로 더해야 했다.
   *
   * <p><b>소계의 불량률 칸은 비운다.</b> 원본에서 그 칸에 값이 서는지는 <b>못 봤다</b> —
   * 실측한 세 소계가 다 한쪽 수만 가졌다(생산만 있거나 불량만 있거나). 모르는 것을
   * 지어내느니 비워 둔다. 합계줄은 원본이 실제로 값을 찍어(524 · 2 · <b>0</b>) 그대로 낸다.
   */
  const groups = useMemo(() => subtotalBy(rows, (r) => r.warehouseName, {
    produced: (r) => r.producedQty,
    defect: (r) => r.defectQty,
  }), [rows])

  const totals = useMemo(() => rows.reduce((s, r) => ({
    produced: s.produced + r.producedQty, defect: s.defect + r.defectQty,
  }), { produced: 0, defect: 0 }), [rows])
  const overallRate = totals.produced > 0 ? (totals.defect / totals.produced) * 100 : 0
  const reset = () => { setFrom(''); setTo(''); setKeyword('') }

  return (
    <EcListShell
      title="불량률파악보고서"
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
        dateLabel="기준일자"
        view={view} onViewChange={setView}
      >
        {/* 원본 차례: <b>창고 · 프로젝트</b> · 담당자 · 불량유형 · 처리방법 */}
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          {/* 불량처리 전표 머리의 [담당자](사원). */}
          <CodePickerField label="담당자" hideLabel width={150} emptyLabel="전체"
                           value={employeeCond} onChange={setEmployeeCond}
                           items={pickers.employees.map((e) => ({ ...e, value: String(e.id) }))} />
        </EcCond>
        {/* 원본 차례: 창고 · 프로젝트 · 담당자 · <b>불량유형</b> · 처리방법. */}
        <EcCond label="불량유형" pick>
          <CodePickerField label="불량유형" hideLabel width={150} emptyLabel="전체"
                           value={defectTypeCond} onChange={setDefectTypeCond}
                           items={defectTypes.map((d) => ({ value: d.code, code: d.code, name: d.name }))} />
        </EcCond>
        <EcCond label="처리방법">
          <select className="ec-input w-[100px]" value={handleCond}
                  onChange={(e) => setHandleCond(e.target.value as Handling)}>
            {HANDLINGS.map((h) => <option key={h}>{h}</option>)}
          </select>
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측, 스물하나): 기준일자 · 창고 · (창고계층그룹) ·
          프로젝트 · (프로젝트그룹1/2) · 담당자 · 불량유형 · 처리방법 · <b>품목</b> ·
          <b>품목구분 · 품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · <b>규격</b> ·
          (양식) · 적용양식 · 양식구분 · 정렬/소계기준 · 데이터 보기형식.
          [품목]은 <b>처리방법 뒤</b>다 — 우리는 앞에 두고 있었다.
        */}
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={keyword} onChange={(v) => setKeyword(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={140} emptyLabel="전체"
                           value={categoryCond} onChange={setCategoryCond}
                           items={[...new Set(items.map((i) => i.categoryName).filter(Boolean))].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체"
                           value={itemGroupCond} onChange={setItemGroupCond}
                           items={mgmt.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="규격">
          <ItemSuggestInput field="spec" value={specCond}
                            onChange={(v) => setSpecCond(v)} width={140} />
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {view === '그래프' ? (
        /* 표는 창고 순이지만 <b>그래프는 불량률 높은 순</b>이다 — 위 정렬 주석 참고. */
        <EcBarChart unit=" %" emptyText="생산한 품목이 없습니다."
                    rows={rows.filter((r) => r.producedQty > 0)
                      .map((r) => ({ label: r.itemName, value: Number(r.defectRate.toFixed(2)) }))
                      .sort((a, b) => b.value - a.value)} />
      ) : (
      <div className="ec-report-frame">
      <EcReportHead title="불량률파악보고서" period={reportPeriod(from, to)} />
      {/*
        열 폭 — 원본 <b>width:890px · table-layout:fixed · 110 / 110 / 110 / 230 / 110 / 110 / 110</b>
        (창고코드 · 창고명 · 품목코드 · 품목명[규격명] · 생산수량 · 불량수량 · 불량률, 2026-09-21 실측).
        <b>출력물 격자</b>(index.css .ec-report) — 줄무늬 없음(회색은 소계 · 합계줄뿐), 수량은 검정 · 보통 굵기.
        원본에 없던 우리 열(번호 · 단위 · 검사수량 · 검사불량 · 불량처리 · 폐기)과 위 요약 줄은 2026-10-13 에 뺐다.
      */}
      <table className="text-left ec-report ec-report-fixed w-[890px]">
        <thead>
          <tr>
            <th className="w-[110px]">창고코드</th>
            <th className="w-[110px]">창고명</th>
            <th className="w-[110px]">품목코드</th>
            <th className="w-[230px]">품목명[규격명]</th>
            <th className="text-right w-[110px]">생산수량</th>
            <th className="text-right w-[110px]">불량수량</th>
            <th className="text-right w-[110px]">불량률</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g, gi) => [
            ...g.rows.map((r) => (
            <tr key={r.warehouseName + '\u0000' + r.itemId}>
              <td>{r.warehouseCode}</td>
              <td className={r.warehouseName === '(미지정)' ? 'text-ec-hint' : undefined}>{r.warehouseName}</td>
              <td>{r.itemCode}</td>
              <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
              {/* 원본은 그 자료가 없는 칸을 <b>빈칸</b>으로 둔다(송풍기 줄: 생산 빈칸 · 불량 2, 반제품 줄: 생산 156 · 불량 빈칸). */}
              <td className="text-right">{r.producedQty ? won(r.producedQty) : ''}</td>
              <td className="text-right">{r.defectQty ? won(r.defectQty) : ''}</td>
              {/* 생산과 불량이 다 있어야 율이 선다 — 원본 실측 줄들은 한쪽만 있어 다 빈칸이었다. */}
              <td className="text-right">{r.producedQty > 0 && r.defectQty > 0 ? rateText(r.defectRate) : ''}</td>
            </tr>
            )),
            /* 원본 격자의 <b>[창고명] 계</b> 줄. 불량률 칸은 비운다(위 groups 주석). */
            <tr key={'sub' + gi} className="ec-total">
              <td colSpan={4} className="text-center">{g.label} 계</td>
              <td className="text-right">{g.sums.produced ? won(g.sums.produced) : ''}</td>
              <td className="text-right">{g.sums.defect ? won(g.sums.defect) : ''}</td>
              <td />
            </tr>,
          ])}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            {/* 원본 합계줄은 0 도 찍는다(524 · 2 · 0). */}
            <tr>
              <td colSpan={4} className="text-center">합계</td>
              <td className="text-right">{won(totals.produced)}</td>
              <td className="text-right">{won(totals.defect)}</td>
              <td className="text-right">{rateText(overallRate)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <EcReportFoot />
      </div>
      )}
    </EcListShell>
  )
}
