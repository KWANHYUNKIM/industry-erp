import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { STATUS_PICKS, periodOf, comparePeriodOf, type ComparePeriod } from '../../components/EcPeriodPicks'
import { stdVsActual } from '../../utils/woEfficiency'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { weekOfYear } from '../../utils/statusAggregate'

/**
 * 생산관리 > 작업내역현황 — 작업 실적을 기간·조건으로 본다 (/api/work-results).
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 내역 | 집계 | 라인별 · 기준일자(금월(~오늘)) · 생산공장 · 작업 · 담당자 ·
 *   작업품목 · 생산품목
 * 우리는 조건 판이 없고 라인 목록 하나뿐이었다 — 기간으로 못 걸러 작업내역 425건이
 * 통째로 쏟아졌고, 공정별로 얼마나 나왔는지는 볼 수가 없었다.
 *
 * <p>원본 라인 열 실측(사본): 일자-No. · 생산공장명 · <b>작업명</b> · <b>생산품목명</b> ·
 * 품목명[규격] · 수량 · <b>자원명</b> · <b>표준작업시간</b> · 작업시간 · <b>차이(표준-실제)</b>.
 * 표준작업시간·차이·자원명·생산품목명이 우리에게 없었다 — 실제 작업시간만 있으면
 * "오래 걸렸다" 를 말할 기준이 없다. BOR(작업소요시간)이 그 기준이라 서버가 그 품목·공정의
 * 표준시간을 계산해 실어 준다.
 *
 * <p>원본의 '작업'은 우리 자료의 공정에 해당한다.
 */
type Mode = '내역' | '집계'
/*
 * 원본 [구분]은 <b>내역·집계 둘</b>이다(대조표 실측). [라인별]은 우리가 더 둔 갈래였는데,
 * 원본 [내역]이 이미 <b>줄 단위</b>다(격자 대조표가 일자-No. · 생산공장명 · 작업명 ·
 * 생산품목명 · 품목명[규격] · 수량 … 을 적고 있다). 우리 [내역]만 작업지시로 접고 있어서
 * 줄을 보려고 갈래를 하나 더 만들어 둔 것이었다 - 생산불출현황과 똑같은 꼴이다.
 * [내역]을 원본대로 두면 둘이 같은 표가 되므로 갈래를 없앤다.
 */
const MODES = ['내역', '집계'] as const

interface WorkResult {
  /** 작업내역 전표번호 — 한 전표의 줄들이 같은 번호를 나눠 가진다. */
  resultNo: string
  /** 원본 [최초작성자] — 넣은 계정(2026-10-02 전에 넣은 작업내역은 비어 있다). */
  createdBy?: string | null
  id: number
  workOrderId: number | null
  workOrderNo: string | null
  processId: number | null
  process: string
  warehouseName: string | null
  productId: number | null
  productCode: string | null
  productName: string | null
  /** 원본 라인 열의 [품목명[규격]] — 작업품목. 생산품목명과 다른 열이다. */
  workItemName: string | null
  workItemSpec: string | null
  resourceId: number | null
  resourceName: string | null
  /** BOR 표준작업시간(분). 그 품목·공정의 라우팅이 없으면 null — 0 과 다르다. */
  standardTimeMin: number | null
  worker: string | null
  goodQty: number
  defectQty: number
  workTimeMin: number
  workDate: string
  note: string | null
  /**
   * 품목구분 둘 · 품목코드 · 프로젝트 — <code>WorkResultResponse</code> 가 진작 싣는데
   * 이 화면이 받아 두지 않았다(2026-09-08 원본 실측으로 드러났다).
   * 작업내역<b>조회</b> 는 같은 값을 이미 쓰고 있다 — 현황만 뒤처져 있었다.
   */
  workItemCode: string | null
  workItemCategoryName: string | null
  productCategoryName: string | null
  projectName: string | null
}

const num = (n: number) => n.toLocaleString('ko-KR')
/** 차이는 부호를 붙여 보여 준다 — 양수면 표준보다 빨리 끝냈다는 뜻이다. */
const gap = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString('ko-KR')
const pct = (defect: number, good: number) => {
  const total = good + defect
  return total > 0 ? ((defect / total) * 100).toFixed(1) : '0.0'
}

export default function WorkResultListPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['employees', 'items'])
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다 —
   * 결재를 안 받을 자료까지 도장칸을 달고 나가면 종이가 한 칸씩 밀린다.
   */
  const [signBox, setSignBox] = useState(false)
  const [rows, setRows] = useState<WorkResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [mode, setMode] = useState<Mode>('내역')
  /** 원본 ◉내역 아래 선택상자 — 라인별(기본, 작업 줄마다) · 전표별(작업내역 전표 한 장이 한 줄)(2026-10-02 loginaa 실측). */
  const [lineView, setLineView] = useState<'라인별' | '전표별' | '일별' | '월별' | '담당자별'>('라인별')
  const [process, setProcess] = useState('')
  const [worker, setWorker] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [product, setProduct] = useState('')
  /**
   * 원본 작업내역현황 조건 실측(사본): 구분 · 기준일자 · <b>생산공장</b> · 작업 · 담당자 ·
   * <b>작업품목</b> · 생산품목. 둘이 빠져 있었다 — 작업품목은 이번에 자리가 생겨서,
   * 생산공장은 응답에 있는데 조건이 없어서 못 걸렀다.
   */
  const [workItem, setWorkItem] = useState('')
  const [plant, setPlant] = useState('')
  /*
   * 2026-09-08 에 원본(E040432)의 조건 판을 재니 <b>서른둘</b>이다(사본에는 열하나).
   * 접힌 줄은 없다.
   *
   * <p>만든 것 아홉: 작업품목:품목구분 · 작업품목:품목그룹1 · 생산품목:품목구분 ·
   * 생산품목:품목그룹1 · 프로젝트 · 자원 · 수량 · 작업시간 · 적요.
   * 값은 응답에 진작 다 있었다 — 작업내역<b>조회</b> 가 이미 쓰는 값이다.
   *
   * <p><b>[작업지시No.] 는 걷어냈다</b> — 원본 작업내역현황에도 작업내역조회에도
   * 그런 조건이 없다. 우리만 하나 더 두고 있었다(표의 열로는 그대로 보인다).
   * 이름도 [작업(공정)] → <b>[작업]</b> 으로 원본을 따른다.
   */
  const [workItemCategory, setWorkItemCategory] = useState('')
  const [workItemGroup, setWorkItemGroup] = useState('')
  const [productCategory, setProductCategory] = useState('')
  const [productGroup, setProductGroup] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [resourceCond, setResourceCond] = useState('')
  const [qtyFrom, setQtyFrom] = useState('')
  const [qtyTo, setQtyTo] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [noteCond, setNoteCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const mgmt = useItemMgmt()

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<WorkResult[]>('/work-results')
      setRows([...res.data].sort((a, b) =>
        (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setMode('내역'); setProcess(''); setWorker(''); setOrderNo(''); setProduct('')
    setWorkItem(''); setPlant('')
    setWorkItemCategory(''); setWorkItemGroup(''); setProductCategory(''); setProductGroup('')
    setProjectCond(''); setResourceCond(''); setQtyFrom(''); setQtyTo('')
    setTimeFrom(''); setTimeTo(''); setNoteCond('')
  }

  /** 조건으로 거른다 — 기간만 바꿔 [비교기간] 줄도 같은 조건으로 거른다. */
  const filterRows = (lo: string, hi: string) => rows.filter((r) => {
    if (r.workDate < lo || r.workDate > hi) return false
    if (process && !r.process.includes(process)) return false
    if (worker && !(r.worker ?? '').includes(worker)) return false
    if (orderNo && !(r.workOrderNo ?? '').includes(orderNo)) return false
    if (product && String(r.productId) !== product) return false
    if (workItem && !(r.workItemName ?? '').includes(workItem)) return false
    if (plant && !(r.warehouseName ?? '').includes(plant)) return false
    if (workItemCategory && (r.workItemCategoryName ?? '') !== workItemCategory) return false
    if (workItemGroup && mgmt.groupOfCode(r.workItemCode) !== workItemGroup) return false
    if (productCategory && (r.productCategoryName ?? '') !== productCategory) return false
    if (productGroup && mgmt.groupOfCode(r.productCode) !== productGroup) return false
    if (projectCond && (r.projectName ?? '') !== projectCond) return false
    if (resourceCond && (r.resourceName ?? '') !== resourceCond) return false
    if (qtyFrom && r.goodQty < Number(qtyFrom)) return false
    if (qtyTo && r.goodQty > Number(qtyTo)) return false
    if (timeFrom && r.workTimeMin < Number(timeFrom)) return false
    if (timeTo && r.workTimeMin > Number(timeTo)) return false
    if (noteCond && !(r.note ?? '').includes(noteCond)) return false
    if (authorCond && (r.createdBy ?? '') !== authorCond) return false
    return true
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => filterRows(from, to), [rows, from, to, process, worker, orderNo, product, workItem, plant,
       workItemCategory, workItemGroup, productCategory, productGroup, projectCond,
       resourceCond, qtyFrom, qtyTo, timeFrom, timeTo, noteCond, authorCond, mgmt.groupOptions])

  /** 내역 [전표별] — 작업내역 번호 하나가 한 줄(첫 작업 외 n건, 수량·시간 합; 표준이 빈 줄이 있으면 표준은 모름). */
  const listRows = useMemo(() => {
    if (lineView === '라인별') return shown
    const m = new Map<string, WorkResult[]>()
    /* 일별 · 월별 — 그날(그달) 줄을 한 줄로, 일자만 찍고(No. 없음) 창고·품목은 처음 줄 것, 수량·금액은 합
       (원본 실측 2026-10-02: 9/3 줄 인텔 코어 270 · 43,110,000 = 그날 세 자재의 합). */
    /* 담당자별 — 작업자 하나가 한 줄(일자-No.·작업은 처음 줄 것). */
    const keyOf = (r: WorkResult) => lineView === '일별' ? r.workDate : lineView === '월별' ? r.workDate.slice(0, 7)
      : lineView === '담당자별' ? (r.worker ?? '') : r.resultNo
    shown.forEach((r) => m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]))
    return [...m.values()].map((ls) => ({ ...ls[0],
      ...(lineView === '일별' || lineView === '월별' ? { resultNo: '', workDate: lineView === '월별' ? ls[0].workDate.slice(0, 7).replace('-', '/') : ls[0].workDate } : {}),
      process: lineView === '전표별' && ls.length > 1 ? `${ls[0].process} 외 ${ls.length - 1}건` : ls[0].process,
      goodQty: ls.reduce((n, r) => n + r.goodQty, 0),
      defectQty: ls.reduce((n, r) => n + r.defectQty, 0),
      workTimeMin: ls.reduce((n, r) => n + r.workTimeMin, 0),
      standardTimeMin: ls.some((r) => r.standardTimeMin == null) ? null : ls.reduce((n, r) => n + (r.standardTimeMin ?? 0), 0),
    }))
  }, [shown, lineView])
  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ good: s.good + r.goodQty, defect: s.defect + r.defectQty, time: s.time + r.workTimeMin }),
    { good: 0, defect: 0, time: 0 },
  ), [shown])

  /**
   * 표준 대 실제. 표준을 모르는 줄은 표준·차이에서 빼고 세기만 한다 —
   * 0 으로 치면 라우팅을 안 세운 품목 때문에 합계 차이가 통째로 마이너스가 된다.
   */
  const time = useMemo(() => stdVsActual(
    shown.map((r) => ({ standard: r.standardTimeMin, actual: r.workTimeMin })),
  ), [shown])

  /** 집계 — 공정(원본의 '작업') 단위로 모은다. */
  /*
   * 원본 [정렬/소계기준]. 우리는 <b>공정으로만</b> 묶고 있었는데, 같은 자료를
   * 생산품목별로 보고 싶은 사람과 작업자별·생산공장별로 보고 싶은 사람이 따로 있다.
   */
  const SUBTOTALS = ['작업(공정)', '생산품목', '작업자', '생산공장'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('작업(공정)')
  /*
   * 원본 ○집계의 [집계조건1] · [집계조건2] 후보(2026-10-02 loginaa 실측): 기간(일별 · 주차별 · 월별 · 분기별 · 반기별 · 연별) ·
   * 생산품목(품목명[규격] · 품목그룹1·2·3) · 작업품목(품목명[규격] · 품목그룹1·2·3) · 작업내역(담당자 · 창고 · 작업 · 자원 · 프로젝트).
   * 우리는 [정렬/소계기준] 넷(작업 · 생산품목 · 작업자 · 생산공장)을 조건1 로 겸하고 조건2 에 월별 하나를 더 두었었다.
   * 이제 집계 판에 조건1 을 따로 둔다 — [정렬/소계기준] 은 원본처럼 내역 판의 것이다. 품목그룹2·3 은 전역 예외.
   */
  const AGG_AXES = ['작업(공정)', '일별', '주차별', '월별', '분기별', '반기별', '연별', '생산품목', '생산품목그룹1',
    '작업품목', '작업품목그룹1', '작업자', '생산공장', '자원', '프로젝트'] as const
  type AggAxis = typeof AGG_AXES[number]
  const [agg1, setAgg1] = useState<AggAxis>('작업(공정)')
  const [sub2, setSub2] = useState<AggAxis | ''>('')
  /** 원본 [집계조건3] — 조건2 를 고른 뒤에만 연다(생산불출 · 작업지시서현황과 같은 판). */
  const [sub3Raw, setSub3] = useState<AggAxis | ''>('')
  const sub3 = sub2 && sub3Raw !== agg1 && sub3Raw !== sub2 ? sub3Raw : ''
  /*
   * 원본 ○집계의 [비교기간] — 사용안함 · 전년/전월/전주/전일 동일기간(2026-10-02 실측). 작업내역은 화면이 통째로 받으므로
   * 그 기간을 같은 조건으로 다시 걸러 양품 · 불량 · 작업시간을 견준다.
   */
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const prevRange = comparePeriodOf(from, to, compare)
  const keyBy = (k: AggAxis, r: WorkResult): string => {
    const d = r.workDate
    const m = Number(d.slice(5, 7))
    switch (k) {
      case '일별': return d.replace(/-/g, '/')
      case '주차별': return `${d.slice(0, 4)}년 ${weekOfYear(d)}주`
      case '월별': return d.slice(0, 7).replace('-', '/')
      case '분기별': return `${d.slice(0, 4)} ${Math.floor((m - 1) / 3) + 1}분기`
      case '반기별': return `${d.slice(0, 4)} ${m <= 6 ? '상' : '하'}반기`
      case '연별': return d.slice(0, 4)
      case '생산품목': return r.productName ?? '(없음)'
      case '생산품목그룹1': return mgmt.groupOfCode(r.productCode) || '(없음)'
      case '작업품목': return r.workItemName ?? '(없음)'
      case '작업품목그룹1': return mgmt.groupOfCode(r.workItemCode) || '(없음)'
      case '작업자': return r.worker || '(미지정)'
      case '생산공장': return r.warehouseName ?? '(없음)'
      case '자원': return r.resourceName ?? '(없음)'
      case '프로젝트': return r.projectName ?? '(없음)'
      default: return r.process
    }
  }
  const keyOf = (r: WorkResult) => ([agg1, sub2, sub3].filter(Boolean) as AggAxis[]).map((a) => keyBy(a, r)).join(' · ')

  /*
   * 원본 집계 [기타] 가로보기 · 비율표시 · 코드포함과 조건 옆 정렬(코드순 기본 · 코드명순 · 수량 + 오름/내림) —
   * 생산불출현황 · 작업지시서현황과 같은 판(2026-10-02 실측). 수량은 양품으로 센다. 코드는 생산품목 · 작업품목 축만
   * (작업 · 생산공장 · 자원은 줄에 코드가 없다).
   */
  const [ratio, setRatio] = useState(false)
  const [codeIncl, setCodeIncl] = useState(false)
  const [pivot, setPivot] = useState(false)
  const [aggSort, setAggSort] = useState<'코드순' | '코드명순' | '수량'>('코드순')
  const [aggDesc, setAggDesc] = useState(false)
  const CODE_LABEL: Partial<Record<AggAxis, string>> = { 생산품목: '생산품목코드', 작업품목: '작업품목코드' }
  const codeBy = (k: AggAxis | '', r: WorkResult) => (k === '생산품목' ? r.productCode ?? '' : k === '작업품목' ? r.workItemCode ?? '' : '')
  const byProcess = useMemo(() => {
    const by = new Map<string, { process: string; k1: string; k2: string; c1: string; c2: string; count: number; good: number; defect: number; time: number }>()
    for (const r of shown) {
      const k = keyOf(r)
      const cur = by.get(k) ?? { process: k, k1: keyBy(agg1, r), k2: sub2 ? keyBy(sub2, r) : '', c1: codeBy(agg1, r), c2: codeBy(sub2, r), count: 0, good: 0, defect: 0, time: 0 }
      cur.count += 1
      cur.good += r.goodQty
      cur.defect += r.defectQty
      cur.time += r.workTimeMin
      by.set(k, cur)
    }
    /* 코드순 — 코드가 없는 축(날짜 · 작업 …)은 이름 그대로가 차례다. */
    const sk = (g: { process: string; c1: string; c2: string }) => (aggSort === '코드순' ? `${g.c1 || g.process}\u0000${g.c2}\u0000${g.process}` : g.process)
    const out = [...by.values()].sort((a, b) => aggSort === '수량' ? a.good - b.good : sk(a).localeCompare(sk(b), 'ko'))
    return aggDesc ? out.reverse() : out
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [shown, agg1, sub2, sub3, mgmt.groupOptions, aggSort, aggDesc])
  const code1 = codeIncl ? CODE_LABEL[agg1] : undefined
  const code2 = codeIncl && sub2 ? CODE_LABEL[sub2] : undefined
  /* 코드 · 비율 · 가로보기로 칸 수가 바뀐다 — 그려진 표를 직접 잰다. */
  const aggRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(aggRef, '작업내역현황 집계', [agg1, sub2, sub3, ratio, codeIncl, pivot, mode])
  const [view, setView] = useState<'표' | '그래프'>('표')
  /* 원본 [그래프로 보기]. 작업내역은 <b>어느 공정에서 얼마나 나왔나</b> 를 보는 화면이다. */
  const chartRows = useMemo(() =>
    mode === '집계'
      ? byProcess.map((r) => ({ label: r.process, value: r.good }))
      : shown.map((r) => ({ label: `${r.workDate} ${r.process}`, value: r.goodQty })),
    [mode, byProcess, shown])

  return (
    <EcListShell
      title="작업내역현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      <EcStatusPanel
        compare={mode === '집계' ? compare : undefined} onCompareChange={mode === '집계' ? setCompare : undefined}
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        modeExtra={mode === '집계' ? (
          <span style={{ display: 'inline-flex', gap: 6, marginLeft: 6, alignItems: 'center', fontSize: 12 }}>
            집계조건1
            <select className="ec-input" value={agg1} onChange={(e) => setAgg1(e.target.value as AggAxis)} style={{ width: 110 }}>
              {AGG_AXES.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select className="ec-input" value={aggSort} onChange={(e) => setAggSort(e.target.value as typeof aggSort)} style={{ width: 84 }} title="정렬">
              {(['코드순', '코드명순', '수량'] as const).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button type="button" className="ec-btn" onClick={() => setAggDesc((d) => !d)} title={aggDesc ? '내림차순' : '오름차순'}
                    style={{ padding: '0 6px', height: 24 }}>{aggDesc ? '↓' : '↑'}</button>
            집계조건2
            <select className="ec-input" value={sub2} onChange={(e) => setSub2(e.target.value as AggAxis | '')} style={{ width: 110 }}>
              <option value="">없음</option>
              {AGG_AXES.filter((k) => k !== agg1).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            {sub2 && (<>
              집계조건3
              <select className="ec-input" value={sub3} onChange={(e) => setSub3(e.target.value as AggAxis | '')} style={{ width: 110 }}>
                <option value="">없음</option>
                {AGG_AXES.filter((k) => k !== agg1 && k !== sub2).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </>)}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: sub2 ? undefined : '#9aa1ab' }}
                   title="집계조건2 를 고르면 그 값을 열로 펼칩니다">
              <input type="checkbox" checked={pivot} disabled={!sub2} onChange={(e) => setPivot(e.target.checked)} /> 가로보기
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <input type="checkbox" checked={ratio} onChange={(e) => setRatio(e.target.checked)} /> 비율표시
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <input type="checkbox" checked={codeIncl} onChange={(e) => setCodeIncl(e.target.checked)} /> 코드포함
            </label>
          </span>
        ) : mode === '내역' ? (
          <select className="ec-input" value={lineView} onChange={(e) => setLineView(e.target.value as '라인별' | '전표별' | '일별' | '월별' | '담당자별')}
                  style={{ width: 110, marginLeft: 6 }}>
            <option value="라인별">라인별</option>
            <option value="전표별">전표별</option>
            <option value="일별">일별</option>
            <option value="월별">월별</option>
            <option value="담당자별">담당자별</option>
          </select>
        ) : undefined}
        view={view} onViewChange={setView}
        subtotal={subtotal} subtotals={SUBTOTALS}
        /* [정렬/소계기준] 은 이 화면에서 집계 묶음만 정해 왔다 — 고르면 집계조건1 도 같이 따라간다(죽은 칸이 되지 않게). */
        onSubtotalChange={(v) => { setSubtotal(v as typeof SUBTOTALS[number]); setAgg1(v as AggAxis) }}
      >
        {/*
          원본 차례(2026-09-08 실측, 서른둘): 구분 · 기준일자 · 생산공장 ·
          (창고계층그룹) · <b>작업</b> · 담당자 · 작업품목 · <b>작업품목:품목구분 ·
          작업품목:품목그룹1</b> · (작업품목:품목그룹2/3 · 계층) · 생산품목 ·
          <b>생산품목:품목구분 · 생산품목:품목그룹1</b> · (…) · <b>프로젝트</b> ·
          (프로젝트그룹1/2) · <b>자원 · 수량 · 작업시간 · 적요</b> ·
          최초작성자 · (최종수정자 · 양식) · 적용양식 · 양식구분 · 정렬/소계기준 ·
          데이터 보기형식. 같은 이름이 두 벌이라 대조표에는 어디 것인지 밝혀 적는다.
        */}
        <EcCond label="생산공장" pick>
          <input className="ec-input" placeholder="공장명 일부" value={plant}
                 onChange={(e) => setPlant(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="작업" pick>
          <input className="ec-input" placeholder="공정명 일부" value={process}
                 onChange={(e) => setProcess(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체"
                           value={worker} onChange={(v) => setWorker(v)}
                           items={pickers.employees} />
        </EcCond>
        {/* 원본 조건의 [작업품목]. 그 작업이 실제로 다루는 품목 — 생산품목과 다르다. */}
        <EcCond label="작업품목" pick>
          <input className="ec-input" placeholder="작업품목명 일부" value={workItem}
                 onChange={(e) => setWorkItem(e.target.value)} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="작업품목:품목구분" pick>
          <CodePickerField label="작업품목:품목구분" hideLabel width={150} emptyLabel="전체"
                           value={workItemCategory} onChange={setWorkItemCategory}
                           items={[...new Set(rows.map((r) => r.workItemCategoryName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="작업품목:품목그룹1" pick>
          <CodePickerField label="작업품목:품목그룹1" hideLabel width={150} emptyLabel="전체"
                           value={workItemGroup} onChange={setWorkItemGroup}
                           items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="생산품목" pick>
          <CodePickerField label="생산품목" hideLabel width={200} emptyLabel="전체"
                           value={product} onChange={(v) => setProduct(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="생산품목:품목구분" pick>
          <CodePickerField label="생산품목:품목구분" hideLabel width={150} emptyLabel="전체"
                           value={productCategory} onChange={setProductCategory}
                           items={[...new Set(rows.map((r) => r.productCategoryName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="생산품목:품목그룹1" pick>
          <CodePickerField label="생산품목:품목그룹1" hideLabel width={150} emptyLabel="전체"
                           value={productGroup} onChange={setProductGroup}
                           items={mgmt.groupOptions.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond}
                           items={[...new Set(rows.map((r) => r.projectName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [자원] — BOR 이 무는 설비·인력이다. 줄에 이미 실려 온다. */}
        <EcCond label="자원" pick>
          <CodePickerField label="자원" hideLabel width={170} emptyLabel="전체"
                           value={resourceCond} onChange={setResourceCond}
                           items={[...new Set(rows.map((r) => r.resourceName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/* 원본 [수량]은 <b>양품수량</b>이다 — 불량은 따로 센다. */}
        <EcCond label="수량">
          <input className="ec-input" type="number" value={qtyFrom}
                 onChange={(e) => setQtyFrom(e.target.value)} style={{ width: 110, textAlign: 'right' }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" value={qtyTo}
                 onChange={(e) => setQtyTo(e.target.value)} style={{ width: 110, textAlign: 'right' }} />
        </EcCond>
        <EcCond label="작업시간">
          <input className="ec-input" type="number" value={timeFrom}
                 onChange={(e) => setTimeFrom(e.target.value)} style={{ width: 110, textAlign: 'right' }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" value={timeTo}
                 onChange={(e) => setTimeTo(e.target.value)} style={{ width: 110, textAlign: 'right' }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={noteCond}
                 onChange={(e) => setNoteCond(e.target.value)} style={{ width: 190 }} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={150} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="결재방표시">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        작업 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        양품 <b style={{ color: '#1c7c3c', fontSize: 14 }}>{num(totals.good)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        불량 <b style={{ color: '#c60a2e', fontSize: 14 }}>{num(totals.defect)}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        불량률 <b style={{ color: '#c60a2e', fontSize: 14 }}>{pct(totals.defect, totals.good)}%</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        표준 <b style={{ color: '#3c4553' }}>{num(time.standard)}</b>분
        <span style={{ margin: '0 2px' }}>/</span>
        실제 <b style={{ color: '#3c4553' }}>{num(time.actual)}</b>분
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        차이 <b style={{ color: time.diff < 0 ? '#c60a2e' : '#1c7c3c', fontSize: 14 }}>{gap(time.diff)}</b>
        {time.unknown > 0 && (
          <span style={{ marginLeft: 6, color: '#c07a00' }}>※ 표준 미정 {time.unknown}건 제외</span>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {mode === '집계' && prevRange && (() => {
        const prev = filterRows(prevRange.from, prevRange.to)
        const sum = (xs: WorkResult[], f: (r: WorkResult) => number) => xs.reduce((n, r) => n + f(r), 0)
        const chg = (a: number, b: number) => (b > 0 ? ` (${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%)` : '')
        const line = (label: string, f: (r: WorkResult) => number) => {
          const a = sum(prev, f); const b = sum(shown, f)
          return `${label} ${num(a)} → ${num(b)}${chg(b, a)}`
        }
        return (
          <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
            비교기간({prevRange.from.replace(/-/g, '/')} ~ {prevRange.to.replace(/-/g, '/')})
            {' '}{line('양품', (r) => r.goodQty)} · {line('불량', (r) => r.defectQty)} · {line('작업시간(분)', (r) => r.workTimeMin)}
          </div>
        )
      })()}
      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 작업내역이 없습니다." />
      ) : mode === '집계' && sub2 && pivot ? (() => {
        const cols = [...new Set(byProcess.map((g) => g.k2))].sort((a, b) => a.localeCompare(b, 'ko'))
        const rowsBy = new Map<string, Map<string, number>>()
        byProcess.forEach((g) => { const m = rowsBy.get(g.k1) ?? new Map<string, number>(); m.set(g.k2, (m.get(g.k2) ?? 0) + g.good); rowsBy.set(g.k1, m) })
        return (
          <table ref={aggRef} className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>{agg1} \ {sub2}</th>
                {cols.map((c) => <th key={c} style={{ textAlign: 'right' }}>{c}</th>)}
                <th style={{ textAlign: 'right' }}>합계</th>
              </tr>
            </thead>
            <tbody>
              {[...rowsBy.entries()].map(([k, m], i) => (
                <tr key={k}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>{k}</td>
                  {cols.map((c) => <td key={c} style={{ textAlign: 'right' }}>{m.get(c) ? num(m.get(c)!) : ''}</td>)}
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{num([...m.values()].reduce((a, v) => a + v, 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
                {cols.map((c) => <td key={c} style={{ textAlign: 'right' }}>{num(byProcess.filter((g) => g.k2 === c).reduce((a, g) => a + g.good, 0))}</td>)}
                <td style={{ textAlign: 'right' }}>{num(totals.good)}</td>
              </tr>
            </tfoot>
          </table>
        )
      })() : mode === '집계' ? (
        <table ref={aggRef} className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              {code1 && <th style={{ width: 120 }}>{code1}</th>}
              {code2 && <th style={{ width: 120 }}>{code2}</th>}
              <th>{[agg1, sub2, sub3].filter(Boolean).join(' · ')}</th>
              <th style={{ width: 90, textAlign: 'right' }}>건수</th>
              <th style={{ width: 110, textAlign: 'right' }}>양품</th>
              {ratio && <th style={{ width: 80, textAlign: 'right' }}>비율(%)</th>}
              <th style={{ width: 110, textAlign: 'right' }}>불량</th>
              <th style={{ width: 110, textAlign: 'right' }}>불량률(%)</th>
              <th style={{ width: 130, textAlign: 'right' }}>작업시간(분)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7 + (code1 ? 1 : 0) + (code2 ? 1 : 0) + (ratio ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byProcess.length === 0 ? (
              <tr><td colSpan={7 + (code1 ? 1 : 0) + (code2 ? 1 : 0) + (ratio ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byProcess.map((g, i) => (
              <tr key={g.process}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                {code1 && <td style={{ fontFamily: 'monospace' }}>{g.c1}</td>}
                {code2 && <td style={{ fontFamily: 'monospace' }}>{g.c2}</td>}
                <td>{g.process}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{num(g.good)}</td>
                {ratio && <td style={{ textAlign: 'right', color: '#5a626e' }}>{totals.good ? (Math.round((g.good / totals.good) * 1000) / 10).toFixed(1) : '0.0'}</td>}
                <td style={{ textAlign: 'right', color: g.defect > 0 ? '#c60a2e' : '#8a929c' }}>{num(g.defect)}</td>
                <td style={{ textAlign: 'right', color: g.defect > 0 ? '#c60a2e' : '#8a929c' }}>{pct(g.defect, g.good)}</td>
                <td style={{ textAlign: 'right' }}>{num(g.time)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={2 + (code1 ? 1 : 0) + (code2 ? 1 : 0)} style={{ textAlign: 'right' }}>합계 ({byProcess.length}건 묶음)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{num(totals.good)}</td>
              {ratio && <td style={{ textAlign: 'right' }}>100.0</td>}
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{num(totals.defect)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{pct(totals.defect, totals.good)}</td>
              <td style={{ textAlign: 'right' }}>{num(totals.time)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              {/*
                원본 작업내역현황은 일자와 번호를 <b>한 칸</b>에 적는다([일자-No.], 사본 실측).
                우리는 둘로 나눠 두어 원본과 차례가 어긋나 있었다 — 작업지시서조회·현황은 이미 합쳐 두었다.
              */}
              <th style={{ width: 200, textAlign: 'center' }}>일자-No.</th>
              <th style={{ width: 130 }}>생산공장명</th>
              {/* 원본 열 이름은 [작업명]이다. */}
              <th>작업명</th>
              <th style={{ width: 160 }}>생산품목명</th>
              {/* 원본 라인 열: … 작업명 · 생산품목명 · [품목명[규격]] · 수량 · 자원명 · … */}
              <th style={{ width: 160 }}>품목명[규격]</th>
              {/* 원본 [수량]. 우리는 양품·불량을 나눠 세지만 원본은 그 둘을 합한 작업량 한 칸을 둔다. */}
              <th style={{ width: 100, textAlign: 'right' }}>수량</th>
              <th style={{ width: 110 }}>담당자</th>
              <th style={{ width: 120 }}>자원명</th>
              <th style={{ width: 100, textAlign: 'right' }}>양품</th>
              <th style={{ width: 100, textAlign: 'right' }}>불량</th>
              <th style={{ width: 120, textAlign: 'right' }}>표준작업시간</th>
              <th style={{ width: 120, textAlign: 'right' }}>작업시간</th>
              <th style={{ width: 130, textAlign: 'right' }}>차이(표준-실제)</th>
              <th style={{ width: 100, textAlign: 'right' }}>불량률(%)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={15} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : listRows.length === 0 ? (
              <tr><td colSpan={15} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : listRows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>
                  {/* 원본 [일자-No.] 는 작업내역 전표 번호다(작업지시서 번호가 아니다). */}
                  {r.workDate} {r.resultNo}
                </td>
                <td style={{ color: r.warehouseName ? undefined : '#c9ced6' }}>{r.warehouseName ?? ''}</td>
                {/*
                  <b>마스터에 없는 공정</b>은 그렇다고 말해 준다. 공정명은 자유입력이라
                  '조립 ' 처럼 한 글자만 달라도 마스터에 안 걸리는데, 그러면 아래
                  [표준작업시간]이 조용히 빈다 — 왜 비었는지 화면 어디에도 없었다.
                  응답은 진작 그 연결(processId)을 들고 왔는데 <b>아무도 안 보고</b> 있었다.
                */}
                <td>
                  {r.process}
                  {r.processId == null && (
                    <span title="공정 마스터에 없는 이름이라 표준시간을 낼 수 없습니다"
                          style={{ marginLeft: 4, fontSize: 11, color: '#c07a00' }}>· 마스터 없음</span>
                  )}
                </td>
                <td>{r.productName ?? ''}</td>
                {/* 작업품목. 안 적힌 옛 자료는 비워 둔다 — 생산품목으로 채우면 두 열이 늘 같아진다. */}
                <td style={{ color: r.workItemName ? undefined : '#c9ced6' }}>
                  {r.workItemName ? `${r.workItemName}${r.workItemSpec ? `[${r.workItemSpec}]` : ''}` : '-'}
                </td>
                <td style={{ textAlign: 'right' }}>{num(r.goodQty + r.defectQty)}</td>
                <td>{r.worker ?? ''}</td>
                <td>{r.resourceName ?? ''}</td>
                <td style={{ textAlign: 'right', color: '#1c7c3c', fontWeight: 600 }}>{num(r.goodQty)}</td>
                <td style={{ textAlign: 'right', color: r.defectQty > 0 ? '#c60a2e' : '#8a929c' }}>{num(r.defectQty)}</td>
                {/*
                  표준이 빈 까닭은 둘이고 <b>고치는 방법이 다르다</b> —
                  공정이 마스터에 안 걸렸으면 <b>이름을 고쳐야</b> 하고,
                  걸렸는데 없으면 그 품목·공정의 <b>BOR 을 세워야</b> 한다.
                  '-' 만 찍어 두면 어느 쪽인지 몰라 엉뚱한 데를 뒤진다.
                */}
                <td style={{ textAlign: 'right', color: r.standardTimeMin == null ? '#c9ced6' : undefined }}
                    title={r.standardTimeMin != null ? undefined
                      : r.processId == null ? '공정이 마스터에 없습니다 — 공정명을 고치세요'
                        : '이 품목·공정의 BOR(작업소요시간)이 없습니다'}>
                  {r.standardTimeMin == null ? '-' : num(r.standardTimeMin)}
                </td>
                <td style={{ textAlign: 'right' }}>{num(r.workTimeMin)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: r.standardTimeMin == null ? '#c9ced6' : (r.standardTimeMin - r.workTimeMin) < 0 ? '#c60a2e' : '#1c7c3c' }}>
                  {r.standardTimeMin == null ? '-' : gap(r.standardTimeMin - r.workTimeMin)}
                </td>
                <td style={{ textAlign: 'right', color: r.defectQty > 0 ? '#c60a2e' : '#8a929c' }}>
                  {pct(r.defectQty, r.goodQty)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={9} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: '#1c7c3c' }}>{num(totals.good)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{num(totals.defect)}</td>
              <td style={{ textAlign: 'right' }}>{num(time.standard)}</td>
              <td style={{ textAlign: 'right' }}>{num(totals.time)}</td>
              <td style={{ textAlign: 'right', color: time.diff < 0 ? '#c60a2e' : '#1c7c3c' }}>{gap(time.diff)}</td>
              <td style={{ textAlign: 'right', color: '#c60a2e' }}>{pct(totals.defect, totals.good)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </EcListShell>
  )
}
