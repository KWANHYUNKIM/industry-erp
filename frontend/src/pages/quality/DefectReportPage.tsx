import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CommonCode, Item, QualityInspection, StockAdjustment } from '../../api/types'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import EcListShell from '../../components/EcListShell'
import { periodOf } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { subtotalBy } from '../../utils/subtotalBy'

/** 원본 [생산수량]의 재료. 이 화면이 쓰는 칸만 든다. */
interface ProductionRow {
  productId: number; productCode: string; productName: string; productUnit: string
  warehouseName: string
  producedQty: number; productionDate: string
  projectName: string | null
}

/**
 * 재고 II > 품질관리 — 불량률파악보고서 (이카운트 E040512)
 * 품질검사(검사수량·불량)와 기타이동의 불량처리·폐기 수량을 품목별로 모아 불량률을 파악한다.
 * 검사 목록 화면(QualityStatusPage)과 달리 품목 중심 종합 뷰다.
 * 데이터는 GET /api/quality-inspections + /api/stock-adjustments (백엔드 무변경).
 */

interface Row {
  /**
   * 원본은 <b>창고 × 품목</b>으로 묶는다(2026-09-09 E040512 실측: 첫 두 칸이
   * [창고코드]·[창고명]). 우리는 품목 하나로만 묶고 있었다 — 같은 품목이라도
   * <b>어느 창고에서 불량이 났는지</b>가 안 보였다.
   * 창고를 안 적은 검사·조정은 <b>(미지정)</b> 으로 한 덩어리가 된다 — 0 으로
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
  inspectedQty: number; inspectDefect: number; defectRate: number
  defectHandled: number; disposed: number
}

const won = (n: number) => n.toLocaleString('ko-KR')
const rateColor = (r: number) => (r >= 5 ? '#c60a2e' : r >= 1 ? '#c07a00' : '#1c7c3c')

export default function DefectReportPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'warehouses', 'projects'])
  const [inspections, setInspections] = useState<QualityInspection[]>([])
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
   * 원본 불량률파악보고서 조건 차례: 창고 · 프로젝트 · <b>담당자</b> · 불량유형 · <b>처리방법</b>.
   *
   * <p>[담당자]는 <b>검사자</b>다 — 누가 본 검사만 추릴 수 있어야 한다.
   * [처리방법]은 불량을 <b>불량처리로 뺐나 폐기로 뺐나</b> 다(재고조정의 갈래).
   * 둘 다 원자료에는 있는데 <b>합친 뒤라 화면에서 거를 수가 없었다</b> —
   * 합치기 전에 건다. [창고]·[프로젝트]·[불량유형]은 품질검사에 그 값이 없다.
   */
  /*
   * [창고]·[프로젝트]는 <b>품질검사에 그 칸이 없어</b> 일부러 안 만들었던 조건이다
   * (창고로 거르면 재고조정 쪽만 걸러져 반쪽짜리 보고서가 됐다).
   * 이제 검사·조정 <b>양쪽 다</b> 창고·프로젝트를 무니 제대로 거를 수 있다.
   */
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [inspectorCond, setInspectorCond] = useState('')
  /*
   * 원본 [불량유형] — 공통코드 DEFECT_TYPE 의 코드도움이다(사본 실측 ddlBadType).
   * 예전에는 '품질검사에 그 값이 없다' 고 적어 두고 뺐다. 이제 검사에 유형을 적으므로 만든다.
   */
  const [defectTypeCond, setDefectTypeCond] = useState('')
  const [defectTypes, setDefectTypes] = useState<CommonCode[]>([])
  const [handleCond, setHandleCond] = useState<'전체' | '불량' | '폐기'>('전체')
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
      const [q, a, d, it, p] = await Promise.all([
        /*
         * <b>검사도 기간을 서버에 넘긴다.</b> 바로 아래 재고조정은 진작 넘기고 있었는데
         * 이것만 전 기간을 받아 아래 inPeriod 로 걸렀다 — 옆줄이 하는 일을 이 줄만 안 했다.
         */
        api.get<QualityInspection[]>('/quality-inspections', { params: { from, to } }),
        api.get<{ rows: StockAdjustment[] }>('/stock-adjustments', { params: { from, to } }),
        api.get<CommonCode[]>('/codes/DEFECT_TYPE'),
        api.get<Item[]>('/items'),
        /*
         * 원본 [생산수량]의 재료 — <b>생산실적</b>이다(위 Row.producedQty 주석의 실측).
         * 기간은 <b>생산일</b>로 보낸다: 이 화면의 [기준일자]가 검사·불량처리에 거는 것과
         * 같은 축이다(작업지시가 언제 났는지를 묻는 자리가 아니다).
         */
        api.get<ProductionRow[]>('/productions', { params: { from, to } }),
      ])
      setInspections(q.data); setAdjustments(a.data.rows); setDefectTypes(d.data); setItems(it.data)
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
   * <p>검사를 한 번도 안 한 품목(검사수량 0)은 뺀다. 불량률이 0 으로 잡혀 <b>멀쩡한 품목</b>
   * 처럼 줄을 서는데, 실은 <b>모르는 품목</b>이다. 둘을 같은 막대로 그리면 안 된다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')

  const rows = useMemo<Row[]>(() => {
    const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to)
    /* 창고코드는 줄에 없다 — 조건 목록(창고 마스터)에서 이름으로 되짚는다. */
    const codeOfWarehouse = (name: string) =>
      pickers.warehouses.find((w) => w.value === name)?.code ?? ''
    const map = new Map<string, Row>()
    const get = (wh: string | null, itemId: number, code: string, name: string, unit: string): Row => {
      const w = wh || '(미지정)'
      const key = w + '\u0000' + itemId
      let r = map.get(key)
      if (!r) {
        r = { warehouseName: w, warehouseCode: w === '(미지정)' ? '' : codeOfWarehouse(w),
          itemId, itemCode: code, itemName: name, spec: items.find((x) => x.id === itemId)?.spec ?? null, unit,
          producedQty: 0,
          inspectedQty: 0, inspectDefect: 0, defectRate: 0, defectHandled: 0, disposed: 0 }
        map.set(key, r)
      }
      return r
    }
    for (const q of inspections) {
      if (!inPeriod(q.inspectionDate)) continue
      if (inspectorCond && (q.inspector ?? '') !== inspectorCond) continue
      /*
       * <b>합치기 전에</b> 건다. 품목별로 합친 뒤에는 어느 유형이 얼마였는지가 사라져
       * 화면에서는 더 이상 거를 수가 없다.
       *
       * <p>재고조정(불량처리·폐기)에는 유형이 없다. 유형으로 물었으면 <b>검사만</b> 답한다 —
       * 유형 없는 것을 끼워 주면 무엇으로 걸린 표인지 알 수 없다.
       */
      if (defectTypeCond && q.defectType !== defectTypeCond) continue
      if (whCond && (q.warehouseName ?? '') !== whCond) continue
      if (projCond && (q.projectName ?? '') !== projCond) continue
      const r = get(q.warehouseName, q.itemId, q.itemCode, q.itemName, q.unit)
      r.inspectedQty += q.inspectedQty; r.inspectDefect += q.defectQty
    }
    for (const a of adjustments) {
      if (!inPeriod(a.adjustDate)) continue
      if (a.type !== 'DEFECT' && a.type !== 'DISPOSAL') continue
      if (defectTypeCond) continue   // 조정에는 불량유형이 없다 — 위 주석 참고
      if (handleCond === '불량' && a.type !== 'DEFECT') continue
      if (handleCond === '폐기' && a.type !== 'DISPOSAL') continue
      if (whCond && a.warehouseName !== whCond) continue
      if (projCond && (a.projectName ?? '') !== projCond) continue
      const r = get(a.warehouseName, a.itemId, a.itemCode, a.itemName, a.unit)
      const qty = Math.abs(a.quantityChange)
      if (a.type === 'DEFECT') r.defectHandled += qty
      else r.disposed += qty
    }
    /*
     * 원본 <b>[생산수량]</b>. 검사·불량처리와 <b>같은 줄에 얹는다</b> — 원본에서 줄은
     * 둘의 합집합이라(송풍기 줄이 생산수량 없이 불량수량만 2였다), 생산만 있는 품목도
     * 줄이 선다.
     *
     * <p>조건은 <b>검사·불량처리와 겹치는 것만</b> 건다. [불량유형]으로 물었으면 생산은
     * 답하지 않는다 — 검사에만 있는 축이라, 끼워 주면 무엇으로 걸린 표인지 알 수 없다
     * (바로 위 재고조정이 같은 까닭으로 빠진다). [검사자]도 마찬가지다.
     * [처리방법]은 불량을 어떻게 뺐나를 묻는 것이라 생산과 상관이 없다.
     */
    for (const p of productions) {
      if (!inPeriod(p.productionDate)) continue
      if (defectTypeCond || inspectorCond) continue
      if (whCond && p.warehouseName !== whCond) continue
      if (projCond && (p.projectName ?? '') !== projCond) continue
      const r = get(p.warehouseName, p.productId, p.productCode, p.productName, p.productUnit)
      r.producedQty += p.producedQty
    }
    const kw = keyword.trim()
    const out = [...map.values()]
    for (const r of out) r.defectRate = r.inspectedQty > 0 ? (r.inspectDefect / r.inspectedQty) * 100 : 0
    return out
      .filter((r) => !kw || r.itemName.includes(kw) || r.itemCode.includes(kw))
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
  }, [inspections, adjustments, productions, from, to, keyword, inspectorCond, handleCond, whCond, projCond, defectTypeCond,
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
    inspected: (r) => r.inspectedQty,
    defect: (r) => r.inspectDefect,
    handled: (r) => r.defectHandled,
    disposed: (r) => r.disposed,
  }), [rows])

  const totals = useMemo(() => rows.reduce((s, r) => ({
    produced: s.produced + r.producedQty,
    inspected: s.inspected + r.inspectedQty, defect: s.defect + r.inspectDefect,
    handled: s.handled + r.defectHandled, disposed: s.disposed + r.disposed,
  }), { produced: 0, inspected: 0, defect: 0, handled: 0, disposed: 0 }), [rows])
  const overallRate = totals.inspected > 0 ? (totals.defect / totals.inspected) * 100 : 0
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
          {/*
            마스터를 고르는 칸은 코드도움이다. 다만 검사자는 <b>사원 마스터를 물지 않고</b>
            검사에 이름으로 적히므로, 후보를 <b>실제로 검사한 사람들</b>에서 뽑는다 —
            사원 목록에서 뽑으면 고를 수 있는데 아무것도 안 나오는 이름이 섞인다.
          */}
          <CodePickerField label="담당자" hideLabel width={150} emptyLabel="전체"
                           value={inspectorCond} onChange={setInspectorCond}
                           items={[...new Set(inspections.map((q) => q.inspector).filter(Boolean))]
                             .map((n) => ({ value: n as string, name: n as string }))} />
        </EcCond>
        {/* 원본 차례: 창고 · 프로젝트 · 담당자 · <b>불량유형</b> · 처리방법. */}
        <EcCond label="불량유형" pick>
          <CodePickerField label="불량유형" hideLabel width={150} emptyLabel="전체"
                           value={defectTypeCond} onChange={setDefectTypeCond}
                           items={defectTypes.map((d) => ({ value: d.code, code: d.code, name: d.name }))} />
        </EcCond>
        <EcCond label="처리방법">
          <select className="ec-input" value={handleCond} style={{ width: 100 }}
                  onChange={(e) => setHandleCond(e.target.value as '전체' | '불량' | '폐기')}>
            <option>전체</option><option>불량</option><option>폐기</option>
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
          <input className="ec-input" value={specCond}
                 onChange={(e) => setSpecCond(e.target.value)} style={{ width: 140 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        전체 불량률 <b style={{ color: rateColor(overallRate), fontSize: 15 }}>{overallRate.toFixed(2)}%</b>
        <span style={{ margin: '0 8px', color: '#c9ced6' }}>|</span>
        폐기계 <b style={{ color: '#6b3fb0', fontSize: 14 }}>{won(totals.disposed)}</b>
      </div>

      <p className="mb-2 text-xs text-slate-500">품목별 검사 불량률 + 불량처리·폐기 수량 종합. 불량률 = 검사불량 ÷ 검사수량. 불량률 높은 순.</p>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {view === '그래프' ? (
        /* 표는 창고 순이지만 <b>그래프는 불량률 높은 순</b>이다 — 위 정렬 주석 참고. */
        <EcBarChart unit=" %" emptyText="검사한 품목이 없습니다."
                    rows={rows.filter((r) => r.inspectedQty > 0)
                      .map((r) => ({ label: r.itemName, value: Number(r.defectRate.toFixed(2)) }))
                      .sort((a, b) => b.value - a.value)} />
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/*
              <b>불량률파악보고서(E040512) 2026-09-09 원본 격자 실측</b> — 열이 일곱이다:
              [창고코드 · 창고명 · 품목코드 · <b>품목명[규격명]</b> · <b>생산수량</b> ·
              <b>불량수량</b> · 불량률].
              고친 것: 품목명 뒤에 규격을 대괄호로 붙였다(원본 이름 그대로).
              [창고코드]·[창고명]은 <b>2026-09-09 에 만들었다</b> — 묶는 열쇠를
              품목 하나에서 <b>창고 × 품목</b>으로 바꿨다. 창고를 안 적은 검사·조정은
              <b>(미지정)</b> 한 덩어리가 된다(창고코드는 비운다).
              <b>[생산수량]·[불량수량]은 우리 값이 아니다</b> — 우리 숫자는
              <b>검사</b>에서 나온다(검사수량·검사불량). 생산수량이라 부르면
              검사 안 한 생산분까지 센 것처럼 읽혀 거짓이 된다(예외에 적었다).
              [단위]·[불량처리]·[폐기]는 우리 열이다.
            */}
            <th style={{ width: 90 }}>창고코드</th>
            <th style={{ width: 120 }}>창고명</th>
            <th>품목코드</th>
            <th>품목명[규격명]</th>
            <th style={{ textAlign: 'center', width: 46 }}>단위</th>
            {/* 원본 차례: 품목명[규격명] 다음이 [생산수량]이다(2026-09-21 실측). */}
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>검사수량</th>
            <th style={{ textAlign: 'right' }}>검사불량</th>
            <th style={{ textAlign: 'right' }}>불량률</th>
            <th style={{ textAlign: 'right' }}>불량처리</th>
            <th style={{ textAlign: 'right' }}>폐기</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g, gi) => [
            ...g.rows.map((r, i) => (
            <tr key={r.warehouseName + '\u0000' + r.itemId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: r.warehouseCode ? undefined : '#c5cbd3' }}>{r.warehouseCode}</td>
              <td style={{ color: r.warehouseName === '(미지정)' ? '#9aa1ab' : undefined }}>{r.warehouseName}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
              <td style={{ textAlign: 'center', color: '#8a929c' }}>{r.unit}</td>
              {/* 원본도 생산이 없는 줄은 <b>빈칸</b>이다(송풍기 줄) — 0 으로 찍지 않는다. */}
              <td style={{ textAlign: 'right', color: r.producedQty ? undefined : '#c5cbd3' }}>{r.producedQty ? won(r.producedQty) : ''}</td>
              <td style={{ textAlign: 'right' }}>{won(r.inspectedQty)}</td>
              <td style={{ textAlign: 'right', color: r.inspectDefect ? '#c60a2e' : '#c5cbd3' }}>{r.inspectDefect ? won(r.inspectDefect) : ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: rateColor(r.defectRate) }}>{r.inspectedQty > 0 ? `${r.defectRate.toFixed(2)}%` : ''}</td>
              <td style={{ textAlign: 'right', color: r.defectHandled ? '#a5561b' : '#c5cbd3' }}>{r.defectHandled ? won(r.defectHandled) : ''}</td>
              <td style={{ textAlign: 'right', color: r.disposed ? '#6b3fb0' : '#c5cbd3' }}>{r.disposed ? won(r.disposed) : ''}</td>
            </tr>
            )),
            /* 원본 격자의 <b>[창고명] 계</b> 줄. 불량률 칸은 비운다(위 groups 주석). */
            <tr key={'sub' + gi} style={{ background: '#f2f5f8', fontWeight: 600 }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>{g.label} 계</td>
              <td />
              <td style={{ textAlign: 'right' }}>{g.sums.produced ? won(g.sums.produced) : ''}</td>
              <td style={{ textAlign: 'right' }}>{g.sums.inspected ? won(g.sums.inspected) : ''}</td>
              <td style={{ textAlign: 'right', color: g.sums.defect ? '#c60a2e' : undefined }}>{g.sums.defect ? won(g.sums.defect) : ''}</td>
              <td />
              <td style={{ textAlign: 'right', color: g.sums.handled ? '#a5561b' : undefined }}>{g.sums.handled ? won(g.sums.handled) : ''}</td>
              <td style={{ textAlign: 'right', color: g.sums.disposed ? '#6b3fb0' : undefined }}>{g.sums.disposed ? won(g.sums.disposed) : ''}</td>
            </tr>,
          ])}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={6} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(totals.produced)}</td>
              <td style={{ textAlign: 'right' }}>{won(totals.inspected)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(totals.defect)}</td>
              <td style={{ textAlign: 'right', color: rateColor(overallRate) }}>{overallRate.toFixed(2)}%</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(totals.handled)}</td>
              <td style={{ textAlign: 'right', color: '#6b3fb0' }}>{won(totals.disposed)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      )}
    </EcListShell>
  )
}
