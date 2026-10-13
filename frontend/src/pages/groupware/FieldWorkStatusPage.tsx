import { useEffect, useRef, useState, type ReactNode } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'
import { EcReportHead, EcReportFoot, reportPeriod, reportDate } from '../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../api/client'
import type { FieldWork, FieldWorkSummary } from '../../types/api'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useAuth } from '../../features/auth/AuthContext'
import FieldWorkFormModal, { type FieldWorkUser } from '../../features/fieldwork/components/FieldWorkFormModal'
import EcSortSubtotalModal, { sortBySubtotal, showsItem, type SortSubtotal } from '../../components/EcSortSubtotalModal'
import { subtotalLabel } from '../../components/EcSubtotalDetailModal'

/** 원본 기본 기간 — 한 달 전 같은 날 ~ 오늘(2026/09/03 ~ 2026/10/03, 외근조회와 같다). */
/** 원본 빠른선택(2026-10-03 실측): 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 · <b>최근30일</b>. */
const FIELD_STATUS_PICKS = [...INQUIRY_PICKS, '최근30일'] as const
const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return ymd(d) }
const num = (v: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/*
 * 원본 [정렬/소계기준] [설정] — '정렬/소계/합계 설정' 창(2026-10-13 실측). 기준: 없음 · 일자 · 차량종류 · 사용자명 · 사용목적 ·
 * 주행전 계기판거리 · 주행후 계기판거리 · 운행거리 · 적요. 처음엔 1 차량종류(소계 표시) · 2 일자(표시안함) · 3 없음, 합계영역 표시,
 * 소계/합계 표시항목 ◉직접설정(세 숫자 열 소계 · 합계 모두 체크). 1 사용자명 · 2 일자 둘 다 소계를 켜면 원본은
 * 안쪽부터 '2026/10 계' → '변종호 계' → '합계' — <b>일자 소계는 달 단위</b>(상세설정 [소계기준] 기본 ◉월, ◯일 이면 '2026/10/07 계').
 */
const SORT_KEYS = ['일자', '차량종류', '사용자명', '사용목적', '주행전 계기판거리', '주행후 계기판거리', '운행거리', '적요']
const ITEM_COLS = ['주행전 계기판거리', '주행후 계기판거리', '운행거리'] as const
const SORT_STORE = 'field-work-status-sort'
const DEFAULT_SORT: SortSubtotal = {
  lines: [{ key: '차량종류', desc: false, subtotal: true }, { key: '일자', desc: false, subtotal: false }, { key: '', desc: false, subtotal: false }],
  total: true,
  items: { custom: true, sub: {}, total: {} },
}
/** 정렬에 쓰는 값. 차량종류는 대소문자를 가리지 않는다(k5[H]·K5[H] 가 한 묶음). */
function sortValue(r: FieldWork, key: string): string | number | null {
  switch (key) {
    case '일자': return r.workDate
    case '차량종류': return (r.vehicleName ?? r.vehicleNo ?? '').toUpperCase()
    case '사용자명': return r.userName ?? ''
    case '사용목적': return r.usePurpose ?? ''
    case '주행전 계기판거리': return r.odometerBefore != null ? Number(r.odometerBefore) : null
    case '주행후 계기판거리': return r.odometerAfter != null ? Number(r.odometerAfter) : null
    case '운행거리': return r.distance != null ? Number(r.distance) : null
    case '적요': return r.purpose ?? ''
    default: return ''
  }
}
/** 소계 줄을 가르는 값 · 이름표. 일자는 달('2026/10') — 소계상세설정 [소계기준] ◉일 이면 날('2026/10/07'). */
function groupLabel(r: FieldWork, key: string, byDay = false): string {
  if (key === '일자') return (byDay ? r.workDate : r.workDate.slice(0, 7)).replaceAll('-', '/')
  const v = sortValue(r, key)
  return typeof v === 'number' ? num(v) : (v ?? '')
}

/**
 * 원본 [양식] (2026-10-13 실측) — '외근현황용'(지금 쓰는 것) · '기본(수정불가)'(빨간 글자) 둘, 아래 [신규양식추가](양식 디자이너라 두지 않음).
 * 기본(수정불가) 격자: [일자][부서명][사용자명][사용목적명][주행전][주행후][운행거리][적요][이동수단명] — 일자 말고는 모두 오른쪽 맞춤.
 */
const FORMS = ['외근현황용', '기본(수정불가)'] as const
type FormName = typeof FORMS[number]
/**
 * 원본 조건 탭 [기본][전체][+](My탭 — 검색항목을 골라 저장하는 개인 탭이라 두지 않음). [전체] 차례(2026-10-13 실측):
 * 일자 · 사용자 · 이동수단 · 주행전 계기판거리 ~ · 주행후 계기판거리 ~ · 운행거리 ~ · 사용목적 · 적요 · 부서 · 프로젝트 · 기타 · 정렬/소계기준.
 * 프로젝트는 우리 외근 기록에 칸이 없어 두지 않았다.
 */
type CondKey = '일자' | '이동수단' | '사용자' | '사용목적' | '주행전' | '주행후' | '운행거리' | '적요' | '부서' | '기타' | '정렬'
const COND_TABS: Record<'기본' | '전체', CondKey[]> = {
  기본: ['일자', '이동수단', '사용자', '사용목적', '운행거리', '적요', '기타', '정렬'],
  전체: ['일자', '사용자', '이동수단', '주행전', '주행후', '운행거리', '사용목적', '적요', '부서', '기타', '정렬'],
}

/**
 * 그룹웨어 > 공유정보 > 외근조회 > 외근현황 (이카운트 E070255)
 *
 * <p>2026-10-03 원본을 열어 새로 만들었다(예전 메뉴 주석은 '원본도 권한없음'). 두 판이다.
 * <ol>
 *   <li><b>조건 판</b> — 일자(한 달 전 ~ 오늘) · 이동수단 · 사용자 · 사용목적 · 운행거리(구간) · 적요 · 기타 · 정렬/소계기준.
 *       아래 [검색(F8)] 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 … [다시 작성].</li>
 *   <li><b>출력물</b> — 가운데 제목 · 회사명 · 기간, 격자 [일자][차량종류][사용자명][사용목적][주행전 계기판거리]
 *       [주행후 계기판거리][운행거리][적요], <b>차량종류마다 '○○ 계'</b>(대소문자를 가리지 않는다 — k5[H]·K5[H] 가
 *       'K5[H] 계' 한 줄로 묶였다), 끝에 '합계', [P.1] · 출력 시각, 하단 [인쇄][Excel].</li>
 * </ol>
 *
 * <p>출력물의 [일자]를 누르면 '외근입력' 창이 그 기록으로 열린다(저장 · 삭제 뒤 출력물을 다시 뽑는다, 2026-10-03 실측).
 *
 * <p>[주행전/주행후 계기판거리]는 외근입력에서 차량을 고르면 뜨는 두 칸의 값이다(V264). 계 · 합계에 같이 더한다. 조건의 [기타](도착전내역만보기 ·
 * 모든날짜표시) · [최근30일] · 정렬/소계 [설정] 창(2026-10-13)도 원본대로 둔다.
 */
export default function FieldWorkStatusPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<FieldWorkUser[]>([])
  const [editing, setEditing] = useState<FieldWork | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<'cond' | 'result'>('cond')
  const [rows, setRows] = useState<FieldWork[]>([])

  const [from, setFrom] = useState(monthAgo)
  const [to, setTo] = useState(() => ymd(new Date()))
  const [vehicle, setVehicle] = useState('')
  const [userId, setUserId] = useState('')
  const [usePurpose, setUsePurpose] = useState('')
  const [distMin, setDistMin] = useState('')
  const [distMax, setDistMax] = useState('')
  const [remark, setRemark] = useState('')
  const [odoBeforeMin, setOdoBeforeMin] = useState('')
  const [odoBeforeMax, setOdoBeforeMax] = useState('')
  const [odoAfterMin, setOdoAfterMin] = useState('')
  const [odoAfterMax, setOdoAfterMax] = useState('')
  const [dept, setDept] = useState('')
  const [tab, setTab] = useState<'기본' | '전체'>('기본')
  const [form, setForm] = useState<FormName>('외근현황용')
  const [formMenu, setFormMenu] = useState(false)
  /*
   * 원본 조건 [기타](2026-10-03 실측): [도착전내역만보기]를 켜면 주행후 계기판거리가 아직 없는 운행만,
   * [모든날짜표시]를 켜면 기록이 없는 날도 일자만 한 줄씩 — 차량종류 묶음 뒤에 '[] 계' 로 모아 둔다(합은 없다).
   */
  const [beforeArrival, setBeforeArrival] = useState(false)
  const [allDates, setAllDates] = useState(false)
  const [showSort, setShowSort] = useState(false)
  /** [적용/저장] 하면 다음에 열 때도 그대로(이 브라우저에만). */
  const [sortCfg, setSortCfg] = useState<SortSubtotal>(() => {
    try { const x = localStorage.getItem(SORT_STORE); if (x) return JSON.parse(x) as SortSubtotal } catch { /* 저장소를 못 쓰면 기본값 */ }
    return DEFAULT_SORT
  })

  /** 양식마다 칸 수가 다르다(외근현황용 8 · 기본(수정불가) 9). */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '외근현황', [form, rows, view, sortCfg])

  useEffect(() => { api.get<FieldWorkUser[]>('/users').then((r) => setUsers(r.data)).catch(() => {}) }, [])

  function reset() {
    setFrom(monthAgo()); setTo(ymd(new Date()))
    setVehicle(''); setUserId(''); setUsePurpose(''); setDistMin(''); setDistMax(''); setRemark('')
    setOdoBeforeMin(''); setOdoBeforeMax(''); setOdoAfterMin(''); setOdoAfterMax(''); setDept('')
    setBeforeArrival(false); setAllDates(false)
  }

  async function search() {
    setError('')
    try {
      const all = (await api.get<FieldWorkSummary>('/field-works', { params: { from, to } })).data.rows
      const has = (v: string | null, q: string) => !q || (v ?? '').includes(q)
      const picked = all
        .filter((r) => !vehicle || has(r.vehicleNo, vehicle) || has(r.vehicleName, vehicle))
        .filter((r) => !userId || String(r.userId) === userId)
        .filter((r) => has(r.usePurpose, usePurpose))
        .filter((r) => has(r.purpose, remark))
        .filter((r) => !beforeArrival || r.odometerAfter == null)
        .filter((r) => !distMin || Number(r.distance ?? 0) >= Number(distMin))
        .filter((r) => !distMax || Number(r.distance ?? 0) <= Number(distMax))
        .filter((r) => !odoBeforeMin || Number(r.odometerBefore ?? 0) >= Number(odoBeforeMin))
        .filter((r) => !odoBeforeMax || Number(r.odometerBefore ?? 0) <= Number(odoBeforeMax))
        .filter((r) => !odoAfterMin || Number(r.odometerAfter ?? 0) >= Number(odoAfterMin))
        .filter((r) => !odoAfterMax || Number(r.odometerAfter ?? 0) <= Number(odoAfterMax))
        .filter((r) => has(r.department, dept))
        .sort((a, b) => (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : a.id - b.id))
      setRows(picked)
      setView('result')
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useShortcut('F8', () => void search(), view === 'cond' && !editing)

  /**
   * 정렬 · 소계 — 소계를 켠 기준마다, 그 기준까지의 값이 바뀌면 안쪽 기준부터 '값 계' 줄을 넣는다.
   * 일자 소계를 켜면 그 줄의 정렬도 달 단위로 묶는다(같은 달 안은 일자 · 입력 차례).
   */
  const out = (() => {
    const lines = sortCfg.lines
    /** 소계상세설정 [소계기준] ◉일 — 그 줄의 일자는 날 단위로 가른다. */
    const byDay = (i: number) => !!sortCfg.details?.[i]?.byDay
    const label = (r: FieldWork, i: number) => groupLabel(r, lines[i].key, byDay(i))
    const ordered = sortBySubtotal(rows, sortCfg, (r, k) => {
      const i = lines.findIndex((x) => x.key === k)
      return k === '일자' && lines[i]?.subtotal && !byDay(i) ? groupLabel(r, k) : sortValue(r, k)
    })
    const subs = lines.map((l, i) => ({ l, i })).filter((x) => x.l.key && x.l.subtotal)
    const prefix = (r: FieldWork, upto: number) => lines.slice(0, upto + 1).map((l, i) => (l.key ? label(r, i) : '')).join('\u0001')
    type Out = { kind: 'row'; r: FieldWork } | { kind: 'sub'; label: string; list: FieldWork[]; key: string }
    const res: Out[] = []
    const acc = subs.map(() => ({ key: '', value: '', parents: [] as string[], list: [] as FieldWork[] }))
    const close = (from: number) => {
      for (let j = subs.length - 1; j >= from; j--) {
        const a = acc[j]
        if (a.list.length) {
          res.push({ kind: 'sub', label: subtotalLabel(a.value, sortCfg.details?.[subs[j].i], a.list.length, a.parents), list: a.list, key: `${j}:${a.key}` })
        }
        acc[j] = { key: '', value: '', parents: [], list: [] }
      }
    }
    for (const r of ordered) {
      const changed = subs.findIndex((x, j) => acc[j].list.length > 0 && prefix(r, x.i) !== acc[j].key)
      if (changed >= 0) close(changed)
      subs.forEach((x, j) => {
        /* 상위 소계명 포함 — 원본 'K5[H] / 2026/10/07 계'(위 소계 기준들의 값, 바깥부터). */
        if (!acc[j].list.length) acc[j] = { key: prefix(r, x.i), value: label(r, x.i), parents: subs.slice(0, j).map((y) => label(r, y.i)), list: [] }
        acc[j].list.push(r)
      })
      res.push({ kind: 'row', r })
    }
    close(0)
    return res
  })()
  /** [모든날짜표시] — 기간 안에서 기록이 하나도 없는 날. */
  const emptyDays = (() => {
    if (!allDates || !from || !to) return [] as string[]
    const have = new Set(rows.map((r) => r.workDate))
    const out: string[] = []
    const d = new Date(`${from}T00:00:00`)
    for (let i = 0; i < 400 && ymd(d) <= to; i++) { const k = ymd(d); if (!have.has(k)) out.push(k); d.setDate(d.getDate() + 1) }
    return out
  })()
  const sum = (list: FieldWork[]) => list.reduce((a, r) => a + Number(r.distance ?? 0), 0)
  /** 원본 계 · 합계는 두 계기판 값도 더한다(K5[H] 계 75,000 · 76,000, 실측). */
  const sumOf = (list: FieldWork[], k: 'odometerBefore' | 'odometerAfter') => list.reduce((a, r) => a + Number(r[k] ?? 0), 0)

  const range = (label: string, a: string, setA: (v: string) => void, b: string, setB: (v: string) => void) => (
    <>
      <div className="title">{label}</div>
      <div className="form">
        <input type="number" className="ec-input flex-1 text-right" aria-label={`${label} 부터`} value={a} onChange={(e) => setA(e.target.value)} />
        <span className="text-ec-label">~</span>
        <input type="number" className="ec-input flex-1 text-right" aria-label={`${label} 까지`} value={b} onChange={(e) => setB(e.target.value)} />
      </div>
    </>
  )
  const text = (label: string, value: string, set: (v: string) => void) => (
    <>
      <div className="title">{label}</div>
      <div className="form"><input className="ec-input flex-1" placeholder={label} value={value} onChange={(e) => set(e.target.value)} /></div>
    </>
  )
  /** 조건 칸 — 탭마다 차례만 다르다(COND_TABS). */
  const cond: Record<CondKey, ReactNode> = {
    일자: (
      <>
        <div className="title">일자</div>
        <div className="form">
          <input type="date" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-ec-label">~</span>
          <input type="date" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </>
    ),
    이동수단: text('이동수단', vehicle, setVehicle),
    사용자: (
      <>
        <div className="title">사용자</div>
        <div className="form">
          <CodePickerField label="사용자" hideLabel width={220} value={userId} onChange={setUserId}
                           items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))} />
        </div>
      </>
    ),
    사용목적: text('사용목적', usePurpose, setUsePurpose),
    주행전: range('주행전 계기판거리', odoBeforeMin, setOdoBeforeMin, odoBeforeMax, setOdoBeforeMax),
    주행후: range('주행후 계기판거리', odoAfterMin, setOdoAfterMin, odoAfterMax, setOdoAfterMax),
    운행거리: range('운행거리', distMin, setDistMin, distMax, setDistMax),
    적요: text('적요', remark, setRemark),
    부서: text('부서', dept, setDept),
    기타: (
      <>
        <div className="title">기타</div>
        <div className="form gap-[12px]">
          <label className="inline-flex items-center gap-[4px] cursor-pointer">
            <input type="checkbox" checked={beforeArrival} onChange={(e) => setBeforeArrival(e.target.checked)} />도착전내역만보기
          </label>
          <label className="inline-flex items-center gap-[4px] cursor-pointer">
            <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} />모든날짜표시
          </label>
        </div>
      </>
    ),
    정렬: (
      <>
        <div className="title">정렬/소계기준</div>
        <div className="form">
          <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy" onClick={() => setShowSort(true)}>설정</button>
        </div>
      </>
    ),
  }
  /** 양식마다 격자 앞 네 칸 · 뒤 칸. 기본(수정불가)는 일자 말고 모두 오른쪽 맞춤. */
  const basic = form === '기본(수정불가)'
  const vehicleOf = (r: FieldWork) => r.vehicleName ?? r.vehicleNo ?? ''
  const tailHeads = basic ? ['적요', '이동수단명'] : ['적요']
  const tail = (r: FieldWork) => (basic ? [r.purpose ?? '', vehicleOf(r)] : [r.purpose ?? ''])

  return (
    <EcListShell title="외근현황" searchable={view === 'result'} onSearch={() => setView('cond')}
                 actions={view === 'result' ? [{ label: '인쇄' }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {view === 'cond' ? (
        <div>
          <ul className="flex list-none m-0 p-0 mb-[6px] border-0 border-b border-solid border-ec-line" aria-label="조건 탭">
            {(['기본', '전체'] as const).map((t) => (
              <li key={t} className={`border-0 border-b-[1.5px] border-solid ${tab === t ? 'border-ec-blue' : 'border-transparent'}`}>
                <button type="button" onClick={() => setTab(t)}
                        className={`no-ec bg-transparent border-0 cursor-pointer text-[12px] py-[9.9px] px-[11.7px] ${tab === t ? 'text-ec-blue font-bold' : 'text-[var(--ec-pill-text)]'}`}>{t}</button>
              </li>
            ))}
          </ul>
          <ul className="ec-form">
            {COND_TABS[tab].map((k) => <li key={k} className="wide">{cond[k]}</li>)}
          </ul>
          <div className="flex flex-wrap items-center gap-[6px] mt-[8px]">
            <span className="relative">
              <button type="button" className="ec-btn" aria-label="양식" onClick={() => setFormMenu((m) => !m)}>{form} ▾</button>
              {formMenu && (
                <div className="absolute top-full left-0 mt-[2px] z-[41] min-w-[124px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
                  {FORMS.map((f) => (
                    <button key={f} type="button" onClick={() => { setForm(f); setFormMenu(false) }}
                            className={`no-ec block w-full text-left py-[4.5px] pr-[9px] pl-[22.5px] text-[12px] border-0 cursor-pointer rounded-ec ${
                              form === f ? 'bg-ec-blue text-white' : f === '기본(수정불가)' ? 'bg-transparent text-[var(--ec-text-danger)]' : 'bg-transparent'}`}>
                      {form === f ? '✓ ' : ''}{f}
                    </button>
                  ))}
                </div>
              )}
            </span>
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
            <EcPeriodPicks labels={FIELD_STATUS_PICKS} currentFrom={from}
                           onPick={(r) => { if (r.from) setFrom(r.from); setTo(r.to) }} />
            <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
          </div>
        </div>
      ) : (
        <>
          <EcReportHead title="외근현황" period={reportPeriod(from, to)} />
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th>일자</th><th>{basic ? '부서명' : '차량종류'}</th><th>사용자명</th><th>{basic ? '사용목적명' : '사용목적'}</th>
                <th className="text-right">주행전 계기판거리</th><th className="text-right">주행후 계기판거리</th>
                <th className="text-right">운행거리</th>{tailHeads.map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && emptyDays.length === 0 ? (
                /* 원본은 0건이어도 '등록된 데이터가 없습니다.' 를 쓰지 않는다 — 빈 '[] 계' 한 줄뿐이고 합계 줄도 없다(2026-10-12 도착전내역만보기 실측). */
                <tr className="font-bold bg-ec-page">
                  <td colSpan={4} className="text-center">[] 계</td>
                  <td /><td /><td />{tailHeads.map((h) => <td key={h} />)}
                </tr>
              ) : (
                <>
                  {out.map((o) => o.kind === 'row' ? (
                    <tr key={o.r.id}>
                      <td>
                        <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                                onClick={() => setEditing(o.r)}>{reportDate(o.r.workDate)}</button>
                      </td>
                      <td className={basic ? 'text-right' : ''}>{basic ? o.r.department ?? '' : vehicleOf(o.r)}</td>
                      <td className={basic ? 'text-right' : ''}>{o.r.userName}</td>
                      <td className={basic ? 'text-right' : ''}>{o.r.usePurpose ?? ''}</td>
                      <td className="text-right">{o.r.odometerBefore != null ? num(Number(o.r.odometerBefore)) : ''}</td>
                      <td className="text-right">{o.r.odometerAfter != null ? num(Number(o.r.odometerAfter)) : ''}</td>
                      <td className="text-right">{o.r.distance != null ? num(Number(o.r.distance)) : ''}</td>
                      {tail(o.r).map((t, i) => <td key={i} className={basic ? 'text-right' : ''}>{t}</td>)}
                    </tr>
                  ) : (
                    <tr key={o.key} className="font-bold bg-ec-page">
                      <td colSpan={4} className="text-center">{o.label}</td>
                      <td className="text-right">{showsItem(sortCfg, 'sub', ITEM_COLS[0]) ? num(sumOf(o.list, 'odometerBefore')) : ''}</td>
                      <td className="text-right">{showsItem(sortCfg, 'sub', ITEM_COLS[1]) ? num(sumOf(o.list, 'odometerAfter')) : ''}</td>
                      <td className="text-right">{showsItem(sortCfg, 'sub', ITEM_COLS[2]) ? num(sum(o.list)) : ''}</td>
                      {tailHeads.map((h) => <td key={h} />)}
                    </tr>
                  ))}
                  {emptyDays.length > 0 && (
                    <>
                      {emptyDays.map((d) => <tr key={d}><td className="text-ec-navy">{reportDate(d)}</td><td colSpan={6 + tailHeads.length} /></tr>)}
                      <tr className="font-bold bg-ec-page">
                        <td colSpan={4} className="text-center">[] 계</td>
                        <td /><td /><td />{tailHeads.map((h) => <td key={h} />)}
                      </tr>
                    </>
                  )}
                  {sortCfg.total && (
                    <tr className="font-bold bg-ec-page">
                      <td colSpan={4} className="text-center">{sortCfg.totalName?.trim() || '합계'}</td>
                      <td className="text-right">{showsItem(sortCfg, 'total', ITEM_COLS[0]) ? num(sumOf(rows, 'odometerBefore')) : ''}</td>
                      <td className="text-right">{showsItem(sortCfg, 'total', ITEM_COLS[1]) ? num(sumOf(rows, 'odometerAfter')) : ''}</td>
                      <td className="text-right">{showsItem(sortCfg, 'total', ITEM_COLS[2]) ? num(sum(rows)) : ''}</td>
                      {tailHeads.map((h) => <td key={h} />)}
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
          <EcReportFoot />
          <FieldWorkFormModal open={!!editing} record={editing} users={users} myUsername={user?.username}
                              onClose={() => setEditing(null)} onSaved={() => void search()} />
        </>
      )}
      {showSort && (
        <EcSortSubtotalModal keys={SORT_KEYS} itemCols={[...ITEM_COLS]} value={sortCfg}
                             onApply={(v) => { setSortCfg(v); setShowSort(false) }}
                             onSave={(v) => { try { localStorage.setItem(SORT_STORE, JSON.stringify(v)) } catch { /* 저장소를 못 쓰면 이번만 */ } }}
                             onClose={() => setShowSort(false)} />
      )}
    </EcListShell>
  )
}
