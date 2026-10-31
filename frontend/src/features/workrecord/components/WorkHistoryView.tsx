import { useEffect, useRef, useState } from 'react'
import Modal from '../../../components/Modal'
import EcPeriodPicks from '../../../components/EcPeriodPicks'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/CodePickerField'
import { periodOf, pad2 } from '../../../utils/periods'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import { timeText } from '../../../utils/displayPrefs'
import { useDisplayPrefs } from '../../preference/displayPrefsStore'
import EcDateInput, { EcDateRange } from '../../../components/ui/EcDateInput'

export interface WorkHistoryLine {
  workDate: string; employeeId: number; employeeCode: string; employeeName: string; departmentId: number | null; departmentName: string | null
  payItemId: number; payItemName: string; unit: string; quantity: number
}
export interface WorkHistoryRow {
  id: number; actedAt: string; slipDate: string; slipNo: number; action: '신규' | '수정' | '삭제'
  employeeName: string; payItemName: string; quantity: number; worker: string; lines: WorkHistoryLine[]
}
/** 원본 [전표일자] · [근무일자] 고르기(2026-10-13 실측) — 직접입력이면 아래에 일자 칸 둘. */
const DATE_MODES = ['사용안함', '직접입력', '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월'] as const
type DateMode = typeof DATE_MODES[number]
interface DateCond { mode: DateMode; from: string; to: string }
const NO_DATE: DateCond = { mode: '사용안함', from: '', to: '' }
/** 고른 꼴로 구간을 낸다 — 사용안함이면 null */
function rangeOf(c: DateCond): { from: string; to: string } | null {
  if (c.mode === '사용안함') return null
  if (c.mode === '직접입력') return { from: c.from, to: c.to }
  return periodOf(c.mode)
}
/** 원본 근무조회 이력조회 [Search(F3)] 빠른선택(2026-10-13 실측). */
const HISTORY_PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일'] as const
const ACTIONS = ['신규', '수정', '삭제'] as const

const slash = (d: string) => d.replace(/-/g, '/')
const slipNo = (r: { slipDate: string; slipNo: number }) => `${slash(r.slipDate)} -${r.slipNo}`
/** '2026/10/13 오전 8:17:42' — 원본 H 창 작업일시. 시각은 기본값설정 12/24시간제를 따른다. */
function actedAt(iso: string, clock24: boolean) {
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${timeText(d, clock24, true)}`
}

/**
 * 관리 &gt; 근무기록 &gt; 근무조회 오른쪽 위 <b>[이력]</b> — '근무조회 이력조회'(원본 E090105, 2026-10-13 loginaa 실측).
 *
 * <p>근무입력에서 변종호 · 야근수당 1 을 저장(신규) → 근무조회에서 2 로 고쳐 저장(수정) → 선택삭제(삭제) 하면
 * 목록은 [최종이력만 검색](기본 켬)이라 '2026/10/13 · 2026/10/13 -1 · 삭제 · 변종호 · 야근수당 · 2.00 · GUEST · H' 한 줄,
 * [H] 를 누르면 '이력' 창에 [2026/10/13 -1] 과 작업자ID · 작업일시 · 상태 세 줄(신규 → 수정 → 삭제)이 오래된 것부터 선다.
 * 조건: 작업일자(기본 금월(~오늘)) · 작업시간 · 전표일자 · 근무일자 · 사원 · 부서 · 프로젝트 · 수당항목 · 작업자 · 행위 · 기타(최종이력만 검색 · 수정순).
 * 2026-10-13 2차 실측: 작업시간 □사용(켜면 시 · 분 ~ 시 · 분), 전표일자 · 근무일자 고르기(사용안함 · 직접입력 · 금일 · 전일 ·
 * 금주(~오늘) · 전주 · 금월(~오늘) · 전월, 직접입력이면 일자 칸 둘), 부서 ▾(부서계층그룹) · 프로젝트 ▾. [최종이력만 검색]을 끄면
 * 한 전표의 신규 · 수정 · 삭제 세 줄이 서는데 셋 다 마지막 값(2.00)이다 — 줄 값은 그 전표의 최종 이력을 보인다.
 * [전표번호]는 링크 — 지운 전표도 그때의 근무입력 창(일자 막힘 · 근무일자 · 사원 · 수당항목 · 단위 · 근무기록 · 합계,
 * 닫기 · 삭제취소 · H)으로 연다. 우리는 보기 전용(닫기 · H)이다.
 * 없는 것: 부서계층그룹 · 프로젝트(근무 전표 줄에 프로젝트가 없다) · 수정순(한 전표뿐이라 순서 차이를 못 쟀다) · 삭제취소.
 */
export default function WorkHistoryView() {
  const { clock24 } = useDisplayPrefs()
  const [range, setRange] = useState(periodOf('금월(~오늘)')!)
  const [shownRange, setShownRange] = useState(range)
  const [rows, setRows] = useState<WorkHistoryRow[]>([])
  const [error, setError] = useState('')
  const [empText, setEmpText] = useState('')
  const [itemText, setItemText] = useState('')
  const [workerText, setWorkerText] = useState('')
  const [actions, setActions] = useState<string[]>([...ACTIONS])
  const [lastOnly, setLastOnly] = useState(true)
  const [useTime, setUseTime] = useState(false)
  const [timeFrom, setTimeFrom] = useState('00:00')
  const [timeTo, setTimeTo] = useState('23:59')
  const [slipCond, setSlipCond] = useState<DateCond>(NO_DATE)
  const [workCond, setWorkCond] = useState<DateCond>(NO_DATE)
  const [deptId, setDeptId] = useState('')
  const [depts, setDepts] = useState<{ id: number; code: string; name: string }[]>([])
  /** [전표번호]로 연 그때의 근무입력 창 */
  const [view, setView] = useState<WorkHistoryRow | null>(null)
  const [slipOpen, setSlipOpen] = useState<{ slipDate: string; slipNo: number } | null>(null)
  const [slipRows, setSlipRows] = useState<WorkHistoryRow[]>([])
  const tableRef = useRef<HTMLTableElement>(null)

  function load() {
    setError('')
    api.get<WorkHistoryRow[]>('/work-records/histories', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShownRange(range) }).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    api.get<typeof depts>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }, [])

  const seen = new Set<string>()
  /** 원본: 줄 값(사원 · 수당항목 · 근무기록)은 그 전표의 마지막 이력 값 — rows 는 최신순이라 처음 만난 것 */
  const latest = new Map<string, WorkHistoryRow>()
  for (const r of rows) { const k = `${r.slipDate}#${r.slipNo}`; if (!latest.has(k)) latest.set(k, r) }
  const slipRange = rangeOf(slipCond)
  const workRange = rangeOf(workCond)
  const shown = rows.filter((r) => {
    const key = `${r.slipDate}#${r.slipNo}`
    if (lastOnly) { if (seen.has(key)) return false; seen.add(key) }
    const hm = r.actedAt.slice(11, 16)
    return (!empText || r.employeeName.includes(empText)) && (!itemText || r.payItemName.includes(itemText))
      && (!workerText || r.worker.includes(workerText)) && actions.includes(r.action)
      && (!useTime || (hm >= timeFrom && hm <= timeTo))
      && (!slipRange || (r.slipDate >= slipRange.from && r.slipDate <= slipRange.to))
      && (!workRange || r.lines.some((l) => l.workDate >= workRange.from && l.workDate <= workRange.to))
      && (!deptId || r.lines.some((l) => String(l.departmentId) === deptId))
  }).map((r) => {
    const last = latest.get(`${r.slipDate}#${r.slipNo}`)!
    return { ...r, employeeName: last.employeeName, payItemName: last.payItemName, quantity: last.quantity }
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
          <EcDateRange from={{ className: "ec-input w-[150px]", 'aria-label': "작업일자 시작", value: range.from, onChange: (e) => setRange({ ...range, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", 'aria-label': "작업일자 끝", value: range.to, onChange: (e) => setRange({ ...range, to: e.target.value }) }} />
        </EcCond>
        <EcCond label="작업시간">
          {useTime && (
            <span className="inline-flex items-center gap-[4px] mr-[8px]">
              <input type="time" className="ec-input w-[110px]" aria-label="작업시간 시작" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
              ~
              <input type="time" className="ec-input w-[110px]" aria-label="작업시간 끝" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
            </span>
          )}
          <label className="inline-flex items-center gap-[4px]">
            <input type="checkbox" checked={useTime} onChange={(e) => setUseTime(e.target.checked)} /> 사용
          </label>
        </EcCond>
        <DateCondField label="전표일자" value={slipCond} onChange={setSlipCond} />
        <DateCondField label="근무일자" value={workCond} onChange={setWorkCond} />
        <EcCond label="사원">
          <input className="ec-input w-full" placeholder="사원" value={empText} onChange={(e) => setEmpText(e.target.value)} />
        </EcCond>
        <EcCond label="부서">
          <CodePickerField label="부서" hideLabel fill placeholder="부서" value={deptId} onChange={(v) => setDeptId(v)}
                           items={depts.map((d) => ({ value: String(d.id), code: d.code, name: d.name }))} />
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
              <td><a href="#" onClick={(e) => { e.preventDefault(); setView(r) }}>{slipNo(r)}</a></td>
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
      <Modal open={view !== null} title="근무입력" onClose={() => setView(null)} width={900}>
        {view && (
          <>
            <ul className="ec-form mb-[8px]">
              <li className="wide">
                <span className="title">일자</span>
                <div className="form flex items-center gap-[4px]">
                  <EcDateInput className="ec-input w-[150px]" aria-label="일자" value={view.slipDate} disabled /> -{view.slipNo}
                </div>
              </li>
            </ul>
            <table className="w-full text-left" aria-label="그때의 근무입력">
              <thead>
                <tr><th className="w-[34px]"></th><th className="text-center">근무일자</th><th>사원</th><th>수당항목</th><th>단위</th><th className="text-right">근무기록</th></tr>
              </thead>
              <tbody>
                {view.lines.length === 0 ? (
                  <tr><td colSpan={6} className="ec-empty">이 이력에는 줄이 남아 있지 않습니다.</td></tr>
                ) : view.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="text-center">{i + 1}</td>
                    <td className="text-center">{slash(l.workDate)}</td>
                    <td>{l.employeeName}</td>
                    <td>{l.payItemName}</td>
                    <td>{l.unit}</td>
                    <td className="text-right">{Number(l.quantity).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td colSpan={5}></td>
                  <td className="text-right">{view.lines.reduce((a, l) => a + Number(l.quantity), 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex gap-[6px] mt-[12px]">
              <button type="button" className="ec-btn" onClick={() => setView(null)}>닫기</button>
              <button type="button" className="ec-btn" onClick={() => { const v = view; setView(null); openSlip(v) }}>H</button>
            </div>
          </>
        )}
      </Modal>
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
                <td className="text-center">{actedAt(h.actedAt, clock24)}</td>
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

/** 전표일자 · 근무일자 조건 — 고르기 + 직접입력이면 일자 칸 둘 */
function DateCondField({ label, value, onChange }: { label: string; value: DateCond; onChange: (v: DateCond) => void }) {
  return (
    <EcCond label={label}>
      <select className="ec-input w-full" aria-label={label} value={value.mode}
              onChange={(e) => {
                const mode = e.target.value as DateMode
                const r = periodOf('금월(~오늘)')!
                onChange(mode === '직접입력' && !value.from ? { mode, from: r.from, to: r.to } : { ...value, mode })
              }}>
        {DATE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      {value.mode === '직접입력' && (
        <span className="flex items-center gap-[4px] mt-[4px]">
          <EcDateRange from={{ className: "ec-input w-[150px]", 'aria-label': `${label} 시작`, value: value.from, onChange: (e) => onChange({ ...value, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", 'aria-label': `${label} 끝`, value: value.to, onChange: (e) => onChange({ ...value, to: e.target.value }) }} />
        </span>
      )}
    </EcCond>
  )
}
