import { useEffect, useRef, useState } from 'react'
import Modal from '../../../components/Modal'
import EcPeriodPicks, { periodOf } from '../../../components/EcPeriodPicks'
import { EcCond } from '../../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'

export interface WorkHistoryRow {
  id: number; actedAt: string; slipDate: string; slipNo: number; action: '신규' | '수정' | '삭제'
  employeeName: string; payItemName: string; quantity: number; worker: string
}
/** 원본 근무조회 이력조회 [Search(F3)] 빠른선택(2026-10-13 실측). */
const HISTORY_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일'] as const
const ACTIONS = ['신규', '수정', '삭제'] as const

const slash = (d: string) => d.replace(/-/g, '/')
const slipNo = (r: { slipDate: string; slipNo: number }) => `${slash(r.slipDate)} -${r.slipNo}`
/** '2026/10/13 오전 8:17:42' — 원본 H 창 작업일시. */
function actedAt(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 관리 &gt; 근무기록 &gt; 근무조회 오른쪽 위 <b>[이력]</b> — '근무조회 이력조회'(원본 E090105, 2026-10-13 loginaa 실측).
 *
 * <p>근무입력에서 변종호 · 야근수당 1 을 저장(신규) → 근무조회에서 2 로 고쳐 저장(수정) → 선택삭제(삭제) 하면
 * 목록은 [최종이력만 검색](기본 켬)이라 '2026/10/13 · 2026/10/13 -1 · 삭제 · 변종호 · 야근수당 · 2.00 · GUEST · H' 한 줄,
 * [H] 를 누르면 '이력' 창에 [2026/10/13 -1] 과 작업자ID · 작업일시 · 상태 세 줄(신규 → 수정 → 삭제)이 오래된 것부터 선다.
 * 조건: 작업일자(기본 금월(~오늘)) · 작업시간 · 전표일자 · 근무일자 · 사원 · 부서 · 프로젝트 · 수당항목 · 작업자 · 행위 · 기타(최종이력만 검색 · 수정순).
 * 우리는 작업일자 · 사원명 · 수당항목 · 작업자 · 행위 · 최종이력만 검색을 둔다(작업시간 · 전표/근무일자 · 부서 · 프로젝트 · 수정순은 없다).
 * 원본은 이력의 [전표번호] 를 누르면 그 전표를 보기 전용으로 여는데, 우리는 글자만 둔다.
 */
export default function WorkHistoryView() {
  const [range, setRange] = useState(periodOf('금월(~오늘)')!)
  const [shownRange, setShownRange] = useState(range)
  const [rows, setRows] = useState<WorkHistoryRow[]>([])
  const [error, setError] = useState('')
  const [empText, setEmpText] = useState('')
  const [itemText, setItemText] = useState('')
  const [workerText, setWorkerText] = useState('')
  const [actions, setActions] = useState<string[]>([...ACTIONS])
  const [lastOnly, setLastOnly] = useState(true)
  const [slipOpen, setSlipOpen] = useState<{ slipDate: string; slipNo: number } | null>(null)
  const [slipRows, setSlipRows] = useState<WorkHistoryRow[]>([])
  const tableRef = useRef<HTMLTableElement>(null)

  function load() {
    setError('')
    api.get<WorkHistoryRow[]>('/work-records/histories', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShownRange(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  const seen = new Set<string>()
  const shown = rows.filter((r) => {
    const key = `${r.slipDate}#${r.slipNo}`
    if (lastOnly) { if (seen.has(key)) return false; seen.add(key) }
    return (!empText || r.employeeName.includes(empText)) && (!itemText || r.payItemName.includes(itemText))
      && (!workerText || r.worker.includes(workerText)) && actions.includes(r.action)
  })
  useTableColumnCheck(tableRef, '근무조회 이력조회', [shown.length])

  function openSlip(r: WorkHistoryRow) {
    setSlipOpen({ slipDate: r.slipDate, slipNo: r.slipNo })
    setSlipRows([])
    api.get<WorkHistoryRow[]>(`/work-records/histories/${r.slipDate}/${r.slipNo}`).then((x) => setSlipRows(x.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  return (
    <>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="작업일자">
          <input type="date" className="ec-input w-[150px]" aria-label="작업일자 시작" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" aria-label="작업일자 끝" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="사원">
          <input className="ec-input w-full" placeholder="사원" value={empText} onChange={(e) => setEmpText(e.target.value)} />
        </EcCond>
        <EcCond label="수당항목">
          <input className="ec-input w-full" placeholder="수당항목" value={itemText} onChange={(e) => setItemText(e.target.value)} />
        </EcCond>
        <EcCond label="작업자">
          <input className="ec-input w-full" placeholder="작업자" value={workerText} onChange={(e) => setWorkerText(e.target.value)} />
        </EcCond>
        <EcCond label="행위">
          {ACTIONS.map((a) => (
            <label key={a} className="inline-flex items-center gap-[4px] mr-[10px]">
              <input type="checkbox" checked={actions.includes(a)}
                     onChange={(e) => setActions(e.target.checked ? [...actions, a] : actions.filter((x) => x !== a))} /> {a}
            </label>
          ))}
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[4px]">
            <input type="checkbox" checked={lastOnly} onChange={(e) => setLastOnly(e.target.checked)} /> 최종이력만 검색
          </label>
        </EcCond>
        <li className="flex flex-wrap items-center gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
          <EcPeriodPicks labels={HISTORY_PICKS} currentFrom={range.from} onPick={setRange} />
        </li>
      </ul>
      <div className="text-right text-ec-hint mb-[4px]">{slash(shownRange.from)} ~ {slash(shownRange.to)}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">작업일자</th>
            <th>전표번호</th>
            <th>행위</th>
            <th>사원명</th>
            <th>수당항목</th>
            <th className="text-right">근무기록</th>
            <th>작업자</th>
            <th className="text-center">이력</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">{slash(r.actedAt.slice(0, 10))}</td>
              <td>{slipNo(r)}</td>
              <td>{r.action}</td>
              <td>{r.employeeName}</td>
              <td>{r.payItemName}</td>
              <td className="text-right">{Number(r.quantity).toFixed(2)}</td>
              <td>{r.worker}</td>
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); openSlip(r) }}>H</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={slipOpen !== null} title="이력" onClose={() => setSlipOpen(null)} width={760}>
        {slipOpen && <p className="mb-[6px]">[{slipNo(slipOpen)}]</p>}
        <table className="w-full text-left">
          <thead>
            <tr><th className="w-[40px]"></th><th className="text-center">작업자ID</th><th className="text-center">작업일시</th><th className="text-center">상태</th></tr>
          </thead>
          <tbody>
            {slipRows.length === 0 ? (
              <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : slipRows.map((h, i) => (
              <tr key={h.id}>
                <td className="text-center">{i + 1}</td>
                <td className="text-center">{h.worker}</td>
                <td className="text-center">{actedAt(h.actedAt)}</td>
                <td className="text-center">{h.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-[12px]"><button type="button" className="ec-btn" onClick={() => setSlipOpen(null)}>닫기</button></div>
      </Modal>
    </>
  )
}
