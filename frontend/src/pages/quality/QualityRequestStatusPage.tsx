import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { EcReportHead, EcReportFoot, reportDate, reportPeriod } from '../../components/EcReportFrame'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { weekOfYear } from '../../utils/statusAggregate'
import { COMPARE_PERIODS, comparePeriodOf, fetchWindow, type ComparePeriod } from '../../utils/periods'
import type { QualityInspectionRequest } from '../../types/api'
import { ecAlert } from '../../components/EcDialog'
import { EcDateRange } from '../../components/ui/EcDateInput'

const qty = (n: number) => n.toLocaleString('ko-KR')
/** 집계 판의 수량은 소수 둘째 자리까지(원본 '1.00'). */
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 원본 월 소계 · 총합계 줄(2026-10-03 실측): 바탕 rgb(247,247,247) · 굵게 · 앞 네 칸을 묶어 가운데 정렬. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(247, 247, 247)' }

/**
 * 재고 I &gt; 품질관리 &gt; 품질검사요청 &gt; <b>품질검사요청현황</b>(E040630) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택 금일 … 전월 · 종료일) · 품질검사요청No. · 품목코드 · 거래처 · 창고 ·
 * 프로젝트 · 관리항목. 열: 일자-No. · 담당자명 · 검사방법 · 품목명(규격) · 수량.
 * 머리글 이름은 '품질검사요청현황내역'. 줄은 요청일 오름차순이고 달마다 'YYYY/MM 계', 맨 끝에 '총합계'.
 *
 * <p>미검사현황과 달리 진행상태를 가리지 않는다(검사완료 · 취소된 요청도 센다). 거래처 · 창고 · 관리항목은 검사요청이 들지 않는다.
 *
 * <p>2026-10-04 원본 [메뉴] ○집계 실측 — [구분] 자리에 [집계조건1] · [집계조건2](조건1 을 고르면 [집계조건3] 이 열린다) ·
 * [비교기간], 적용양식 '현황_집계(인쇄용)'. 집계조건 창: 일별 · 주차별 · 월별 · 분기별 · 반기별 · 연별 · 담당자별 · 전표별 ·
 * 품목별 · 라인별 · 품목그룹1~3별 · 거래처그룹1 · 2별 · 프로젝트(그룹)별. 품목별로 고르면 머리글 '<b>품질검사요청현황집계</b>',
 * 열 [품목별 | 수량], 줄 '멸충대장골드 1.00' 다음 '<b>멸충대장골드 계</b> 1.00'(조건이 하나여도 묶음마다 계), 끝에 '총합계', 꼬리 [P.1].
 * 현황 줄은 요청의 <b>품목 줄마다</b> 하나다(요청이 줄을 들게 된 2026-10-04 부터).
 *
 * <p>2026-10-13 집계조건 3~5 실측(담당자별 · 품목별 · 월별, 2024/01/01 ~ 2026/10/13): 조건 칸은 채운 수 + 2 개(최대 5).
 * 줄 [정재원 | 인텔 코어 I7-3770K | 2026/05 | 20.00] 다음에 '2026/05 계'(이름 칸 셋을 묶음) — <b>마지막 조건까지 무리마다</b> 계,
 * 깊은 것부터('2026/09 계' → '인텔 코어 I7-3770K 계' → … → '정재원 계' → '총합계'). 이름은 줄마다 다 적는다.
 * 자료가 없으면 머리가 [집계기준항목 | 수량].
 *
 * <p>2026-10-13 원본 [비교기간](사용안함 · 전년 · 전월 · 전주 · 전일동일기간, 현황 · 집계 둘 다) 실측 — 표가 <b>옆으로 두 벌</b>이 된다.
 * 머리 첫 줄에 두 구간('2026/10/01 ~ 2026/10/31' | '2026/09/01 ~ 2026/09/30'), 줄은 <b>같은 것끼리 한 줄</b>에 선다:
 * 현황은 같은 요청 품목 줄(10/01~31 vs 전주 9/24~10/24 에서 10/20 -1 줄이 양쪽에 나란히), 집계는 같은 집계 이름.
 * 한쪽에만 있으면 다른 쪽은 빈칸이고, 월 계 이름은 지금 구간 쪽에서 온다 — 비교 구간에만 있는 9월 묶음은 '<b>[] 계</b>'.
 * 비교 쪽 [검사방법] 은 지금 구간에 같은 줄이 있을 때만 찍힌다(9월 줄은 빈칸 — 원본 그대로). 비교 쪽 계 · 합계 줄은 이름 칸이 비고 수량만.
 * 머리글의 기간은 지금 구간 하나다.
 */
/** 원본 집계조건 후보 중 요청이 값을 드는 것. 라인별 · 거래처그룹 · 품목그룹2/3 · 프로젝트그룹은 두지 않는다. */
const AGG_KEYS = ['일별', '주차별', '월별', '분기별', '반기별', '연별', '담당자별', '전표별', '품목별', '품목그룹1별', '프로젝트별'] as const
type AggKey = (typeof AGG_KEYS)[number]
/** 집계조건 칸은 다섯까지 — 채운 수 + 2 칸이 열린다(2026-10-13 실측: 처음 1 · 2, 1 을 고르면 3, 3 을 고르면 4 · 5). */
const MAX_AGG = 5
/** 기준일자 축의 굵기 — 뒤 조건이 앞 조건보다 굵으면 막는다(품질검사현황 · 이 화면 같은 집계조건 창). */
const DATE_RANK: Partial<Record<AggKey, number>> = { 연별: 0, 반기별: 1, 분기별: 2, 월별: 3, 주차별: 4, 일별: 5 }
const DATE_ORDER_MSG = '집계조건은 연별-반기별-분기별-월별-주차별-일별 순서로만 입력가능합니다.'
export default function QualityRequestStatusPage() {
  const pickers = useCondPickers(['items', 'projects'])
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [reqNo, setReqNo] = useState('')
  const [item, setItem] = useState('')
  const [project, setProject] = useState('')
  const [rows, setRows] = useState<QualityInspectionRequest[]>([])
  const [loading, setLoading] = useState(true)
  /** 원본 [메뉴] — ◉현황 ○집계. */
  const [menu, setMenu] = useState<'현황' | '집계'>('현황')
  /** 집계조건1 ~ 5 — 빈 칸에서 끊는다. */
  const [aggs, setAggs] = useState<(AggKey | '')[]>(['', '', '', '', ''])
  /*
   * 집계조건 칸 옆 두 단추(2026-10-13 원본 E040630 실측) — [정렬](btn-asc ↔ btn-desc) · [소계](btn-add-sum ↔ btn-unadd-sum).
   * 처음은 올림 · 소계 표시. 월별을 내림으로 바꾸면 2026/09 → 2026/05, 월별 소계를 끄면 '2026/05 계' 줄이 없어진다
   * (품목별 계 · 총합계는 그대로). 칸을 고른 뒤에만 단추가 선다.
   */
  const [descs, setDescs] = useState<boolean[]>([false, false, false, false, false])
  const [subs, setSubs] = useState<boolean[]>([true, true, true, true, true])
  const aggCols = useMemo(() => {
    const out: AggKey[] = []
    for (const k of aggs) { if (!k) break; out.push(k) }
    return out
  }, [aggs])
  const agg1 = aggCols[0] ?? ''
  function setAgg(i: number, k: AggKey | '') {
    const prevDates = aggs.slice(0, i).filter((x): x is AggKey => !!x && DATE_RANK[x] != null)
    if (k && DATE_RANK[k] != null && prevDates.some((d) => (DATE_RANK[d] ?? 0) > (DATE_RANK[k] ?? 0))) {
      void ecAlert(DATE_ORDER_MSG)
      return
    }
    setAggs(aggs.map((x, j) => (j === i ? k : x)))
    setDescs(descs.map((x, j) => (j === i ? false : x)))
    setSubs(subs.map((x, j) => (j === i ? true : x)))
  }
  const mgmt = useItemMgmt()
  const [error, setError] = useState('')
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')
  const cmp = comparePeriodOf(from, to, compare)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<QualityInspectionRequest[]>('/quality-inspection-requests', { params: fetchWindow(from, to, compare) })
      setRows(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, compare])

  const inRange = (d: string, f: string, t: string) => d >= f && d <= t
  const matched = useMemo(() => rows
    .filter((r) => !reqNo || r.requestNo.includes(reqNo))
    .filter((r) => !item || String(r.itemId) === item || (r.lines ?? []).some((l) => String(l.itemId) === item))
    .filter((r) => !project || String(r.projectId) === project)
    .sort((a, b) => (a.requestDate < b.requestDate ? -1 : a.requestDate > b.requestDate ? 1 : a.requestNo.localeCompare(b.requestNo))),
  [rows, reqNo, item, project])
  const shown = useMemo(() => matched.filter((r) => inRange(r.requestDate, from, to)), [matched, from, to])

  /** 현황 줄 — 요청의 품목 줄마다(줄이 없는 옛 요청은 머리 품목 하나). */
  type Line = { key: string; r: QualityInspectionRequest; itemId: number; itemCode: string; itemName: string; spec: string | null; method: string; qty: number }
  const toLines = (rs: QualityInspectionRequest[]): Line[] => rs.flatMap((r) => (r.lines?.length
    ? r.lines.map((l) => ({ key: `${r.id}-${l.id}`, r, itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, spec: l.spec, method: l.methodName, qty: Number(l.quantity) }))
    : [{ key: `${r.id}`, r, itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, spec: r.spec, method: '', qty: Number(r.requestQty) }])
    .filter((l) => !item || String(l.itemId) === item))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo<Line[]>(() => toLines(shown), [shown, item])
  /** [비교기간] 쪽 줄 — 같은 조건, 옮긴 구간. */
  const cmpLines = useMemo<Line[]>(() => (cmp ? toLines(matched.filter((r) => inRange(r.requestDate, cmp.from, cmp.to))) : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [matched, item, cmp?.from, cmp?.to])
  /** 비교 표 — 같은 요청 품목 줄끼리 한 줄, 일자-No. 차례, 달마다 묶음. 월 계 이름은 지금 구간 쪽(없으면 '[]'). */
  const pairMonths = useMemo(() => {
    const by = new Map<string, { cur?: Line; prev?: Line }>()
    for (const l of lines) by.set(l.key, { ...by.get(l.key), cur: l })
    for (const l of cmpLines) by.set(l.key, { ...by.get(l.key), prev: l })
    const pairs = [...by.values()].map((p) => ({ ...p, r: (p.cur ?? p.prev)!.r }))
      .sort((a, b) => (a.r.requestDate < b.r.requestDate ? -1 : a.r.requestDate > b.r.requestDate ? 1 : a.r.requestNo.localeCompare(b.r.requestNo)))
    const months = new Map<string, typeof pairs>()
    for (const p of pairs) {
      const m = p.r.requestDate.slice(0, 7)
      months.set(m, [...(months.get(m) ?? []), p])
    }
    return [...months.entries()].map(([m, ps]) => ({
      m, ps, hasCur: ps.some((p) => p.cur), hasPrev: ps.some((p) => p.prev),
      cur: ps.reduce((a, p) => a + (p.cur?.qty ?? 0), 0), prev: ps.reduce((a, p) => a + (p.prev?.qty ?? 0), 0),
    }))
  }, [lines, cmpLines])
  const months = useMemo(() => {
    const by = new Map<string, Line[]>()
    for (const l of lines) {
      const m = l.r.requestDate.slice(0, 7)
      by.set(m, [...(by.get(m) ?? []), l])
    }
    return [...by.entries()].map(([m, rs]) => ({ m, rs, sum: rs.reduce((a, l) => a + l.qty, 0) }))
  }, [lines])

  /** ○집계 축 하나의 이름. */
  const axis = (k: AggKey, l: Line): string => {
    const d = l.r.requestDate, y = d.slice(0, 4), mo = Number(d.slice(5, 7))
    switch (k) {
      case '일별': return reportDate(d)
      case '주차별': return `${y}년 ${weekOfYear(d)}주`
      case '월별': return reportDate(d).slice(0, 7)
      case '분기별': return `${y} ${Math.floor((mo - 1) / 3) + 1}분기`
      case '반기별': return `${y} ${mo <= 6 ? '상' : '하'}반기`
      case '연별': return y
      case '담당자별': return l.r.requester ?? ''
      case '전표별': return dateNo(d, l.r.requestNo)
      case '품목별': return l.itemName + (l.spec ? ` [${l.spec}]` : '')
      case '품목그룹1별': return mgmt.groupOf(l.itemId) ?? ''
      case '프로젝트별': return l.r.projectName ?? ''
    }
  }
  /**
   * 축의 정렬 값 — 기준일자 축은 시간순, 품목별은 <b>품목코드순</b>(원본 2026-10-13: 같은 달 안에서 인텔 코어 A002 가
   * MSI A004 앞 — 이름순이면 MSI 가 앞선다), 전표별은 일자-No., 나머지는 이름순.
   */
  const ordOf = (k: AggKey, l: Line): string => {
    const d = l.r.requestDate
    switch (k) {
      case '일별': case '월별': case '분기별': case '반기별': case '연별': return d
      case '주차별': return `${d.slice(0, 4)}${String(weekOfYear(d)).padStart(2, '0')}`
      case '전표별': return `${d}␟${l.r.requestNo}`
      case '품목별': return l.itemCode
      default: return axis(k, l)
    }
  }
  /**
   * ○집계 — 고른 조건들로 묶어 수량을 더한다. 2026-10-13 원본 실측(담당자별 · 품목별 · 월별):
   * 줄마다 이름을 모두 적고, <b>모든 조건 차례마다</b> 끝난 무리의 '… 계'를 깊은 것부터 단다 —
   * [정재원 | 인텔… | 2026/05 | 20.00] → '2026/05 계' … '2026/09 계' → '인텔… 계' → … → '정재원 계' → '총합계'.
   * (조건이 하나여도 묶음마다 계 — 2026-10-04 품목별 실측과 같은 규칙.) 차례는 처음 나온 차례(요청일 · 번호 순).
   * [비교기간] 이면 같은 이름끼리 한 줄 — 지금 구간(q) | 비교 구간(p). 한쪽에만 있으면 다른 쪽은 빈칸.
   */
  const aggRows = useMemo(() => {
    if (!aggCols.length) return []
    const m = new Map<string, { ns: string[]; q: number | null; p: number | null; ord: string[] }>()
    const add = (l: Line, side: 'q' | 'p') => {
      const ns = aggCols.map((k) => axis(k, l))
      /* 무리의 정렬 값은 그 무리에서 처음 본 줄의 것(같은 이름이면 같은 값). */
      const ord = aggCols.map((k) => ordOf(k, l))
      const key = ns.join('␟')
      const v = m.get(key) ?? { ns, q: null, p: null, ord }
      v[side] = (v[side] ?? 0) + l.qty
      m.set(key, v)
    }
    for (const l of lines) add(l, 'q')
    for (const l of cmpLines) add(l, 'p')
    return [...m.values()].sort((a, b) => {
      for (let j = 0; j < aggCols.length; j++) {
        /* 기준일자 축은 이름(달 · 분기 …)으로 묶이므로 이름으로 견준다 — 같은 달 안의 날짜가 차례를 흔들지 않게. */
        const x = DATE_RANK[aggCols[j]] != null && aggCols[j] !== '주차별' ? a.ns[j] : a.ord[j]
        const y = DATE_RANK[aggCols[j]] != null && aggCols[j] !== '주차별' ? b.ns[j] : b.ord[j]
        if (a.ns[j] === b.ns[j]) continue
        const c = x < y ? -1 : x > y ? 1 : a.ns[j].localeCompare(b.ns[j], 'ko')
        return descs[j] ? -c : c
      }
      return 0
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, cmpLines, aggCols, descs])
  const total = months.reduce((a, g) => a + g.sum, 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '품질검사요청현황', [months.length, menu, aggCols.join(','), aggRows.length, compare])

  const method = (r: QualityInspectionRequest) =>
    !r.inspectMethod ? '' : r.samplePercent != null ? `${r.inspectMethod}(${Number(r.samplePercent)}%)` : r.inspectMethod

  return (
    <EcListShell
      title="품질검사요청현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setReqNo(''); setItem(''); setProject(''); setAggs(['', '', '', '', '']); setCompare('사용안함') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 첫 줄 [메뉴] ◉현황 ○집계, 집계면 [구분] 자리에 집계조건. */}
        <EcCond label="메뉴">
          <span className="inline-flex items-center gap-[8px]">
            {(['현황', '집계'] as const).map((m) => (
              <label key={m} className="inline-flex items-center gap-[3px]">
                <input type="radio" name="qrs-menu" checked={menu === m} onChange={() => setMenu(m)} /> {m}
              </label>
            ))}
          </span>
        </EcCond>
        <EcCond label="구분">
          <div>
          {menu === '현황' ? <span className="text-ec-label">라인별</span> : (
            <span className="inline-flex flex-wrap items-center gap-[6px]">
              {Array.from({ length: Math.min(MAX_AGG, aggCols.length + 2) }, (_, i) => (
                <span key={i} className="contents">
                  집계조건{i + 1}
                  <select className="ec-input w-[120px]" aria-label={`집계조건${i + 1}`} value={aggs[i]} onChange={(e) => setAgg(i, e.target.value as AggKey | '')}>
                    <option value=""></option>
                    {AGG_KEYS.filter((k) => k === aggs[i] || !aggs.includes(k)).map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  {aggs[i] && (
                    <span className="ec-btn-group">
                      <button type="button" className="ec-btn ec-btn-sm" aria-label={`집계조건${i + 1} 정렬`} title={descs[i] ? '내림차순' : '올림차순'}
                              onClick={() => setDescs(descs.map((x, j) => (j === i ? !x : x)))}>{descs[i] ? '↑↓' : '↓↑'}</button>
                      <button type="button" className="ec-btn ec-btn-sm" aria-label={`집계조건${i + 1} 소계`} aria-pressed={subs[i]}
                              title={subs[i] ? '소계 표시' : '소계 표시안함'}
                              onClick={() => setSubs(subs.map((x, j) => (j === i ? !x : x)))}>{subs[i] ? '∑' : '−'}</button>
                    </span>
                  )}
                </span>
              ))}
            </span>
          )}
          {/* 원본 [구분] 아래 줄 [비교기간] — 현황 · 집계 둘 다(2026-10-13 실측). */}
          <div className="mt-[4px] inline-flex flex-wrap items-center gap-[8px]">
            <span className="text-ec-label">비교기간</span>
            {COMPARE_PERIODS.map((k) => (
              <label key={k} className="inline-flex items-center gap-[3px]">
                <input type="radio" name="qrs-compare" checked={compare === k} onChange={() => setCompare(k)} /> {k}
              </label>
            ))}
          </div>
          </div>
        </EcCond>
        <EcCond label="일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="품질검사요청No.">
          <input className="ec-input" value={reqNo} onChange={(e) => setReqNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={200} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
      </ul>

      {menu === '집계' ? (<>
        <EcReportHead title="품질검사요청현황집계" period={reportPeriod(from, to)} />
        {!agg1 ? (
          <p className="ec-alert ec-alert-danger">집계조건은 1개 이상 선택해야 합니다.</p>
        ) : (
        <table ref={tableRef} className="w-full text-left">
          <thead>
            {cmp && aggRows.length > 0 && (
              <tr>
                <th colSpan={aggCols.length + 1} className="text-center">{reportPeriod(from, to)}</th>
                <th colSpan={aggCols.length + 1} className="text-center">{reportPeriod(cmp.from, cmp.to)}</th>
              </tr>
            )}
            {aggRows.length === 0 ? (
              /* 원본: 자료가 없으면 조건 이름 대신 [집계기준항목 | 수량](2026-10-13 실측). */
              <tr><th>집계기준항목</th><th className="text-right">수량</th></tr>
            ) : (
              <tr>
                {aggCols.map((k) => <th key={k}>{k}</th>)}
                <th className="text-right">수량</th>
                {cmp && aggCols.map((k) => <th key={`p-${k}`}>{k}</th>)}
                {cmp && <th className="text-right">수량</th>}
              </tr>
            )}
          </thead>
          <tbody>
            {aggRows.length === 0 ? (
              <tr><td colSpan={2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : aggRows.flatMap((x, i) => {
              const next = aggRows[i + 1]
              /* 다음 줄과 처음 갈리는 조건 차례 — 그 차례부터 깊은 쪽 무리가 끝났다. */
              let nd = 0
              while (next && nd < aggCols.length && next.ns[nd] === x.ns[nd]) nd++
              const out = [
                <tr key={x.ns.join('␟')}>
                  {aggCols.map((k, j) => <td key={k}>{x.q == null ? '' : x.ns[j]}</td>)}
                  <td className="text-right">{x.q != null ? qty2(x.q) : ''}</td>
                  {cmp && aggCols.map((k, j) => <td key={`p-${k}`}>{x.p == null ? '' : x.ns[j]}</td>)}
                  {cmp && <td className="text-right">{x.p != null ? qty2(x.p) : ''}</td>}
                </tr>,
              ]
              for (let L = aggCols.length - 1; L >= 0; L--) {
                if (next && nd > L) continue
                if (!subs[L]) continue
                const pre = x.ns.slice(0, L + 1).join('␟')
                const grp = aggRows.filter((y) => y.ns.slice(0, L + 1).join('␟') === pre)
                const sumOf = (vs: (number | null)[]) => (vs.some((v) => v != null) ? vs.reduce<number>((n, v) => n + (v ?? 0), 0) : null)
                const q = sumOf(grp.map((y) => y.q)), p = sumOf(grp.map((y) => y.p))
                out.push(
                  <tr key={`${pre}␟계${L}`} className="ec-list-total">
                    {/* 이름이 빈 무리(담당자 없는 요청) · 비교 구간에만 있는 무리는 '[] 계'(2026-10-12 · 13 실측). */}
                    <td colSpan={aggCols.length} className="text-center font-bold">{(q != null && x.ns[L]) || '[]'} 계</td>
                    <td className="text-right font-bold">{q != null ? qty2(q) : ''}</td>
                    {cmp && <td colSpan={aggCols.length}></td>}
                    {cmp && <td className="text-right font-bold">{p != null ? qty2(p) : ''}</td>}
                  </tr>,
                )
              }
              return out
            })}
          </tbody>
          {aggRows.length > 0 && (
            <tfoot><tr className="ec-total">
              <td colSpan={aggCols.length} className="text-center">총합계</td>
              <td className="text-right">{qty2(aggRows.reduce((n, x) => n + (x.q ?? 0), 0))}</td>
              {cmp && <td colSpan={aggCols.length}></td>}
              {cmp && <td className="text-right">{qty2(aggRows.reduce((n, x) => n + (x.p ?? 0), 0))}</td>}
            </tr></tfoot>
          )}
        </table>
        )}
        <EcReportFoot />
      </>) : (<>
      {/* 원본(2026-10-14): 자료가 없으면 머리글(제목 · 회사명 · 기간)과 [총합계] 줄 없이 '등록된 데이터가 없습니다.' 한 줄. */}
      {(cmp || months.length > 0) && <EcReportHead title="품질검사요청현황내역" period={reportPeriod(from, to)} />}
      {cmp ? (
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th colSpan={5} className="text-center">{reportPeriod(from, to)}</th>
            <th colSpan={5} className="text-center">{reportPeriod(cmp.from, cmp.to)}</th>
          </tr>
          <tr>
            {[0, 1].flatMap((n) => [
              <th key={`${n}a`} className="text-center">일자-No.</th>, <th key={`${n}b`}>담당자명</th>, <th key={`${n}c`}>검사방법</th>,
              <th key={`${n}d`}>품목명(규격)</th>, <th key={`${n}e`} className="text-right">수량</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : pairMonths.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : pairMonths.flatMap((g) => [
            ...g.ps.map((p) => (
              <tr key={(p.cur ?? p.prev)!.key}>
                <td className="text-center">{p.cur ? dateNo(p.cur.r.requestDate, p.cur.r.requestNo) : ''}</td>
                <td>{p.cur ? p.cur.r.requester ?? '' : ''}</td>
                <td>{p.cur ? p.cur.method || method(p.cur.r) : ''}</td>
                <td>{p.cur ? `${p.cur.itemName}${p.cur.spec ? ` [${p.cur.spec}]` : ''}` : ''}</td>
                <td className="text-right">{p.cur ? qty(p.cur.qty) : ''}</td>
                <td className="text-center">{p.prev ? dateNo(p.prev.r.requestDate, p.prev.r.requestNo) : ''}</td>
                <td>{p.prev ? p.prev.r.requester ?? '' : ''}</td>
                {/* 원본: 비교 쪽 검사방법은 지금 구간에 같은 줄이 있을 때만 찍힌다. */}
                <td>{p.prev && p.cur ? p.prev.method || method(p.prev.r) : ''}</td>
                <td>{p.prev ? `${p.prev.itemName}${p.prev.spec ? ` [${p.prev.spec}]` : ''}` : ''}</td>
                <td className="text-right">{p.prev ? qty(p.prev.qty) : ''}</td>
              </tr>
            )),
            <tr key={`sub-${g.m}`} className="ec-list-total [&>td]:font-bold">
              <td colSpan={4} className="text-center">{g.hasCur ? g.m.replace('-', '/') : '[]'} 계</td>
              <td className="text-right">{g.hasCur ? qty(g.cur) : ''}</td>
              <td colSpan={4}></td>
              <td className="text-right">{g.hasPrev ? qty(g.prev) : ''}</td>
            </tr>,
          ])}
        </tbody>
        <tfoot>
          <tr className="ec-list-total [&>td]:font-bold">
            <td colSpan={4} className="text-center">총합계</td>
            <td className="text-right">{qty(pairMonths.reduce((n, g) => n + g.cur, 0))}</td>
            <td colSpan={4}></td>
            <td className="text-right">{qty(pairMonths.reduce((n, g) => n + g.prev, 0))}</td>
          </tr>
        </tfoot>
      </table>
      ) : (
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th>담당자명</th>
            <th>검사방법</th>
            <th>품목명(규격)</th>
            <th className="text-right">수량</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="ec-empty">불러오는 중…</td></tr>
          ) : months.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : months.flatMap((g) => [
            ...g.rs.map((l) => (
              <tr key={l.key}>
                <td className="text-center">{dateNo(l.r.requestDate, l.r.requestNo)}</td>
                <td>{l.r.requester ?? ''}</td>
                <td>{l.method || method(l.r)}</td>
                <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
                <td className="text-right">{qty(l.qty)}</td>
              </tr>
            )),
            <tr key={`sub-${g.m}`} style={SUB_ROW}>
              <td colSpan={4} className="text-center">{g.m.replace('-', '/')} 계</td>
              <td className="text-right">{qty(g.sum)}</td>
            </tr>,
          ])}
        </tbody>
        {months.length > 0 && (
        <tfoot>
          <tr style={SUB_ROW}>
            <td colSpan={4} className="text-center">총합계</td>
            <td className="text-right">{qty(total)}</td>
          </tr>
        </tfoot>
        )}
      </table>
      )}
      <EcReportFoot />
      </>)}
    </EcListShell>
  )
}
