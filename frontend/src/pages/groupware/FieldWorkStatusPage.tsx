import { Fragment, useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'
import { EcReportHead, EcReportFoot, reportPeriod, reportDate } from '../../components/EcReportFrame'
import { api, extractErrorMessage } from '../../api/client'
import type { FieldWork, FieldWorkSummary } from '../../types/api'
import { useShortcut } from '../../utils/useShortcut'
import { useAuth } from '../../features/auth/AuthContext'
import FieldWorkFormModal, { type FieldWorkUser } from '../../features/fieldwork/components/FieldWorkFormModal'

/** 원본 기본 기간 — 한 달 전 같은 날 ~ 오늘(2026/09/03 ~ 2026/10/03, 외근조회와 같다). */
const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return ymd(d) }
const num = (v: number) => v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
 * <p>[주행전/주행후 계기판거리]는 두지 않았다 — 원본은 차량 마스터가 계기판 값을 들고 있는데(입력 창에는 그 칸이
 * 없다) 우리에게 차량 마스터가 없다. 운행거리는 외근 한 건에 적은 값이다. 조건의 [기타](도착전내역만보기 ·
 * 모든날짜표시) · [최근30일] · 정렬/소계 [설정] 창도 받쳐 줄 것이 없어 두지 않았다.
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

  useEffect(() => { api.get<FieldWorkUser[]>('/users').then((r) => setUsers(r.data)).catch(() => {}) }, [])

  function reset() {
    setFrom(monthAgo()); setTo(ymd(new Date()))
    setVehicle(''); setUserId(''); setUsePurpose(''); setDistMin(''); setDistMax(''); setRemark('')
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
        .filter((r) => !distMin || Number(r.distance ?? 0) >= Number(distMin))
        .filter((r) => !distMax || Number(r.distance ?? 0) <= Number(distMax))
        .sort((a, b) => (a.workDate < b.workDate ? -1 : a.workDate > b.workDate ? 1 : a.id - b.id))
      setRows(picked)
      setView('result')
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useShortcut('F8', () => void search(), view === 'cond' && !editing)

  /** 차량종류별 묶음 — 원본은 대소문자를 가리지 않고 묶는다. 이름표는 처음 나온 모양을 대문자로. */
  const groups = (() => {
    const m = new Map<string, { label: string; list: FieldWork[] }>()
    for (const r of rows) {
      const name = r.vehicleName ?? r.vehicleNo ?? ''
      const key = name.toUpperCase()
      const g = m.get(key) ?? { label: key, list: [] }
      g.list.push(r)
      m.set(key, g)
    }
    return [...m.values()]
  })()
  const sum = (list: FieldWork[]) => list.reduce((a, r) => a + Number(r.distance ?? 0), 0)

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
          </ul>
          <div className="flex flex-wrap items-center gap-[6px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
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
                <th className="text-right">운행거리</th><th>적요</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : (
                <>
                  {groups.map((g) => (
                    <Fragment key={g.label}>
                      {g.list.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                                    onClick={() => setEditing(r)}>{reportDate(r.workDate)}</button>
                          </td>
                          <td>{r.vehicleName ?? r.vehicleNo ?? ''}</td>
                          <td>{r.userName}</td>
                          <td>{r.usePurpose ?? ''}</td>
                          <td className="text-right">{r.distance != null ? num(Number(r.distance)) : ''}</td>
                          <td>{r.purpose ?? ''}</td>
                        </tr>
                      ))}
                      <tr className="font-bold bg-ec-page">
                        <td colSpan={4} className="text-center">{g.label} 계</td>
                        <td className="text-right">{num(sum(g.list))}</td>
                        <td />
                      </tr>
                    </Fragment>
                  ))}
                  <tr className="font-bold bg-ec-page">
                    <td colSpan={4} className="text-center">합계</td>
                    <td className="text-right">{num(sum(rows))}</td>
                    <td />
                  </tr>
                </>
              )}
            </tbody>
          </table>
          <EcReportFoot />
          <FieldWorkFormModal open={!!editing} record={editing} users={users} myUsername={user?.username}
                              onClose={() => setEditing(null)} onSaved={() => void search()} />
        </>
      )}
    </EcListShell>
  )
}
