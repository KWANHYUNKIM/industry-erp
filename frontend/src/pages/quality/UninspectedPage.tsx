import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import type { QualityInspection, QualityInspectionRequest } from '../../types/api'
import { EcReportHead, EcReportFoot, reportDate } from '../../components/EcReportFrame'

const qty = (n: number) => n.toLocaleString('ko-KR')
/** 원본 월 소계 · 총합계 줄(2026-10-03 실측): 바탕 rgb(247,247,247) · 굵게 · 앞 세 칸을 묶어 가운데 정렬. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(247, 247, 247)' }

/**
 * 재고 I &gt; 품질관리 &gt; 품질검사요청 &gt; <b>미검사현황</b>(E040631) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 일자(영업주기, <b>하루</b> — 기본 오늘, 빠른선택 금일 … 전월 · 종료일) · 품질검사요청No. · 품목코드 · 거래처 · 창고 ·
 * 프로젝트 · 관리항목 · 미검사수량(구간). 열: 일자-No. · 담당자명 · 품목명(규격) · 수량 · 미검사수량.
 * 줄은 요청일 오름차순이고 <b>달마다</b> 'YYYY/MM 계' 줄, 맨 끝에 '총합계'.
 *
 * <p>원본은 일자 하나를 받아 회사 [영업주기]만큼 거슬러 올라간 구간을 본다(그날 머리글이 2024/10/13 ~ 2026/10/03).
 * 우리는 영업주기 설정이 없어 <b>그날까지 쌓인 미검사 전부</b>를 본다 — 밀린 요청이 영업주기 밖이라고 사라지면 안 된다.
 * <p>2026-10-04 원본 실측: 줄은 요청의 <b>품목 줄마다</b> 하나다(5/21 -3 이 MSI 10 · 인텔 20 두 행). 미검사수량 = 그 줄 수량 −
 * 그 요청으로 불러와 만든 검사(연결전표)가 같은 품목에 검사한 수량. 예전 우리는 요청 한 건을 한 행(머리 품목)으로 찍고
 * 미검사수량을 요청 수량 그대로 적었다 — 요청이 줄 · 부분 검사를 갖게 된 뒤로 틀린 값이었다.
 * 거래처 · 창고 · 관리항목은 검사요청이 들지 않는다.
 */
export default function UninspectedPage() {
  const pickers = useCondPickers(['items', 'projects'])
  const [asOf, setAsOf] = useState(ymd(new Date()))
  const [reqNo, setReqNo] = useState('')
  const [item, setItem] = useState('')
  const [project, setProject] = useState('')
  const [qtyFrom, setQtyFrom] = useState('')
  const [qtyTo, setQtyTo] = useState('')
  const [rows, setRows] = useState<QualityInspectionRequest[]>([])
  /** 요청에서 불러와 만든 검사들 — 요청 줄마다 이미 검사한 수량을 센다. */
  const [inspections, setInspections] = useState<QualityInspection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, q] = await Promise.all([
        api.get<QualityInspectionRequest[]>('/quality-inspection-requests', { params: { status: 'REQUESTED', to: asOf } }),
        api.get<QualityInspection[]>('/quality-inspections', { params: { to: asOf } }),
      ])
      setRows(r.data)
      setInspections(q.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [asOf])

  const shown = useMemo(() => rows
    .filter((r) => r.status === 'REQUESTED' && r.requestDate <= asOf)
    .filter((r) => !reqNo || r.requestNo.includes(reqNo))
    .filter((r) => !project || String(r.projectId) === project)
    .sort((a, b) => (a.requestDate < b.requestDate ? -1 : a.requestDate > b.requestDate ? 1 : a.requestNo.localeCompare(b.requestNo))),
  [rows, asOf, reqNo, project])

  /** 요청 id + 품목 → 그 요청으로 만든 검사가 그 품목에 검사한 수량(기준일까지). */
  const inspected = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of inspections) {
      if (q.requestId == null || q.inspectionDate > asOf) continue
      for (const l of q.lines) m.set(`${q.requestId}|${l.itemId}`, (m.get(`${q.requestId}|${l.itemId}`) ?? 0) + Number(l.quantity))
    }
    return m
  }, [inspections, asOf])
  /** 줄 — 요청의 품목 줄마다. 같은 품목이 두 줄이면 검사한 수량을 앞 줄부터 덜어 낸다. */
  type Line = { key: string; r: QualityInspectionRequest; itemId: number; itemName: string; spec: string | null; qty: number; open: number }
  const lines = useMemo<Line[]>(() => shown.flatMap((r) => {
    const left = new Map<number, number>()
    const src = r.lines?.length ? r.lines : [{ id: 0, itemId: r.itemId, itemName: r.itemName, spec: r.spec, quantity: Number(r.requestQty) }]
    return src.map((l) => {
      if (!left.has(l.itemId)) left.set(l.itemId, inspected.get(`${r.id}|${l.itemId}`) ?? 0)
      const used = Math.min(left.get(l.itemId)!, Number(l.quantity))
      left.set(l.itemId, left.get(l.itemId)! - used)
      return { key: `${r.id}-${l.id}`, r, itemId: l.itemId, itemName: l.itemName, spec: l.spec, qty: Number(l.quantity), open: Number(l.quantity) - used }
    })
  })
    .filter((l) => l.open > 0)
    .filter((l) => !item || String(l.itemId) === item)
    .filter((l) => qtyFrom === '' || l.open >= Number(qtyFrom))
    .filter((l) => qtyTo === '' || l.open <= Number(qtyTo)), [shown, inspected, item, qtyFrom, qtyTo])

  const months = useMemo(() => {
    const by = new Map<string, Line[]>()
    for (const l of lines) {
      const m = l.r.requestDate.slice(0, 7)
      by.set(m, [...(by.get(m) ?? []), l])
    }
    return [...by.entries()].map(([m, rs]) => ({ m, rs, sum: rs.reduce((a, l) => a + l.qty, 0), open: rs.reduce((a, l) => a + l.open, 0) }))
  }, [lines])
  const total = months.reduce((a, g) => a + g.sum, 0)
  const totalOpen = months.reduce((a, g) => a + g.open, 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '미검사현황', [months.length])

  return (
    <EcListShell
      title="미검사현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setAsOf(ymd(new Date())); setReqNo(''); setItem(''); setProject(''); setQtyFrom(''); setQtyTo('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="일자(영업주기)">
          <input type="date" className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} />
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
        <EcCond label="미검사수량">
          <input className="ec-input" inputMode="decimal" value={qtyFrom} onChange={(e) => setQtyFrom(e.target.value)} style={{ width: 90 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input className="ec-input" inputMode="decimal" value={qtyTo} onChange={(e) => setQtyTo(e.target.value)} style={{ width: 90 }} />
        </EcCond>
      </ul>

      {/* 원본 머리글은 영업주기만큼 거슬러 올라간 구간이다 — 우리는 그날까지 쌓인 전부라 끝날만 적는다. */}
      <EcReportHead title="미검사현황" period={`~ ${reportDate(asOf)}`} />
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th>담당자명</th>
            <th>품목명(규격)</th>
            <th className="text-right">수량</th>
            <th className="text-right">미검사수량</th>
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
                <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
                <td className="text-right">{qty(l.qty)}</td>
                <td className="text-right">{qty(l.open)}</td>
              </tr>
            )),
            <tr key={`sub-${g.m}`} style={SUB_ROW}>
              <td colSpan={3} className="text-center">{g.m.replace('-', '/')} 계</td>
              <td className="text-right">{qty(g.sum)}</td>
              <td className="text-right">{qty(g.open)}</td>
            </tr>,
          ])}
        </tbody>
        <tfoot>
          <tr style={SUB_ROW}>
            <td colSpan={3} className="text-center">총합계</td>
            <td className="text-right">{qty(total)}</td>
            <td className="text-right">{qty(totalOpen)}</td>
          </tr>
        </tfoot>
      </table>
      <EcReportFoot />
    </EcListShell>
  )
}
