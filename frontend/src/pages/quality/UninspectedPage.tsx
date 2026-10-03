import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { QualityInspectionRequest } from '../../types/api'

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
 * 미검사수량은 아직 요청(REQUESTED) 상태인 요청의 수량이다 — 우리 요청은 한 번에 검사완료로 닫혀 부분 검사가 없다.
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<QualityInspectionRequest[]>('/quality-inspection-requests', { params: { status: 'REQUESTED', to: asOf } })
      setRows(r.data)
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
    .filter((r) => !item || String(r.itemId) === item)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => qtyFrom === '' || Number(r.requestQty) >= Number(qtyFrom))
    .filter((r) => qtyTo === '' || Number(r.requestQty) <= Number(qtyTo))
    .sort((a, b) => (a.requestDate < b.requestDate ? -1 : a.requestDate > b.requestDate ? 1 : a.requestNo.localeCompare(b.requestNo))),
  [rows, asOf, reqNo, item, project, qtyFrom, qtyTo])

  const months = useMemo(() => {
    const by = new Map<string, QualityInspectionRequest[]>()
    for (const r of shown) {
      const m = r.requestDate.slice(0, 7)
      by.set(m, [...(by.get(m) ?? []), r])
    }
    return [...by.entries()].map(([m, rs]) => ({ m, rs, sum: rs.reduce((a, r) => a + Number(r.requestQty), 0) }))
  }, [shown])
  const total = months.reduce((a, g) => a + g.sum, 0)
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

      <h3 className="text-[13px] font-bold mt-[4px] mx-0 mb-[6px]">
        미검사현황 <span className="font-normal text-ec-hint">~ {dateText(asOf)}</span>
      </h3>
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
            ...g.rs.map((r) => (
              <tr key={r.id}>
                <td className="text-center">{dateNo(r.requestDate, r.requestNo)}</td>
                <td>{r.requester ?? ''}</td>
                <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
                <td className="text-right">{qty(Number(r.requestQty))}</td>
                <td className="text-right">{qty(Number(r.requestQty))}</td>
              </tr>
            )),
            <tr key={`sub-${g.m}`} style={SUB_ROW}>
              <td colSpan={3} className="text-center">{g.m.replace('-', '/')} 계</td>
              <td className="text-right">{qty(g.sum)}</td>
              <td className="text-right">{qty(g.sum)}</td>
            </tr>,
          ])}
        </tbody>
        <tfoot>
          <tr style={SUB_ROW}>
            <td colSpan={3} className="text-center">총합계</td>
            <td className="text-right">{qty(total)}</td>
            <td className="text-right">{qty(total)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
