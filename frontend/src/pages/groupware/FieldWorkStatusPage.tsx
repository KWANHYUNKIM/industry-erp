import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'
import { EcReportHead, EcReportFoot, reportPeriod, reportDate } from '../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../api/client'
import type { FieldWork, FieldWorkSummary } from '../../types/api'
import { useShortcut } from '../../utils/useShortcut'
import { useAuth } from '../../features/auth/AuthContext'
import FieldWorkFormModal, { type FieldWorkUser } from '../../features/fieldwork/components/FieldWorkFormModal'
import EcSortSubtotalModal, { sortBySubtotal, showsItem, type SortSubtotal } from '../../components/EcSortSubtotalModal'

/** 원본 기본 기간 — 한 달 전 같은 날 ~ 오늘(2026/09/03 ~ 2026/10/03, 외근조회와 같다). */
/** 원본 빠른선택(2026-10-03 실측): 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 · <b>최근30일</b>. */
const FIELD_STATUS_PICKS = [...INQUIRY_PICKS, '최근30일'] as const
const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return ymd(d) }
const num = (v: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/*
 * 원본 [정렬/소계기준] [설정] — '정렬/소계/합계 설정' 창(2026-10-13 실측). 기준: 없음 · 일자 · 차량종류 · 사용자명 · 사용목적 ·
 * 주행전 계기판거리 · 주행후 계기판거리 · 운행거리 · 적요. 처음엔 1 차량종류(소계 표시) · 2 일자(표시안함) · 3 없음, 합계영역 표시,
 * 소계/합계 표시항목 ◉직접설정(세 숫자 열 소계 · 합계 모두 체크). 1 사용자명 · 2 일자 둘 다 소계를 켜면 원본은
 * 안쪽부터 '2026/10 계' → '변종호 계' → '합계' — <b>일자 소계는 달 단위</b>였다(상세설정 창은 재지 못했다).
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
/** 소계 줄을 가르는 값 · 이름표. 일자는 달('2026/10'). */
function groupLabel(r: FieldWork, key: string): string {
  if (key === '일자') return r.workDate.slice(0, 7).replace('-', '/')
  const v = sortValue(r, key)
  return typeof v === 'number' ? num(v) : (v ?? '')
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

  useEffect(() => { api.get<FieldWorkUser[]>('/users').then((r) => setUsers(r.data)).catch(() => {}) }, [])

  function reset() {
    setFrom(monthAgo()); setTo(ymd(new Date()))
    setVehicle(''); setUserId(''); setUsePurpose(''); setDistMin(''); setDistMax(''); setRemark('')
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
    const ordered = sortBySubtotal(rows, sortCfg, (r, k) => {
      const l = lines.find((x) => x.key === k)
      return k === '일자' && l?.subtotal ? groupLabel(r, k) : sortValue(r, k)
    })
    const subs = lines.map((l, i) => ({ l, i })).filter((x) => x.l.key && x.l.subtotal)
    const prefix = (r: FieldWork, upto: number) => lines.slice(0, upto + 1).filter((l) => l.key).map((l) => groupLabel(r, l.key)).join('\u0001')
    type Out = { kind: 'row'; r: FieldWork } | { kind: 'sub'; label: string; list: FieldWork[]; key: string }
    const res: Out[] = []
    const acc = subs.map(() => ({ key: '', label: '', list: [] as FieldWork[] }))
    const close = (from: number) => {
      for (let j = subs.length - 1; j >= from; j--) {
        if (acc[j].list.length) res.push({ kind: 'sub', label: acc[j].label, list: acc[j].list, key: `${j}:${acc[j].key}` })
        acc[j] = { key: '', label: '', list: [] }
      }
    }
    for (const r of ordered) {
      const changed = subs.findIndex((x, j) => acc[j].list.length > 0 && prefix(r, x.i) !== acc[j].key)
      if (changed >= 0) close(changed)
      subs.forEach((x, j) => {
        if (!acc[j].list.length) acc[j] = { key: prefix(r, x.i), label: groupLabel(r, x.l.key), list: [] }
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

  return (
    <EcListShell title="외근현황" searchable={view === 'result'} onSearch={() => setView('cond')}
                 actions={view === 'result' ? [{ label: '인쇄' }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {view === 'cond' ? (
        <div>
          <ul className="ec-form">
            <li className="wide">
              <div className="title">일자</div>
              <div className="form">
                <input type="date" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-ec-label">~</span>
                <input type="date" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </li>
            <li className="wide">
              <div className="title">이동수단</div>
              <div className="form"><input className="ec-input flex-1" placeholder="이동수단" value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">사용자</div>
              <div className="form">
                <CodePickerField label="사용자" hideLabel width={220} value={userId} onChange={setUserId}
                                 items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))} />
              </div>
            </li>
            <li className="wide">
              <div className="title">사용목적</div>
              <div className="form"><input className="ec-input flex-1" placeholder="사용목적" value={usePurpose} onChange={(e) => setUsePurpose(e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">운행거리</div>
              <div className="form">
                <input type="number" className="ec-input flex-1 text-right" aria-label="운행거리 부터" value={distMin} onChange={(e) => setDistMin(e.target.value)} />
                <span className="text-ec-label">~</span>
                <input type="number" className="ec-input flex-1 text-right" aria-label="운행거리 까지" value={distMax} onChange={(e) => setDistMax(e.target.value)} />
              </div>
            </li>
            <li className="wide">
              <div className="title">적요</div>
              <div className="form"><input className="ec-input flex-1" placeholder="적요" value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
            </li>
            <li className="wide">
              <div className="title">기타</div>
              <div className="form gap-[12px]">
                <label className="inline-flex items-center gap-[4px] cursor-pointer">
                  <input type="checkbox" checked={beforeArrival} onChange={(e) => setBeforeArrival(e.target.checked)} />도착전내역만보기
                </label>
                <label className="inline-flex items-center gap-[4px] cursor-pointer">
                  <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} />모든날짜표시
                </label>
              </div>
            </li>
            <li className="wide">
              <div className="title">정렬/소계기준</div>
              <div className="form">
                <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy" onClick={() => setShowSort(true)}>설정</button>
              </div>
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-[6px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
            <EcPeriodPicks labels={FIELD_STATUS_PICKS} currentFrom={from}
                           onPick={(r) => { if (r.from) setFrom(r.from); setTo(r.to) }} />
            <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>
          </div>
        </div>
      ) : (
        <>
          <EcReportHead title="외근현황" period={reportPeriod(from, to)} />
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>일자</th><th>차량종류</th><th>사용자명</th><th>사용목적</th>
                <th className="text-right">주행전 계기판거리</th><th className="text-right">주행후 계기판거리</th>
                <th className="text-right">운행거리</th><th>적요</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && emptyDays.length === 0 ? (
                /* 원본은 0건이어도 '등록된 데이터가 없습니다.' 를 쓰지 않는다 — 빈 '[] 계' 한 줄뿐이고 합계 줄도 없다(2026-10-12 도착전내역만보기 실측). */
                <tr className="font-bold bg-ec-page">
                  <td colSpan={4} className="text-center">[] 계</td>
                  <td /><td /><td /><td />
                </tr>
              ) : (
                <>
                  {out.map((o) => o.kind === 'row' ? (
                    <tr key={o.r.id}>
                      <td>
                        <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                                onClick={() => setEditing(o.r)}>{reportDate(o.r.workDate)}</button>
                      </td>
                      <td>{o.r.vehicleName ?? o.r.vehicleNo ?? ''}</td>
                      <td>{o.r.userName}</td>
                      <td>{o.r.usePurpose ?? ''}</td>
                      <td className="text-right">{o.r.odometerBefore != null ? num(Number(o.r.odometerBefore)) : ''}</td>
                      <td className="text-right">{o.r.odometerAfter != null ? num(Number(o.r.odometerAfter)) : ''}</td>
                      <td className="text-right">{o.r.distance != null ? num(Number(o.r.distance)) : ''}</td>
                      <td>{o.r.purpose ?? ''}</td>
                    </tr>
                  ) : (
                    <tr key={o.key} className="font-bold bg-ec-page">
                      <td colSpan={4} className="text-center">{o.label} 계</td>
                      <td className="text-right">{showsItem(sortCfg, 'sub', ITEM_COLS[0]) ? num(sumOf(o.list, 'odometerBefore')) : ''}</td>
                      <td className="text-right">{showsItem(sortCfg, 'sub', ITEM_COLS[1]) ? num(sumOf(o.list, 'odometerAfter')) : ''}</td>
                      <td className="text-right">{showsItem(sortCfg, 'sub', ITEM_COLS[2]) ? num(sum(o.list)) : ''}</td>
                      <td />
                    </tr>
                  ))}
                  {emptyDays.length > 0 && (
                    <>
                      {emptyDays.map((d) => <tr key={d}><td className="text-ec-navy">{reportDate(d)}</td><td colSpan={7} /></tr>)}
                      <tr className="font-bold bg-ec-page">
                        <td colSpan={4} className="text-center">[] 계</td>
                        <td /><td /><td /><td />
                      </tr>
                    </>
                  )}
                  {sortCfg.total && (
                    <tr className="font-bold bg-ec-page">
                      <td colSpan={4} className="text-center">합계</td>
                      <td className="text-right">{showsItem(sortCfg, 'total', ITEM_COLS[0]) ? num(sumOf(rows, 'odometerBefore')) : ''}</td>
                      <td className="text-right">{showsItem(sortCfg, 'total', ITEM_COLS[1]) ? num(sumOf(rows, 'odometerAfter')) : ''}</td>
                      <td className="text-right">{showsItem(sortCfg, 'total', ITEM_COLS[2]) ? num(sum(rows)) : ''}</td>
                      <td />
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
