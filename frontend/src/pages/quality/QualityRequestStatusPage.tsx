import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { QualityInspectionRequest } from '../../types/api'

const qty = (n: number) => n.toLocaleString('ko-KR')
/** 원본 월 소계 · 총합계 줄(2026-10-03 실측): 바탕 rgb(247,247,247) · 굵게 · 앞 네 칸을 묶어 가운데 정렬. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(247, 247, 247)' }

/**
 * 재고 I &gt; 품질관리 &gt; 품질검사요청 &gt; <b>품질검사요청현황</b>(E040630) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택 금일 … 전월 · 종료일) · 품질검사요청No. · 품목코드 · 거래처 · 창고 ·
 * 프로젝트 · 관리항목. 열: 일자-No. · 담당자명 · 검사방법 · 품목명(규격) · 수량.
 * 머리글 이름은 '품질검사요청현황내역'. 줄은 요청일 오름차순이고 달마다 'YYYY/MM 계', 맨 끝에 '총합계'.
 *
 * <p>미검사현황과 달리 진행상태를 가리지 않는다(검사완료 · 취소된 요청도 센다). 원본의 [집계] 탭 · [구분](라인별 하나) ·
 * [비교기간]은 내역 한 장만 세우는 이 화면에 두지 않았다. 거래처 · 창고 · 관리항목은 검사요청이 들지 않는다.
 */
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
    .filter((r) => !item || String(r.itemId) === item)
    .filter((r) => !project || String(r.projectId) === project)
    .sort((a, b) => (a.requestDate < b.requestDate ? -1 : a.requestDate > b.requestDate ? 1 : a.requestNo.localeCompare(b.requestNo))),
  [rows, from, to, reqNo, item, project])

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
  useTableColumnCheck(tableRef, '품질검사요청현황', [months.length])

  const method = (r: QualityInspectionRequest) =>
    !r.inspectMethod ? '' : r.samplePercent != null ? `${r.inspectMethod}(${Number(r.samplePercent)}%)` : r.inspectMethod

  return (
    <EcListShell
      title="품질검사요청현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setReqNo(''); setItem(''); setProject('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
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

      <h3 className="text-[13px] font-bold mt-[4px] mx-0 mb-[6px]">
        품질검사요청현황내역 <span className="font-normal text-ec-hint">{dateText(from)} ~ {dateText(to)}</span>
      </h3>
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
            ...g.rs.map((r) => (
              <tr key={r.id}>
                <td className="text-center">{dateNo(r.requestDate, r.requestNo)}</td>
                <td>{r.requester ?? ''}</td>
                <td>{method(r)}</td>
                <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
                <td className="text-right">{qty(Number(r.requestQty))}</td>
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
    </EcListShell>
  )
}
