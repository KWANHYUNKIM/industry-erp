import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { fetchAdjustStatus, slashDate, won, type StatusRow } from '../../features/balanceadjust/api'

const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '최근30일'] as const

/**
 * 회계 I › FastEntry › 잔액조정입력 › <b>잔액조정현황</b>(E010212) — 2026-10-14 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 기준일자(기본 [전월] 2026/09/01 ~ 2026/09/30) · 계정종류 · 부서 · 프로젝트 · 계정 · 거래처 · 양식(기본(수정불가)).
 * 열: 일자 · 계정코드 · 계정명 · 거래처명 · 조정후잔액(차변) · 조정후잔액(대변) · 차이(차변) · 차이(대변) · 적요명.
 * 일자마다 '2026/09/30 계'(일자 칸부터 네 칸을 묶음), 맨 끝 '합계'.
 * 복리후생비(판) 6,620,000 → 6,631,000 이 '2026/09/30 | 8109 | 복리후생비(판) | | 6,631,000 | | 11,000 | | QA회계1 잔액조정' 으로 섰다
 * (차이 = 실잔액 − 장부잔액, 계정의 차대 쪽). 하단 인쇄 · Excel · [실제잔액비교](못 잼 — 두지 않음).
 */
export default function BalanceAdjustStatusPage() {
  const { departments, projects } = useDeptProjectItems()
  const [from, setFrom] = useState(periodOf('전월')!.from)
  const [to, setTo] = useState(periodOf('전월')!.to)
  const [dept, setDept] = useState('')
  const [proj, setProj] = useState('')
  const [account, setAccount] = useState('')
  const [rows, setRows] = useState<StatusRow[] | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      setRows(await fetchAdjustStatus(from, to))
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const groups = useMemo(() => {
    const m = new Map<string, StatusRow[]>()
    for (const r of rows ?? []) {
      if (dept && String(r.departmentId ?? '') !== dept) continue
      if (proj && String(r.projectId ?? '') !== proj) continue
      if (account && !`${r.accountCode} ${r.accountName}`.includes(account)) continue
      m.set(r.entryDate, [...(m.get(r.entryDate) ?? []), r])
    }
    return [...m.entries()]
  }, [rows, dept, proj, account])
  const sum = (rs: StatusRow[], k: 'afterDebit' | 'afterCredit' | 'diffDebit' | 'diffCredit') => rs.reduce((s, r) => s + Number(r[k] ?? 0), 0)
  const all = groups.flatMap(([, g]) => g)
  const cell = (n: number) => (n === 0 ? '' : won(n))
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '잔액조정현황', [all.length])

  return (
    <EcListShell title="잔액조정현황" searchable={false} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자" span={2}>
          <input type="date" className="ec-input w-[145px]" aria-label="시작일" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" aria-label="종료일" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="부서" pick><CodePickerField label="부서" hideLabel width={220} value={dept} onChange={setDept} items={departments} /></EcCond>
        <EcCond label="프로젝트" pick><CodePickerField label="프로젝트" hideLabel width={220} value={proj} onChange={setProj} items={projects} /></EcCond>
        <EcCond label="계정"><input className="ec-input w-[220px]" placeholder="계정" value={account} onChange={(e) => setAccount(e.target.value)} /></EcCond>
        <li className="full">
          <div className="form">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
            <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
          </div>
        </li>
      </ul>

      {rows && (
        <table ref={tableRef} className="ec-report w-full text-left">
          <thead>
            <tr>
              <th>일자</th>
              <th>계정코드</th>
              <th>계정명</th>
              <th>거래처명</th>
              <th className="text-right">조정후잔액(차변)</th>
              <th className="text-right">조정후잔액(대변)</th>
              <th className="text-right">차이(차변)</th>
              <th className="text-right">차이(대변)</th>
              <th>적요명</th>
            </tr>
          </thead>
          <tbody>
            {all.length === 0 ? (
              <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : groups.flatMap(([date, g]) => [
              ...g.map((r, i) => (
                <tr key={`${date}-${i}`}>
                  <td>{slashDate(r.entryDate)}</td>
                  <td>{r.accountCode}</td>
                  <td>{r.accountName}</td>
                  <td>{r.partnerName ?? ''}</td>
                  <td className="text-right">{won(r.afterDebit)}</td>
                  <td className="text-right">{won(r.afterCredit)}</td>
                  <td className="text-right">{won(r.diffDebit)}</td>
                  <td className="text-right">{won(r.diffCredit)}</td>
                  <td>{r.memo ?? ''}</td>
                </tr>
              )),
              <tr key={`${date}-s`} className="ec-list-total">
                <td colSpan={4}>{slashDate(date)} 계</td>
                <td className="text-right">{cell(sum(g, 'afterDebit'))}</td>
                <td className="text-right">{cell(sum(g, 'afterCredit'))}</td>
                <td className="text-right">{cell(sum(g, 'diffDebit'))}</td>
                <td className="text-right">{cell(sum(g, 'diffCredit'))}</td>
                <td />
              </tr>,
            ])}
          </tbody>
          {all.length > 0 && (
            <tfoot>
              <tr className="ec-list-total">
                <td colSpan={4}>합계</td>
                <td className="text-right">{cell(sum(all, 'afterDebit'))}</td>
                <td className="text-right">{cell(sum(all, 'afterCredit'))}</td>
                <td className="text-right">{cell(sum(all, 'diffDebit'))}</td>
                <td className="text-right">{cell(sum(all, 'diffCredit'))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </EcListShell>
  )
}
