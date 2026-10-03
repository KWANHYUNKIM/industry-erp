import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { EcReportHead, EcReportFoot, reportDate, reportPeriod } from '../../components/EcReportFrame'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { weekOfYear } from '../../utils/statusAggregate'
import type { QualityInspectionRequest } from '../../types/api'

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
 */
/** 원본 집계조건 후보 중 요청이 값을 드는 것. 라인별 · 거래처그룹 · 품목그룹2/3 · 프로젝트그룹은 두지 않는다. */
const AGG_KEYS = ['일별', '주차별', '월별', '분기별', '반기별', '연별', '담당자별', '전표별', '품목별', '품목그룹1별', '프로젝트별'] as const
type AggKey = (typeof AGG_KEYS)[number]
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
  const [agg1, setAgg1] = useState<AggKey | ''>('')
  const [agg2, setAgg2] = useState<AggKey | ''>('')
  const mgmt = useItemMgmt()
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<QualityInspectionRequest[]>('/quality-inspection-requests', { params: { from, to } })
      setRows(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const shown = useMemo(() => rows
    .filter((r) => r.requestDate >= from && r.requestDate <= to)
    .filter((r) => !reqNo || r.requestNo.includes(reqNo))
    .filter((r) => !item || String(r.itemId) === item || (r.lines ?? []).some((l) => String(l.itemId) === item))
    .filter((r) => !project || String(r.projectId) === project)
    .sort((a, b) => (a.requestDate < b.requestDate ? -1 : a.requestDate > b.requestDate ? 1 : a.requestNo.localeCompare(b.requestNo))),
  [rows, from, to, reqNo, item, project])

  /** 현황 줄 — 요청의 품목 줄마다(줄이 없는 옛 요청은 머리 품목 하나). */
  type Line = { key: string; r: QualityInspectionRequest; itemId: number; itemName: string; spec: string | null; method: string; qty: number }
  const lines = useMemo<Line[]>(() => shown.flatMap((r) => (r.lines?.length
    ? r.lines.map((l) => ({ key: `${r.id}-${l.id}`, r, itemId: l.itemId, itemName: l.itemName, spec: l.spec, method: l.methodName, qty: Number(l.quantity) }))
    : [{ key: `${r.id}`, r, itemId: r.itemId, itemName: r.itemName, spec: r.spec, method: '', qty: Number(r.requestQty) }])
    .filter((l) => !item || String(l.itemId) === item)), [shown, item])
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
  /** ○집계 — 조건1(+조건2)로 묶어 수량을 더한다. 조건1 묶음마다 '… 계'(조건이 하나여도). 처음 나온 차례. */
  const aggGroups = useMemo(() => {
    if (!agg1) return []
    const g1 = new Map<string, Map<string, number>>()
    for (const l of lines) {
      const a = axis(agg1, l), b = agg2 ? axis(agg2, l) : ''
      if (!g1.has(a)) g1.set(a, new Map())
      const m = g1.get(a)!
      m.set(b, (m.get(b) ?? 0) + l.qty)
    }
    return [...g1.entries()].map(([n1, m]) => ({ n1, rows: [...m.entries()].map(([n2, q]) => ({ n2, q })), sum: [...m.values()].reduce((x, y) => x + y, 0) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, agg1, agg2])
  const aggCols = [agg1, agg2].filter(Boolean) as AggKey[]
  const total = months.reduce((a, g) => a + g.sum, 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '품질검사요청현황', [months.length, menu, agg1, agg2, aggGroups.length])

  const method = (r: QualityInspectionRequest) =>
    !r.inspectMethod ? '' : r.samplePercent != null ? `${r.inspectMethod}(${Number(r.samplePercent)}%)` : r.inspectMethod

  return (
    <EcListShell
      title="품질검사요청현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setReqNo(''); setItem(''); setProject(''); setAgg1(''); setAgg2('') } },
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
          {menu === '현황' ? <span className="text-ec-label">라인별</span> : (
            <span className="inline-flex flex-wrap items-center gap-[6px]">
              집계조건1
              <select className="ec-input w-[120px]" value={agg1} onChange={(e) => setAgg1(e.target.value as AggKey | '')}>
                <option value=""></option>
                {AGG_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              집계조건2
              <select className="ec-input w-[120px]" value={agg2} onChange={(e) => setAgg2(e.target.value as AggKey | '')}>
                <option value=""></option>
                {AGG_KEYS.filter((k) => k !== agg1).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </span>
          )}
        </EcCond>
        <EcCond label="일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
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
          <thead><tr>
            {aggCols.map((k) => <th key={k}>{k}</th>)}
            <th className="text-right">수량</th>
          </tr></thead>
          <tbody>
            {aggGroups.length === 0 ? (
              <tr><td colSpan={aggCols.length + 1} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : aggGroups.flatMap((g) => [
              ...g.rows.map((x, i) => (
                <tr key={`${g.n1}␟${x.n2}`}>
                  <td>{i === 0 ? g.n1 : ''}</td>
                  {agg2 && <td>{x.n2}</td>}
                  <td className="text-right">{qty2(x.q)}</td>
                </tr>
              )),
              <tr key={`${g.n1}␟계`} className="ec-list-total">
                <td colSpan={aggCols.length} className="text-center font-bold">{g.n1} 계</td>
                <td className="text-right font-bold">{qty2(g.sum)}</td>
              </tr>,
            ])}
          </tbody>
          {aggGroups.length > 0 && (
            <tfoot><tr className="ec-total">
              <td colSpan={aggCols.length} className="text-center">총합계</td>
              <td className="text-right">{qty2(aggGroups.reduce((n, g) => n + g.sum, 0))}</td>
            </tr></tfoot>
          )}
        </table>
        )}
        <EcReportFoot />
      </>) : (<>
      <EcReportHead title="품질검사요청현황내역" period={reportPeriod(from, to)} />
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
        <tfoot>
          <tr style={SUB_ROW}>
            <td colSpan={4} className="text-center">총합계</td>
            <td className="text-right">{qty(total)}</td>
          </tr>
        </tfoot>
      </table>
      <EcReportFoot />
      </>)}
    </EcListShell>
  )
}
