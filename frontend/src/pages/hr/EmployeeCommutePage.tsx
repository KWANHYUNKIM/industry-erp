import { useEffect, useRef, useState, type RefObject } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster } from '../../types/api'
import { ymd } from '../../utils/periods'

interface CommuteEvent { id: number; kind: 'IN' | 'OUT'; at: string; place: string | null; outside: boolean; halfDay: boolean; reason: string | null }
interface Commute {
  id: number; workDate: string; employeeId: number; employeeCode: string; employeeName: string; department: string
  clockIn: string; clockOut: string | null; place: string | null; outside: boolean; morningHalf: boolean; reason: string | null
  afternoonHalf: boolean; reentries: number; events: CommuteEvent[]
}
type View = '월별' | '리스트'
const slash = (s: string) => s.replace(/-/g, '/')
/** 2026-10-03T20:23:33 → '2026/10/03 오후 8:23:33'(원본 글자) */
const longTime = (dt: string | null) => {
  if (!dt) return ''
  const [d, t] = dt.split('T'); const [h, m, s] = t.split(':').map((x) => Number(x.slice(0, 2)))
  return `${slash(d)} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`
}
/** 2026-10-13T09:07:00 → '오전 9:07'(원본 창 오른쪽 이력 글자) */
const hm = (dt: string) => { const t = dt.split('T')[1]; const [h, m] = t.split(':').map(Number); return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}` }
const nowLocal = () => { const d = new Date(); return `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/**
 * 관리 &gt; 근태관리 &gt; 출/퇴근(사원) &gt; <b>출/퇴근기록부(사원)</b> (원본 E020726).
 *
 * <p>2026-10-03 loginaa 에서 넣고 지워 본 그대로:
 * <ul>
 *   <li>[월별] 달력(이전 · 오늘 · 다음, 2026/10) — 기록이 있는 날에 '1(1 + 0)'(모두(내근 + 외근)). [리스트] 오늘 하루 —
 *       일자 · 사원명 · 소속부서 · 출근시간(2026/10/03 오후 8:23:33) · 퇴근시간 · 내/외근. 버튼 신규(F2) · 선택삭제 · Excel.</li>
 *   <li>[신규(F2)] '출/퇴근기록부' 창: 큰 시계, 사원(코드도움) · 장소(사무실, □외근) · 시간(지금) · □오전반차설정 · 사유, [출근].
 *       2026-10-13 실측: 그날 이미 출근한 사원으로 다시 [출근]을 누르면 '출근시간이 입력되어 있습니다. / 해당 일자를 클릭하여
 *       퇴근시간을 입력바랍니다.' 로 막는다. 퇴근은 [리스트]에서 그 [일자]를 눌러 연 창의 [퇴근] — 사원은 막혀 있고 외근 칸이 없으며,
 *       오른쪽에 '▸ [출근 10/13 오전 9:07]  2026/10/13 오전 9:07' 이력이 선다. 퇴근 뒤 다시 열면 이력 두 줄과 [출근].
 *       외근으로 출근하면 달력 '1(0 + 1)'(내근 + 외근).</li>
 *   <li>2026-10-13 2차 실측: 달력 날짜 칸을 누르면 그 날짜 · 지금 시각으로 [출근] 창, 'n(내근 + 외근)'(풍선 '근무자(내근+외근)')을
 *       누르면 그날 '출/퇴근기록부(사원)' 목록 창(입력 후 [Enter] · Search(F3) · 2026/10/12 ~2026/10/12 · 같은 격자 ·
 *       신규(F2) · 선택삭제 · Excel · 닫기). 퇴근 창은 외근 칸 없이 □오후반차설정. 퇴근 뒤 다시 열면 [출근] — 다시 출근하면
 *       줄은 그대로 하나이고 퇴근시간 옆에 '+1'. 오른쪽 이력 줄을 펼치면 장소 · 시간 · 반차 · 사유 [저장], 퇴근 줄은 [삭제]
 *       (확인 없이 지우고 목록 창으로). 이력의 [H](변경이력)는 없다.</li>
 *   <li>선택삭제 '선택한 사원의 근무기록을 삭제하겠습니까?'.</li>
 * </ul>
 * 그룹웨어 출/퇴근기록부(ID)는 로그인 계정 단위, 이 화면은 사원 단위라 따로 담는다. 외부시스템과 ERP연동 · 웹자료올리기는 없다.
 */
export default function EmployeeCommutePage() {
  const [view, setView] = useState<View>('월별')
  const [month, setMonth] = useState(() => ymd(new Date()).slice(0, 7))
  const [day, setDay] = useState(() => ymd(new Date()))
  const [rows, setRows] = useState<Commute[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ employeeId: '', place: '사무실', outside: false, at: nowLocal(), half: false, reason: '' })
  /** [일자]로 연 기록 — 있으면 마지막 이력이 출근일 때 퇴근 창, 퇴근일 때 다시 출근 창 */
  const [record, setRecord] = useState<Commute | null>(null)
  /** 달력 'n(내근 + 외근)'을 눌러 띄운 그날 목록 창(원본 '출/퇴근기록부(사원)' 창) */
  const [dayList, setDayList] = useState<string | null>(null)
  const [dayRows, setDayRows] = useState<Commute[]>([])
  const [dayQuery, setDayQuery] = useState('')
  const [dayChecked, setDayChecked] = useState<Set<number>>(new Set())
  /** 기록 창을 그날 목록 창에서 열었으면 닫을 때 목록 창으로 돌아간다 */
  const [backToDay, setBackToDay] = useState<string | null>(null)
  /** 창 오른쪽 이력에서 펼친 줄 */
  const [openEvent, setOpenEvent] = useState<number | null>(null)
  const [eventForm, setEventForm] = useState({ at: '', place: '', outside: false, half: false, reason: '' })
  const tableRef = useRef<HTMLTableElement>(null)

  const [y, m] = month.split('-').map(Number)
  const monthFrom = `${month}-01`
  const monthTo = ymd(new Date(y, m, 0))

  function load() {
    setError('')
    const [from, to] = view === '월별' ? [monthFrom, monthTo] : [day, day]
    api.get<Commute[]>('/hr/employee-commutes', { params: { from, to } }).then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  function loadDay(date: string) {
    api.get<Commute[]>('/hr/employee-commutes', { params: { from: date, to: date } }).then((r) => setDayRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [view, month, day])
  useEffect(() => {
    api.get<EmployeeMaster[]>('/employees').then((r) => setEmployees(r.data)).catch(() => setEmployees([]))
  }, [])
  useTableColumnCheck(tableRef, '출/퇴근기록부(사원)', [rows.length, view])

  const last = record?.events[record.events.length - 1]
  const out = record !== null && last?.kind === 'IN'
  /** [신규(F2)] · 달력 날짜 칸 — 날짜 칸을 누르면 그 날짜 · 지금 시각으로 연다(원본 2026-10-13 실측) */
  function openNew(date?: string) {
    const now = nowLocal()
    setRecord(null); setBackToDay(null); setOpenEvent(null)
    setForm({ employeeId: '', place: '사무실', outside: false, at: date ? `${date}T${now.slice(11)}` : now, half: false, reason: '' })
    setFormError(''); setOpen(true)
  }
  function openRecord(r: Commute, fromDay: string | null) {
    setRecord(r); setBackToDay(fromDay); setOpenEvent(null)
    if (fromDay) setDayList(null)
    setForm({ employeeId: String(r.employeeId), place: r.place ?? '사무실', outside: false, at: `${r.workDate}T${nowLocal().slice(11)}`, half: false, reason: '' })
    setFormError('')
    setOpen(true)
  }
  function closeRecord() {
    setOpen(false)
    if (backToDay) { setDayList(backToDay); loadDay(backToDay) }
  }
  async function clock() {
    if (!form.employeeId) { setFormError('사원을 입력 바랍니다.'); return }
    try {
      await api.post('/hr/employee-commutes/clock', {
        employeeId: Number(form.employeeId), at: `${form.at}:00`, place: form.place, outside: !out && form.outside,
        morningHalf: !out && form.half, afternoonHalf: out && form.half, reason: form.reason || null, out,
      })
      closeRecord()
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }
  function toggleEvent(ev: CommuteEvent) {
    if (openEvent === ev.id) { setOpenEvent(null); return }
    setOpenEvent(ev.id)
    setEventForm({ at: ev.at.slice(0, 16), place: ev.place ?? '', outside: ev.outside, half: ev.halfDay, reason: ev.reason ?? '' })
  }
  async function saveEvent(ev: CommuteEvent) {
    try {
      const r = await api.put<Commute>(`/hr/employee-commutes/events/${ev.id}`, {
        at: `${eventForm.at}:00`, place: eventForm.place, outside: eventForm.outside, halfDay: eventForm.half, reason: eventForm.reason || null,
      })
      setRecord(r.data); setOpenEvent(null); setFormError(''); load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }
  /** 원본: 퇴근 이력의 [삭제]는 확인 창 없이 지우고 창을 닫는다 */
  async function deleteEvent(ev: CommuteEvent) {
    try {
      await api.delete(`/hr/employee-commutes/events/${ev.id}`)
      closeRecord(); load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function deleteIds(ids: Set<number>) {
    if (ids.size === 0 || !window.confirm('선택한 사원의 근무기록을 삭제하겠습니까?')) return false
    try {
      for (const id of ids) await api.delete(`/hr/employee-commutes/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    return true
  }
  async function deleteChecked() {
    if (await deleteIds(checked)) { setChecked(new Set()); load() }
  }
  async function deleteDayChecked() {
    if (dayList && await deleteIds(dayChecked)) { setDayChecked(new Set()); loadDay(dayList); load() }
  }
  function openDay(date: string) {
    setDayQuery(''); setDayChecked(new Set()); setDayRows([])
    setDayList(date); loadDay(date)
  }

  const shiftMonth = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(ymd(d).slice(0, 7)) }
  const first = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const cells = [...Array.from({ length: first }, () => 0), ...Array.from({ length: days }, (_, i) => i + 1)]
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) => cells.slice(w * 7, w * 7 + 7))
  const q = dayQuery.trim()
  const dayShown = q ? dayRows.filter((r) => r.employeeName.includes(q) || r.employeeCode.includes(q) || r.department.includes(q)) : dayRows

  return (
    <EcListShell
      title="출/퇴근기록부(사원)"
      searchable={false}
      onNew={() => openNew()}
      actions={view === '리스트' ? [{ label: '선택삭제', onClick: deleteChecked, disabled: checked.size === 0 }, { label: 'Excel' }] : []}
    >
      <div className="text-center font-bold text-[18px] mb-[8px]">출/퇴근기록부(사원)</div>
      <div className="ec-pills mb-[8px]">
        {(['월별', '리스트'] as const).map((v) => (
          <button key={v} type="button" className={`ec-pill${view === v ? ' active' : ''}`} onClick={() => setView(v)}>{v}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {view === '월별' ? (
        <>
          <div className="flex items-center justify-between mb-[6px]">
            <div className="flex gap-[4px]">
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => shiftMonth(-1)}>&lt; 이전</button>
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => setMonth(ymd(new Date()).slice(0, 7))}>오늘</button>
              <button type="button" className="ec-btn ec-btn-sm" onClick={() => shiftMonth(1)}>다음 &gt;</button>
            </div>
            <span>{month.replace('-', '/')}</span>
          </div>
          <table ref={tableRef} className="w-full table-fixed">
            <thead><tr>{['일', '월', '화', '수', '목', '금', '토'].map((d) => <th key={d} className="text-center">{d}</th>)}</tr></thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={i}>
                  {w.concat(Array.from({ length: 7 - w.length }, () => 0)).map((d, j) => {
                    const date = d ? `${month}-${String(d).padStart(2, '0')}` : ''
                    const list = rows.filter((r) => r.workDate === date)
                    const outside = list.filter((r) => r.outside).length
                    return (
                      <td key={j} data-date={date || undefined} className={`align-top h-[70px] ${d ? 'cursor-pointer' : 'bg-ec-disabled'}`}
                          onClick={d ? () => openNew(date) : undefined}>
                        {d ? <div className="text-right">{d}</div> : null}
                        {list.length > 0 && (
                          <a href="#" title="근무자(내근+외근)" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDay(date) }}>
                            {list.length}({list.length - outside} + {outside})
                          </a>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div className="flex items-center justify-end gap-[6px] mb-[6px]">
            <input type="date" className="ec-input w-[150px]" value={day} onChange={(e) => setDay(e.target.value)} />
            <span className="text-ec-hint">{slash(day)} ~{slash(day)}</span>
          </div>
          <CommuteTable tableRef={tableRef} rows={rows} checked={checked} setChecked={setChecked} onOpen={(r) => openRecord(r, null)} />
        </>
      )}

      <Modal error={error} open={dayList !== null} title="출/퇴근기록부(사원)" width={780} onClose={() => setDayList(null)}>
        <div className="flex items-center justify-between mb-[6px]">
          <b>출/퇴근기록부(사원)</b>
          <span className="flex gap-[4px]">
            <input className="ec-input w-[110px]" placeholder="입력 후 [Enter]" value={dayQuery} aria-label="그날 목록 검색"
                   onChange={(e) => setDayQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && dayList) loadDay(dayList) }} />
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => dayList && loadDay(dayList)}>Search(F3)</button>
          </span>
        </div>
        {dayList && <div className="text-right mb-[4px]">{slash(dayList)} ~{slash(dayList)}</div>}
        <CommuteTable rows={dayShown} checked={dayChecked} setChecked={setDayChecked} onOpen={(r) => openRecord(r, dayList)} />
        <div className="flex gap-[6px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => { setDayList(null); openNew(dayList ?? undefined) }}>신규(F2)</button>
          <button type="button" className="ec-btn" disabled={dayChecked.size === 0} onClick={deleteDayChecked}>선택삭제</button>
          <button type="button" className="ec-btn">Excel</button>
          <button type="button" className="ec-btn" onClick={() => setDayList(null)}>닫기</button>
        </div>
      </Modal>

      <Modal error={formError} open={open} title="출/퇴근기록부" width={760} onClose={closeRecord}>
        <div className="text-center font-bold text-[32px] text-ec-blue mb-[8px]">{longTime(`${form.at}:00`).split(' ').slice(1).join(' ')}</div>
        <div className="flex gap-[10px] mobile:flex-col">
        <ul className="ec-form flex-1">
          <li className="wide">
            <span className="title">사원</span>
            <div className="form">
              {record ? (
                <span className="flex gap-[6px]">
                  <input className="ec-input w-[120px]" aria-label="사원코드" value={record.employeeCode} disabled />
                  <input className="ec-input flex-1" aria-label="사원명" value={record.employeeName} disabled />
                </span>
              ) : (
                <CodePickerField label="사원" hideLabel fill placeholder="사원" emptyLabel="선택 해제"
                                 value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })}
                                 items={employees.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              )}
            </div>
          </li>
          <li className="wide">
            <span className="title">장소</span>
            <div className="form flex items-center gap-[8px]">
              <input className="ec-input flex-1" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} />
              {!out && (
                <label className="inline-flex items-center gap-[4px]">
                  <input type="checkbox" checked={form.outside} onChange={(e) => setForm({ ...form, outside: e.target.checked })} /> 외근
                </label>
              )}
            </div>
          </li>
          <li className="wide">
            <span className="title">시간</span>
            <div className="form">
              <input type="datetime-local" className="ec-input w-[220px]" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />
              <label className="flex items-center gap-[4px] mt-[4px]">
                <input type="checkbox" checked={form.half} onChange={(e) => setForm({ ...form, half: e.target.checked })} /> {out ? '오후반차설정' : '오전반차설정'}
              </label>
            </div>
          </li>
          <li className="wide">
            <span className="title">사유</span>
            <div className="form"><input className="ec-input w-full" placeholder="사유" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </li>
        </ul>
        <ul className="w-[300px] mobile:w-full" aria-label="출퇴근 이력">
          {record?.events.map((ev) => {
            const k = ev.kind === 'IN' ? '출근' : '퇴근'
            const opened = openEvent === ev.id
            return (
              <li key={ev.id} className="rounded-ec bg-ec-disabled px-[8px] py-[6px] mb-[4px]">
                <a href="#" className="flex justify-between gap-[6px]" onClick={(e) => { e.preventDefault(); toggleEvent(ev) }}>
                  <span>{opened ? '▾' : '▸'} [{k} {slash(ev.at.slice(5, 10))} {hm(ev.at)}]</span>
                  <span>{slash(ev.at.slice(0, 10))} {hm(ev.at)}</span>
                </a>
                {opened && (
                  <div className="ec-form mt-[6px]">
                    <label className="flex items-center gap-[6px] mb-[4px]">
                      <span className="w-[50px]">장소</span>
                      <input className="ec-input flex-1" aria-label="이력 장소" value={eventForm.place} onChange={(e) => setEventForm({ ...eventForm, place: e.target.value })} />
                      {ev.kind === 'OUT' ? (
                        <span className="inline-flex items-center gap-[4px]">
                          <input type="checkbox" checked={eventForm.half} onChange={(e) => setEventForm({ ...eventForm, half: e.target.checked })} /> 오후반차설정
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-[4px]">
                          <input type="checkbox" checked={eventForm.outside} onChange={(e) => setEventForm({ ...eventForm, outside: e.target.checked })} /> 외근
                        </span>
                      )}
                    </label>
                    <label className="flex items-center gap-[6px] mb-[4px]">
                      <span className="w-[50px]">{ev.kind === 'OUT' ? '퇴근' : '시간'}</span>
                      <input type="datetime-local" className="ec-input flex-1" aria-label="이력 시간" value={eventForm.at} onChange={(e) => setEventForm({ ...eventForm, at: e.target.value })} />
                    </label>
                    {ev.kind === 'IN' && (
                      <label className="flex items-center gap-[4px] mb-[4px] ml-[56px]">
                        <input type="checkbox" checked={eventForm.half} onChange={(e) => setEventForm({ ...eventForm, half: e.target.checked })} /> 오전반차설정
                      </label>
                    )}
                    <label className="flex items-center gap-[6px] mb-[6px]">
                      <span className="w-[50px]">사유</span>
                      <input className="ec-input flex-1" placeholder="사유" aria-label="이력 사유" value={eventForm.reason} onChange={(e) => setEventForm({ ...eventForm, reason: e.target.value })} />
                    </label>
                    <div className="flex gap-[4px]">
                      <button type="button" className="ec-btn ec-btn-primary ec-btn-sm" onClick={() => saveEvent(ev)}>저장</button>
                      {ev.kind === 'OUT' && <button type="button" className="ec-btn ec-btn-sm" onClick={() => deleteEvent(ev)}>삭제</button>}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        </div>
        <div className="flex gap-[6px] mt-[12px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={clock}>{out ? '퇴근' : '출근'}</button>
          <button type="button" className="ec-btn" onClick={closeRecord}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}

/** 리스트 · 그날 목록 창 격자 — 일자 · 사원명 · 소속부서 · 출근시간 · 퇴근시간(다시 출근했으면 '+1') · 내/외근 */
function CommuteTable({ rows, checked, setChecked, onOpen, tableRef }: {
  rows: Commute[]; checked: Set<number>; setChecked: (s: Set<number>) => void; onOpen: (r: Commute) => void
  tableRef?: RefObject<HTMLTableElement | null>
}) {
  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.id))
  return (
    <table ref={tableRef} className="w-full text-left">
      <thead>
        <tr>
          <th className="w-[34px] text-center">
            <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} />
          </th>
          <th className="text-center">일자</th>
          <th>사원명</th>
          <th>소속부서</th>
          <th>출근시간</th>
          <th>퇴근시간</th>
          <th className="text-center">내/외근</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        ) : rows.map((r) => (
          <tr key={r.id}>
            <td className="text-center">
              <input type="checkbox" checked={checked.has(r.id)}
                     onChange={() => { const n = new Set(checked); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setChecked(n) }} />
            </td>
            <td className="text-center">
              <a href="#" onClick={(e) => { e.preventDefault(); onOpen(r) }}>{slash(r.workDate)}</a>
            </td>
            <td>{r.employeeName}</td>
            <td>{r.department}</td>
            <td>{longTime(r.clockIn)}</td>
            <td>
              {longTime(r.clockOut)}
              {r.reentries > 0 && (
                <span className="inline-block ml-[2px] px-[4px] rounded-ec-pill bg-ec-line-focus text-ec-panel" title="다시 출근">+{r.reentries}</span>
              )}
            </td>
            <td className="text-center">{r.outside ? '외근' : '내근'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
