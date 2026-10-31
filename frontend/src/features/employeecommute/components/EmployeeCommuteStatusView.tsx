import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import EcPeriodPicks, { INQUIRY_PICKS } from '../../../components/EcPeriodPicks'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../../api/client'
import EcSortSubtotalModal, { emptySortSubtotal, showsItem, withSubtotals, type SortSubtotal } from '../../../components/EcSortSubtotalModal'
import { ecAlert } from '../../../components/EcDialog'
import { isHoliday, koreanDateTime, monthToToday, slashDate, type EmployeeCommuteLine } from '../types'
import { EcDateRange } from '../../../components/ui/EcDateInput'

type Tri = 'all' | 'a' | 'b'
/** 정렬/소계기준 창(2026-10-22 출/퇴근현황 실측): 기준 없음 · 일자 · 사원명, 처음은 셋 다 없음 · 합계 표시. 소계/합계 표시항목은 근무시간(시간단위). */
const SORT_KEYS = ['일자', '사원명']
const ITEM_COLS = ['근무시간(시간단위)']
const DEFAULT_SORT: SortSubtotal = { ...emptySortSubtotal(), total: true }

/**
 * 출/퇴근현황(사원) · 지각현황(사원) 이 같이 쓰는 몸통 — 조건 판(기간 금월(~오늘) · 사원명 · 부서 · 내/외근구분 · 업무일/휴일구분 ·
 * 재직구분) · 빠른선택(금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일) · 결과 머리(회사명 · 기간) · 격자.
 * 열만 다르다. 사원명 · 부서는 여러 개 고르는 코드도움. 2026-10-22 실측: 조건 판 위 탭 [기본][전체](같은 칸) · 출/퇴근현황만 [정렬/소계기준] 설정(일자 · 사원명, 합계 표시) ·
 * 아래 줄 [양식 기본(수정불가)] · 빠른선택 끝 [설정](권한없음 창). 지각현황은 정렬/소계기준이 없다.
 * 2026-10-20 실측: 조건 판은 펼쳐서 시작하고 판 안 [검색(F8)] 을 누르면 접히며 머리에 Search(F3), 줄 끝에 [다시 작성].
 * 원본은 [검색(F8)] 전에는 결과 머리 · 격자가 없다(plans/관리.md 출/퇴근현황 · 지각현황 남은 것 — 우리는 열자마자 금월을 찾아 뒀다).
 * 2026-10-04 실측 처음 값: 출/퇴근현황은 내/외근 [내근] · 재직구분 [재직자], 지각현황은 [전체] · [재직자].
 * 출/퇴근현황만 [기타] 모든날짜검색(처음 꺼짐) — 켜면 기간의 날마다 줄을 두고 기록이 없는 날은 일자만 찍는다. 끝에 합계 줄.
 */
export default function EmployeeCommuteStatusView({ title, lateOnly }: { title: string; lateOnly: boolean }) {
  const [range, setRange] = useState(monthToToday())
  const [shown, setShown] = useState(range)
  const [empCond, setEmpCond] = useState<string[]>([])
  const [deptCond, setDeptCond] = useState<string[]>([])
  const [empList, setEmpList] = useState<{ id: number; code: string; name: string; department: string }[]>([])
  const [deptList, setDeptList] = useState<{ code?: string | null; name: string }[]>([])
  useEffect(() => {
    api.get<typeof empList>('/employees/all').then((r) => setEmpList(r.data)).catch(() => setEmpList([]))
    api.get<typeof deptList>('/departments').then((r) => setDeptList(r.data)).catch(() => setDeptList([]))
  }, [])
  const [place, setPlace] = useState<Tri>(lateOnly ? 'all' : 'a')
  const [dayKind, setDayKind] = useState<Tri>('all')
  const [employment, setEmployment] = useState<Tri>('a')
  const [allDates, setAllDates] = useState(false)
  /** 원본 조건 판 위 탭 [기본] [전체] — 두 탭 모두 같은 칸(2026-10-22 실측). */
  const [condTab, setCondTab] = useState<'기본' | '전체'>('기본')
  const [sortCfg, setSortCfg] = useState<SortSubtotal>(DEFAULT_SORT)
  const [sortOpen, setSortOpen] = useState(false)
  const [rows, setRows] = useState<EmployeeCommuteLine[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  function search() {
    setError('')
    api.get<EmployeeCommuteLine[]>('/hr/employee-commutes', { params: { from: range.from, to: range.to } })
      .then((r) => { setRows(r.data); setShown(range); setSearched(true) }).catch((e) => setError(extractErrorMessage(e)))
  }
  function reset() {
    setRange(monthToToday()); setEmpCond([]); setDeptCond([])
    setPlace(lateOnly ? 'all' : 'a'); setDayKind('all'); setEmployment('a'); setAllDates(false); setSortCfg(DEFAULT_SORT)
  }

  const list = rows.filter((r) => (!lateOnly || r.late)
    && (empCond.length === 0 || empCond.includes(String(r.employeeId)))
    && (deptCond.length === 0 || deptCond.includes(r.department))
    && (place === 'all' || (place === 'b') === r.outside)
    && (dayKind === 'all' || (dayKind === 'b') === isHoliday(r.workDate))
    && (employment === 'all' || (employment === 'a') === r.employeeActive))
  /** 모든날짜검색 — 기간의 날마다, 그날 기록이 없으면 빈 줄(null). */
  const lines: (EmployeeCommuteLine | { blank: string })[] = !allDates || lateOnly ? list : eachDay(shown.from, shown.to).flatMap((d): (EmployeeCommuteLine | { blank: string })[] => {
    const day = list.filter((r) => r.workDate === d)
    return day.length ? day : [{ blank: d }]
  })
  const sortVal = (r: EmployeeCommuteLine, k: string) => (k === '일자' ? r.workDate : r.employeeName)
  const sortLbl = (r: EmployeeCommuteLine, k: string) => (k === '일자' ? slashDate(r.workDate) : r.employeeName)
  const subtotalRows = !lateOnly && !allDates ? withSubtotals(list, sortCfg, sortVal, sortLbl) : null
  const mins = (ls: EmployeeCommuteLine[]) => ls.reduce((n, r) => n + (r.workMinutes ?? 0), 0)
  const totalMinutes = list.reduce((n, r) => n + (r.workMinutes ?? 0), 0)
  useTableColumnCheck(tableRef, title, [lines.length])

  const radios = (name: string, value: Tri, set: (v: Tri) => void, labels: [string, string, string]) => (
    <>
      {(['all', 'a', 'b'] as const).map((v, i) => (
        <label key={v} className="inline-flex items-center gap-[4px] mr-[10px]">
          <input type="radio" name={name} checked={value === v} onChange={() => set(v)} /> {labels[i]}
        </label>
      ))}
    </>
  )

  return (
    <EcListShell title={title} searchable={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      <ul className="ec-cond mb-[8px]">
        <li className="full">
          <div className="flex border-0 border-b border-solid border-ec-line" role="tablist" aria-label="조건 탭">
            {(['기본', '전체'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={condTab === t} onClick={() => setCondTab(t)}
                      className={`no-ec bg-transparent border-0 border-b-[1.5px] border-solid cursor-pointer text-[12px] py-[9.9px] px-[11.7px] ${condTab === t ? 'border-ec-blue text-ec-blue font-bold' : 'border-transparent'}`}>{t}</button>
            ))}
          </div>
        </li>
        <EcCond label="기간">
          <EcDateRange from={{ className: "ec-input w-[150px]", value: range.from, onChange: (e) => setRange({ ...range, from: e.target.value }) }} to={{ className: "ec-input w-[150px]", value: range.to, onChange: (e) => setRange({ ...range, to: e.target.value }) }} />
        </EcCond>
        <EcCond label="사원명">
          <CodePickerField label="사원명" hideLabel fill multiple placeholder="사원명" values={empCond} onChangeMulti={(v) => setEmpCond(v)}
                           items={empList.map((e) => ({ value: String(e.id), code: e.code, name: e.name, sub: e.department }))} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill multiple placeholder="부서" values={deptCond} onChangeMulti={(v) => setDeptCond(v)}
                           items={deptList.map((d) => ({ value: d.name, code: d.code ?? undefined, name: d.name }))} />
        </EcCond>
        <EcCond label="내/외근구분">{radios(`${title}-place`, place, setPlace, ['전체', '내근', '외근'])}</EcCond>
        <EcCond label="업무일/휴일구분">{radios(`${title}-day`, dayKind, setDayKind, ['전체', '업무일', '휴일'])}</EcCond>
        <EcCond label="재직구분">{radios(`${title}-emp`, employment, setEmployment, ['전체', '재직자', '퇴사자'])}</EcCond>
        {!lateOnly && (
          <EcCond label="기타">
            <label className="inline-flex items-center gap-[4px]">
              <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} /> 모든날짜검색
            </label>
          </EcCond>
        )}
        {!lateOnly && (
          <EcCond label="정렬/소계기준">
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => setSortOpen(true)}>설정</button>
          </EcCond>
        )}
        {/* 원본 판 아래 줄 [검색(F8)] 빠른선택 … [다시 작성] — 누르면 판이 접히고 머리에 Search(F3) (2026-10-20 실측) */}
        <li className="flex flex-wrap items-center gap-[6px]">
          <select className="ec-input w-auto" aria-label="양식" defaultValue="기본(수정불가)"><option>기본(수정불가)</option></select>
          <button type="button" className="ec-btn ec-btn-primary" onClick={search}>검색(F8)</button>
          <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={range.from} onPick={setRange} />
          {/* 빠른선택 끝 [설정] 은 원본도 '권한없음' 창(2026-10-22 실측 — (출/퇴근(사원)) 업무 권한이 없습니다) */}
          <button type="button" className="ec-btn" onClick={() => void ecAlert('권한없음\n(출/퇴근(사원)) 업무 권한이 없습니다.\n서비스를 이용하려면 회사 마스터에게 문의 바랍니다.')}>설정</button>
          <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
        </li>
      </ul>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {searched && <>
      <div className="text-center font-bold mb-[2px]">{title}</div>
      <div className="text-ec-hint mb-[4px]">{slashDate(shown.from)} ~ {slashDate(shown.to)}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          {lateOnly ? (
            <tr><th className="text-center">일자</th><th>사원명</th><th>출근시간</th><th>출근입력시간</th><th>출근적요</th></tr>
          ) : (
            <tr><th className="text-center">일자</th><th>사원명</th><th>출근시간</th><th>퇴근시간</th><th className="text-right">근무시간(시간단위)</th></tr>
          )}
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : subtotalRows ? subtotalRows.map((o) => (o.kind === 'row' ? (
            <tr key={o.row.id}>
              <td className="text-center">{slashDate(o.row.workDate)}</td>
              <td>{o.row.employeeName}</td>
              <td>{koreanDateTime(o.row.clockIn)}</td>
              <td>{koreanDateTime(o.row.clockOut)}</td>
              <td className="text-right">{o.row.workMinutes == null ? '' : (o.row.workMinutes / 60).toFixed(2)}</td>
            </tr>
          ) : (
            <tr key={`s-${o.key}`} className="ec-total">
              <td colSpan={4} className="text-center">{o.label} 계</td>
              <td className="text-right">{showsItem(sortCfg, 'sub', ITEM_COLS[0]) ? (mins(o.list) / 60).toFixed(2) : ''}</td>
            </tr>
          ))) : lines.map((r) => ('blank' in r ? (
            <tr key={`d-${r.blank}`}><td className="text-center">{slashDate(r.blank)}</td><td></td><td></td><td></td><td></td></tr>
          ) : lateOnly ? (
            <tr key={r.id}>
              <td className="text-center">{slashDate(r.workDate)}</td>
              <td>{r.employeeName}</td>
              <td>{koreanDateTime(r.clockIn)}</td>
              <td>{koreanDateTime(r.enteredAt?.slice(0, 19) ?? null)}</td>
              <td>{r.reason ?? ''}</td>
            </tr>
          ) : (
            <tr key={r.id}>
              <td className="text-center">{slashDate(r.workDate)}</td>
              <td>{r.employeeName}</td>
              <td>{koreanDateTime(r.clockIn)}</td>
              <td>{koreanDateTime(r.clockOut)}</td>
              <td className="text-right">{r.workMinutes == null ? '' : (r.workMinutes / 60).toFixed(2)}</td>
            </tr>
          )))}
        </tbody>
        {!lateOnly && lines.length > 0 && (allDates || sortCfg.total) && (
          <tfoot>
            <tr><td colSpan={4}>합계</td><td className="text-right">{showsItem(sortCfg, 'total', ITEM_COLS[0]) ? (totalMinutes / 60).toFixed(2) : ''}</td></tr>
          </tfoot>
        )}
      </table>
      </>}
      {sortOpen && (
        <EcSortSubtotalModal keys={SORT_KEYS} itemCols={ITEM_COLS} value={sortCfg} onApply={(v) => { setSortCfg(v); setSortOpen(false) }} onClose={() => setSortOpen(false)} />
      )}
    </EcListShell>
  )
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${from}T00:00:00`); d <= new Date(`${to}T00:00:00`) && out.length < 400; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return out
}
