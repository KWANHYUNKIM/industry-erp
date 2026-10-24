import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { AccountLedger, LedgerRow } from '../../types/api'
import { useAuth } from '../../features/auth/AuthContext'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import CodePickerField from '../../components/CodePickerField'

/** 원본 [YYYY/MM 계] · [합계] 줄: 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

interface AccountOpt { id: number; code: string; name: string }
/** 현금 계정과 [예금포함]으로 더하는 예금 계정(StandardAccounts — 101 현금 · 102 당좌예금 · 103 보통예금). */
const CASH = '101'
const DEPOSITS = ['102', '103']

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>현금출납장</b>(E010801) — 2026-10-03 loginaa 실측(빈 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일</b>, 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일 · 최근30일) · 부서 · 프로젝트 ·
 * 기타([예금포함], 기본 꺼짐). 열: 일자-No. · 상대계정명 · 상대거래처명 · 적요 · 차변금액 · 대변금액 · 잔액.
 *
 * <p>현금(101) 계정의 원장이다. [예금포함]을 켜면 당좌 · 보통예금까지 한 장부로 합쳐 날짜 차례로 잔액을 다시 쌓는다.
 * 상대계정명은 같은 전표의 다른 줄 계정(둘 이상이면 '첫 계정 외 n'), 상대거래처명은 전표의 거래처다.
 * 첫 줄 [이월잔액](기간 첫날 전 잔고, 0 이면 없음 — 줄 모양은 계정별원장을 따랐다, 원본은 이월이 0 인 판만 잼), 달마다 [YYYY/MM 계], 끝 [합계](차변 = 이월 + 차변).
 * 부서 · 프로젝트는 회계전표가 들지 않는다.
 * 2026-10-22 원본 실측: 잔액 칸은 <b>그날 마지막 줄에만</b> 찍는다(이월잔액 줄 · [합계] 줄 꼴은 우리와 같음).
 */
export default function CashBookPage() {
  const { companyName } = useAuth()
  /* 원본 조건 [부서] · [프로젝트] — 서버가 회계전표 줄의 것(V343)으로 거른다. */
  const [dept, setDept] = useState('')
  const [project, setProject] = useState('')
  const deptProject = useDeptProjectItems()
  const dp = { departmentId: dept || undefined, projectId: project || undefined }
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [withDeposit, setWithDeposit] = useState(false)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [ledgers, setLedgers] = useState<AccountLedger[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])

  async function load() {
    const codes = withDeposit ? [CASH, ...DEPOSITS] : [CASH]
    const ids = accounts.filter((a) => codes.includes(a.code)).map((a) => a.id)
    if (ids.length === 0) { setLedgers([]); setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      /* 이월잔액을 내려고 처음부터 끝날까지 받는다(계정별거래처별원장과 같다). */
      const rs = await Promise.all(ids.map((accountId) => api.get<AccountLedger>('/journals/ledger', { params: { ...dp, accountId, from: '1900-01-01', to } })))
      setLedgers(rs.map((r) => r.data))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (accounts.length) void load() }, [dept, project, accounts, from, to, withDeposit])

  /* 여러 계정을 합칠 때는 날짜 · 전표번호 차례로 다시 늘어놓고 잔액(차변 − 대변)을 새로 쌓는다. */
  const { carry, rows } = useMemo(() => {
    const all: LedgerRow[] = ledgers.flatMap((l) => l.rows)
    all.sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    let bal = 0
    for (const r of all) if (r.entryDate < from) bal += Number(r.debit) - Number(r.credit)
    const carry = bal
    return {
      carry,
      rows: all.filter((r) => r.entryDate >= from).map((r, i) => {
        bal += Number(r.debit) - Number(r.credit)
        return { key: `${r.docNo}-${i}`, r, bal }
      }),
    }
  }, [ledgers, from])
  const totalDebit = rows.reduce((s, x) => s + Number(x.r.debit), 0)
  const totalCredit = rows.reduce((s, x) => s + Number(x.r.credit), 0)
  const months = [...new Set(rows.map((x) => x.r.entryDate.slice(0, 7)))]
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '현금출납장', [rows.length])

  return (
    <EcListShell
      title="현금출납장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setDept(''); setProject(''); setFrom(init.from); setTo(init.to); setWithDeposit(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel width={220} emptyLabel="전체" value={dept} onChange={setDept} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={220} emptyLabel="전체" value={project} onChange={setProject} items={deptProject.projects} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={withDeposit} onChange={(e) => setWithDeposit(e.target.checked)} /> 예금포함
          </label>
        </EcCond>
      </ul>

      <div className="flex flex-col text-[12px] mt-0 mx-0 mb-[4px]">
        <span>회사명 : {companyName ?? ''}</span>
        <span>{from.replace(/-/g, '/')} ~ {to.replace(/-/g, '/')}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th>상대계정명</th>
            <th>상대거래처명</th>
            <th>적요</th>
            <th className="text-right">차변금액</th>
            <th className="text-right">대변금액</th>
            <th className="text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 && carry === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {carry !== 0 && (
                <tr className="font-bold">
                  <td colSpan={4} className="text-center">이월잔액</td>
                  <td className="text-right">{won(carry)}</td>
                  <td></td>
                  <td className="text-right">{won(carry)}</td>
                </tr>
              )}
              {months.map((mo) => {
                const ms = rows.filter((x) => x.r.entryDate.startsWith(mo))
                return (
                  <Fragment key={mo}>
                    {ms.map(({ key, r, bal }, i) => (
                      <tr key={key}>
                        <td className="text-center">{dateNo(r.entryDate, r.docNo)}</td>
                        <td>{r.counterAccountName ?? ''}</td>
                        <td>{r.partnerName ?? ''}</td>
                        <td>{r.description ?? ''}</td>
                        <td className="text-right">{won(Number(r.debit))}</td>
                        <td className="text-right">{won(Number(r.credit))}</td>
                        {/* 원본(2026-10-22 실측): 잔액은 그날 마지막 줄에만 찍는다('10/21 -1' 빈칸 · '-25' 잔액, 같은 날 전표가 둘이어도). */}
                        <td className="text-right">{ms[i + 1]?.r.entryDate === r.entryDate ? '' : Math.round(bal).toLocaleString('ko-KR')}</td>
                      </tr>
                    ))}
                    <tr style={SUB_ROW}>
                      <td colSpan={4} className="text-center">{mo.replace('-', '/')} 계</td>
                      <td className="text-right">{won(ms.reduce((s, x) => s + Number(x.r.debit), 0))}</td>
                      <td className="text-right">{won(ms.reduce((s, x) => s + Number(x.r.credit), 0))}</td>
                      <td></td>
                    </tr>
                  </Fragment>
                )
              })}
            </>
          )}
        </tbody>
        {(rows.length > 0 || carry !== 0) && (
          <tfoot>
            {/* 원본(2026-10-20 실측): '2026/10 계 | 5,000 | | ' · '합계 | 5,000 | | 5,000' — 합계 차변 = 이월 + 차변(계정별원장과 같다). */}
            <tr style={SUB_ROW}>
              <td colSpan={4} className="text-center">합계</td>
              <td className="text-right">{won(carry + totalDebit)}</td>
              <td className="text-right">{won(totalCredit)}</td>
              <td className="text-right">{Math.round(carry + totalDebit - totalCredit).toLocaleString('ko-KR')}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
