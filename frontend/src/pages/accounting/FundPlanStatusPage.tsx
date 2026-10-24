import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf, ymd, QUOTATION_PICKS } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import { fetchFundPlans, useFundPlanMasters } from '../../features/fundplan/api'
import { CALENDAR_LABEL_ORDER, calendarLabel, methodCell, won, type FundPlan } from '../../features/fundplan/types'

/**
 * 회계 II › 자금계획 › <b>계획전표현황</b>(E020523) — 2026-10-12 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 구분(현황 · <b>캘린더</b> 기본) · 기준일자(현황일 때만, 기본 최근30일(+1개월)) · 부서 · 프로젝트 ·
 * 입출구분(전체 · 출금 · 입금) + 입력구분(전체 · 자금 · 수금 · 지급 · 어음 · 채권 · 채무) + 자금구분(전체 · 예금(현금) · 어음) ·
 * 계좌번호 · 계정코드 · 거래처 · 금액 ~ · 관리번호(어음번호) · 적요 · 회계반영여부(전체 · 반영 · 미반영) · 최초작성자 · 최종수정자 ·
 * 기타 [천단위](캘린더일 때, 기본 켬).
 *
 * <p>캘린더: 제목 · '회사명 : …' · [〈 이전 · 오늘 · 다음 〉] · 오른쪽 'YYYY/MM' · 일요일부터 한 주. 그날 칸에 '예금(현금)감소 / 30'
 * 처럼 종류 이름과 (천단위) 합계. 출금 · 예금 30,000 → 예금(현금)감소 30 · 입금 · 어음 50,000 → 받을어음증가 50 ·
 * 입금 · 예금 → 예금(현금)증가 · 출금 · 어음 → 지급어음증가. 오늘 칸은 옅은 파랑, 달 밖 칸은 회색.
 * <br>현황: 열 일자 · 입출구분 · 입력구분 · 금액 · 상대계정명 · 거래처명 · 관리번호 · 적요 · 회계반영여부, 일자 차례, 끝에 '계'
 * (입금 · 출금을 가리지 않고 더한다 — 30,000 + 50,000 = 80,000).
 *
 * <p>입력구분의 수금 · 지급 · 어음 · 채권 · 채무는 다른 전표에서 오는 계획이라 우리에게는 자료가 없다 — 자금만 걸린다.
 * 회계처리(회계 I 전표로 넘기기)가 없어 모든 계획전표가 '미반영'이다. [자동알림]은 바깥으로 보내는 기능이라 두지 않는다.
 */
type View = 'STATUS' | 'CALENDAR'
const KINDS = ['자금', '수금', '지급', '어음', '채권', '채무'] as const
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

export default function FundPlanStatusPage() {
  const title = '계획전표현황'
  const { companyName } = useAuth()
  const masters = useFundPlanMasters()
  const init = periodOf('최근30일(+1개월)')!
  const [view, setView] = useState<View>('CALENDAR')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [month, setMonth] = useState(ymd(new Date()).slice(0, 7))
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const [dir, setDir] = useState<'' | 'OUT' | 'IN'>('')
  const [kinds, setKinds] = useState<Set<string>>(new Set(KINDS))
  const [method, setMethod] = useState<'' | 'DEPOSIT' | 'NOTE'>('')
  const [bank, setBank] = useState('')
  const [account, setAccount] = useState('')
  const [partner, setPartner] = useState('')
  const [minAmt, setMinAmt] = useState('')
  const [maxAmt, setMaxAmt] = useState('')
  const [noteNo, setNoteNo] = useState('')
  const [memo, setMemo] = useState('')
  const [posted, setPosted] = useState<'' | 'Y' | 'N'>('')
  const [creator, setCreator] = useState('')
  const [updater, setUpdater] = useState('')
  const [thousand, setThousand] = useState(true)
  const [rows, setRows] = useState<FundPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 캘린더는 그 달 1일 ~ 말일, 현황은 기준일자
  const range = useMemo(() => {
    if (view === 'STATUS') return { from, to }
    const [y, m] = month.split('-').map(Number)
    return { from: `${month}-01`, to: ymd(new Date(y, m, 0)) }
  }, [view, from, to, month])

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchFundPlans(range.from, range.to))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [range.from, range.to])

  const shown = useMemo(() => rows
    .filter(() => kinds.has('자금'))
    .filter(() => posted !== 'Y')
    .filter((r) => !dept || String(r.departmentId) === dept)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !dir || r.direction === dir)
    .filter((r) => !method || r.method === method)
    .filter((r) => !bank || String(r.bankAccountId) === bank)
    .filter((r) => !account || String(r.counterAccountId) === account)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !minAmt || Number(r.amount) >= Number(minAmt))
    .filter((r) => !maxAmt || Number(r.amount) <= Number(maxAmt))
    .filter((r) => !noteNo || (r.noteNo ?? '').includes(noteNo))
    .filter((r) => !memo || (r.memo ?? '').includes(memo))
    .filter((r) => !creator || (r.createdBy ?? '').includes(creator))
    .filter((r) => !updater || (r.updatedBy ?? '').includes(updater))
    .sort((a, b) => (a.planDate < b.planDate ? -1 : a.planDate > b.planDate ? 1 : a.id - b.id)),
  [rows, kinds, posted, dept, project, dir, method, bank, account, partner, minAmt, maxAmt, noteNo, memo, creator, updater])

  const total = shown.reduce((a, r) => a + Number(r.amount), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length, view])

  function reset() {
    setView('CALENDAR'); setFrom(init.from); setTo(init.to); setDept(''); setProject(''); setDir('')
    setKinds(new Set(KINDS)); setMethod(''); setBank(''); setAccount(''); setPartner(''); setMinAmt(''); setMaxAmt('')
    setNoteNo(''); setMemo(''); setPosted(''); setCreator(''); setUpdater(''); setThousand(true)
  }
  function shiftMonth(n: number) {
    const [y, m] = month.split('-').map(Number)
    setMonth(ymd(new Date(y, m - 1 + n, 1)).slice(0, 7))
  }
  const toggleKind = (k: string, on: boolean) => setKinds((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n })
  const radio = <T extends string>(name: string, value: T, cur: T, label: string, on: (v: T) => void) => (
    <label key={value} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="radio" name={name} checked={cur === value} onChange={() => on(value)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        ...(view === 'STATUS' ? [{ label: 'Excel' }] : []),
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="구분">
          <select className="ec-input w-[220px]" aria-label="구분" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="STATUS">현황</option>
            <option value="CALENDAR">캘린더</option>
          </select>
        </EcCond>
        {view === 'STATUS' && (
          <EcCond label="기준일자">
            <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="my-0 mx-[4px]">~</span>
            <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
            <span className="ml-[6px]">
              <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
            </span>
          </EcCond>
        )}
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} value={dept} onChange={setDept} items={masters.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} value={project} onChange={setProject} items={masters.projects} />
        </EcCond>
        <EcCond label="입출구분" span="full">
          <div className="flex flex-col gap-[4px]">
            <span>{([['', '전체'], ['OUT', '출금'], ['IN', '입금']] as const).map(([v, l]) => radio('fps-dir', v, dir, l, setDir))}</span>
            <span>
              <span className="bg-ec-disabled rounded-ec px-[4px] mr-[6px]">입력구분</span>
              <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
                <input type="checkbox" checked={kinds.size === KINDS.length}
                       onChange={(e) => setKinds(e.target.checked ? new Set(KINDS) : new Set())} /> 전체
              </label>
              {KINDS.map((k) => (
                <label key={k} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
                  <input type="checkbox" checked={kinds.has(k)} onChange={(e) => toggleKind(k, e.target.checked)} /> {k}
                </label>
              ))}
            </span>
            <span>
              <span className="bg-ec-disabled rounded-ec px-[4px] mr-[6px]">자금구분</span>
              {([['', '전체'], ['DEPOSIT', '예금(현금)'], ['NOTE', '어음']] as const).map(([v, l]) => radio('fps-method', v, method, l, setMethod))}
            </span>
          </div>
        </EcCond>
        <EcCond label="계좌번호" pick>
          <CodePickerField label="계좌번호" hideLabel width={220} value={bank} onChange={setBank} items={masters.bankAccounts} />
        </EcCond>
        <EcCond label="계정코드" pick>
          <CodePickerField label="계정코드" hideLabel width={220} value={account} onChange={setAccount} items={masters.accounts} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} value={partner} onChange={setPartner} items={masters.partners} />
        </EcCond>
        <EcCond label="금액">
          <input className="ec-input w-[120px] text-right" aria-label="금액부터" placeholder="금액" inputMode="numeric"
                 value={minAmt} onChange={(e) => setMinAmt(e.target.value.replace(/[^0-9]/g, ''))} />
          <span className="my-0 mx-[4px]">~</span>
          <input className="ec-input w-[120px] text-right" aria-label="금액까지" inputMode="numeric"
                 value={maxAmt} onChange={(e) => setMaxAmt(e.target.value.replace(/[^0-9]/g, ''))} />
        </EcCond>
        <EcCond label="관리번호(어음번호)">
          <input className="ec-input w-[220px]" placeholder="관리번호(어음번호)" value={noteNo} onChange={(e) => setNoteNo(e.target.value)} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-[220px]" placeholder="적요" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </EcCond>
        <EcCond label="회계반영여부">
          {([['', '전체'], ['Y', '반영'], ['N', '미반영']] as const).map(([v, l]) => radio('fps-posted', v, posted, l, setPosted))}
        </EcCond>
        <EcCond label="최초작성자">
          <input className="ec-input w-[220px]" placeholder="최초작성자" value={creator} onChange={(e) => setCreator(e.target.value)} />
        </EcCond>
        <EcCond label="최종수정자">
          <input className="ec-input w-[220px]" placeholder="최종수정자" value={updater} onChange={(e) => setUpdater(e.target.value)} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={view === 'CALENDAR' && thousand} disabled={view !== 'CALENDAR'}
                   onChange={(e) => setThousand(e.target.checked)} /> 천단위
          </label>
        </EcCond>
      </ul>

      <div className="ec-report-head">
        <h2 className="ec-report-title">{title}</h2>
        {view === 'CALENDAR' ? (
          <FundPlanCalendar month={month} rows={shown} thousand={thousand} companyName={companyName ?? ''}
                            onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)}
                            onToday={() => setMonth(ymd(new Date()).slice(0, 7))} onMonth={setMonth} />
        ) : (
          <>
            <div className="ec-report-meta">
              <span>회사명 : {companyName ?? ''}</span>
              <span>{from.replaceAll('-', '/')} ~ {to.replaceAll('-', '/')}</span>
            </div>
            <table ref={tableRef} className="ec-report w-full text-left">
              <thead>
                <tr>
                  <th className="text-center">일자</th>
                  <th>입출구분</th>
                  <th>입력구분</th>
                  <th className="text-right">금액</th>
                  <th>상대계정명</th>
                  <th>거래처명</th>
                  <th>관리번호</th>
                  <th>적요</th>
                  <th>회계반영여부</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
                ) : shown.length === 0 ? (
                  <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : shown.map((r) => (
                  <tr key={r.id}>
                    <td className="text-center text-ec-navy">{r.planDate.replaceAll('-', '/')}</td>
                    <td>{r.directionName}</td>
                    <td>{methodCell(r.method)}</td>
                    <td className="text-right">{Number(r.amount) ? won(Number(r.amount)) : ''}</td>
                    <td>{r.counterAccountName ?? ''}</td>
                    <td>{r.partnerName ?? ''}</td>
                    <td>{r.noteNo ?? ''}</td>
                    <td>{r.memo ?? ''}</td>
                    <td />
                  </tr>
                ))}
              </tbody>
              {shown.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3} className="text-center">계</td>
                    <td className="text-right">{won(total)}</td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              )}
            </table>
          </>
        )}
      </div>
    </EcListShell>
  )
}

/** 원본 캘린더 — 일요일부터, 그날 칸에 종류별 합계(천단위면 1,000 으로 나눠 반올림). */
function FundPlanCalendar({ month, rows, thousand, companyName, onPrev, onNext, onToday, onMonth }: {
  month: string
  rows: FundPlan[]
  thousand: boolean
  companyName: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onMonth: (m: string) => void
}) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const days = new Date(y, m, 0).getDate()
  const today = ymd(new Date())
  const byDay = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const r of rows) {
      const d = map.get(r.planDate) ?? new Map<string, number>()
      const k = calendarLabel(r.direction, r.method)
      d.set(k, (d.get(k) ?? 0) + Number(r.amount))
      map.set(r.planDate, d)
    }
    return map
  }, [rows])
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  const show = (n: number) => won(thousand ? Math.round(n / 1000) : n)

  return (
    <>
      <div className="ec-report-meta"><span>회사명 : {companyName}</span><span /></div>
      <div className="flex items-end justify-between mb-[2px]">
        <div className="ec-btn-group">
          <button type="button" className="ec-btn ec-btn-sm" onClick={onPrev}>〈 이전</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={onToday}>오늘</button>
          <button type="button" className="ec-btn ec-btn-sm" onClick={onNext}>다음 〉</button>
          <input type="month" className="ec-input w-[130px]" aria-label="달" value={month} onChange={(e) => e.target.value && onMonth(e.target.value)} />
        </div>
        <span>{month.replace('-', '/')}</span>
      </div>
      <table className="w-full table-fixed">
        <thead>
          <tr>{WEEK.map((w) => <th key={w} className="text-center">{w}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((wk, i) => (
            <tr key={i}>
              {wk.map((d, j) => {
                if (d == null) return <td key={j} className="bg-ec-disabled h-[76px]" />
                const date = `${month}-${String(d).padStart(2, '0')}`
                const items = [...(byDay.get(date)?.entries() ?? [])]
                  .sort((a, b) => CALENDAR_LABEL_ORDER.indexOf(a[0]) - CALENDAR_LABEL_ORDER.indexOf(b[0]))
                return (
                  <td key={j} className={`align-top h-[76px] p-[2.7px] ${date === today ? 'bg-ec-blue-wash' : ''}`}>
                    <div className={`text-right font-bold ${d === 1 ? 'italic' : ''}`}>{d}</div>
                    {items.map(([k, v]) => (
                      <div key={k} className="text-ec-navy">
                        <div>{k}</div>
                        <div>{show(v)}</div>
                      </div>
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
