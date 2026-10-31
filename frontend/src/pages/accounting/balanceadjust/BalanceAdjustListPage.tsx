import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import EcPeriodPicks, { periodOf, ymd } from '../../../components/EcPeriodPicks'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { adjustNo, deleteAdjustments, fetchAdjustments, slashDate, type AdjustmentRow } from '../../../features/balanceadjust/api'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import { fmtAmountOrBlank } from '../../../utils/format'

const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '전월+금월', '이번기수', '직전기수', '종료일'] as const

/**
 * 회계 I › FastEntry › 잔액조정입력 › <b>잔액조정조회</b>(E010210) · <b>잔액실사조회</b>(E010211) — 2026-10-14 loginaa 실측.
 *
 * <p>둘 다 잔액조정 전표 한 장이 한 줄이다(QA회계1 복리후생비(판) 6,620,000 → 6,631,000 한 건이 두 화면에 똑같이 섰다).
 * <ul>
 *   <li>잔액조정조회: ☐ · 잔액조정번호('2026/09/30 -16') · 계정명 · 장부가액 · 실가액 · 인쇄 / 하단 신규(F2) · 인쇄 · 선택삭제.</li>
 *   <li>잔액실사조회: ☐ · 구분('계정별') · 전표일자 · 계정명 · 장부가액 · 실가액 · 회계전표('2026/09/30 -16') / 하단 신규(F2) · 선택삭제.</li>
 * </ul>
 * 조건: 기준일자(기본 전월 1일 ~ 오늘 — 10/14 에 2026/09/01 ~ 2026/10/14) · 부서 · 프로젝트 · 거래처 · 계정 · 금액 ~ · 적요.
 * [선택삭제] → '선택한 전표를 삭제 하겠습니까?' [확인] → 목록에서 빠지고 잔액조정입력의 잔액이 장부잔액으로 돌아간다.
 * [신규(F2)] 는 잔액조정입력으로 간다. 거래처 · 부서 · 프로젝트 조건은 우리 잔액조정이 계정별(부서 · 프로젝트 묶음)만이라 아직 없다.
 */
export default function BalanceAdjustListPage({ audit = false }: { audit?: boolean }) {
  const title = audit ? '잔액실사조회' : '잔액조정조회'
  const navigate = useNavigate()
  const [from, setFrom] = useState(periodOf('전월')!.from)
  const [to, setTo] = useState(ymd(new Date()))
  const [account, setAccount] = useState('')
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [memo, setMemo] = useState('')
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<AdjustmentRow[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchAdjustments(from, to))
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const shown = useMemo(() => rows
    .filter((r) => !account || (r.accountName ?? '').includes(account) || (r.accountCode ?? '').includes(account))
    .filter((r) => !amountFrom || Number(r.actualAmount) >= Number(amountFrom))
    .filter((r) => !amountTo || Number(r.actualAmount) <= Number(amountTo))
    .filter((r) => !memo || (r.memo ?? '').includes(memo))
    .filter((r) => !keyword || `${adjustNo(r.docNo)} ${r.accountName ?? ''} ${r.memo ?? ''}`.includes(keyword)),
  [rows, account, amountFrom, amountTo, memo, keyword])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length])

  const toggle = (id: number, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  async function removePicked() {
    if (picked.size === 0) { await ecAlert('리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    try {
      await deleteAdjustments([...picked])
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const cols = audit ? 7 : 6
  return (
    <EcListShell
      title={title}
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={() => void load()}
      onNew={() => navigate('/accounting/balance-adjust')}
      actions={[
        ...(audit ? [] : [{ label: '인쇄' }]),
        { label: '선택삭제', selected: picked.size, onClick: () => void removePicked() },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자" span={2}>
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "시작일", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "종료일", value: to, onChange: (e) => setTo(e.target.value) }} />
        </EcCond>
        <EcCond label="계정"><input className="ec-input w-[220px]" placeholder="계정" value={account} onChange={(e) => setAccount(e.target.value)} /></EcCond>
        <EcCond label="금액">
          <input className="ec-input w-[100px] text-right" placeholder="금액" value={amountFrom} onChange={(e) => setAmountFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input className="ec-input w-[100px] text-right" aria-label="금액 끝" value={amountTo} onChange={(e) => setAmountTo(e.target.value)} />
        </EcCond>
        <EcCond label="적요"><input className="ec-input w-[220px]" placeholder="적요" value={memo} onChange={(e) => setMemo(e.target.value)} /></EcCond>
        <li className="full">
          <div className="form">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
            <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
          </div>
        </li>
      </ul>

      <table ref={tableRef} className="ec-head700 w-full text-left">
        <thead>
          <tr>
            <th className="w-[38px] text-center">
              <input type="checkbox" aria-label="전체선택" checked={shown.length > 0 && shown.every((r) => picked.has(r.entryId))}
                     onChange={(e) => shown.forEach((r) => toggle(r.entryId, e.target.checked))} />
            </th>
            {audit ? <><th>구분</th><th>전표일자</th></> : <th>잔액조정번호</th>}
            <th>계정명</th>
            <th className="text-right">장부가액</th>
            <th className="text-right">실가액</th>
            <th className="text-center">{audit ? '회계전표' : '인쇄'}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.entryId}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${adjustNo(r.docNo)} 선택`} checked={picked.has(r.entryId)} onChange={(e) => toggle(r.entryId, e.target.checked)} />
              </td>
              {audit ? <><td>계정별</td><td>{slashDate(r.entryDate)}</td></> : <td className="text-ec-navy">{adjustNo(r.docNo)}</td>}
              <td>{r.accountName ?? ''}</td>
              <td className="text-right">{fmtAmountOrBlank(r.bookAmount)}</td>
              <td className="text-right">{fmtAmountOrBlank(r.actualAmount)}</td>
              <td className="text-center">
                {audit
                  ? <button type="button" className="ec-link" onClick={() => navigate(`/accounting/journals?entryId=${r.entryId}`)}>{adjustNo(r.docNo)}</button>
                  : <span className="text-ec-navy">인쇄</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
