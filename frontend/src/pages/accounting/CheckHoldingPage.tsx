import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { BankAccountRow, BankCheck, CheckType } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/** 원본 소계 · 합계줄 모양(2026-10-02 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }

/**
 * 회계 II &gt; 수표관리 &gt; 수령수표 &gt; <b>수령수표현황</b>(E060604) — 2026-10-02 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(<b>하루</b>, 빠른선택 금일 … 전월 · 종료일 · 최근30일 — 기본 [최근30일]의 끝날 = 오늘) · 계정 · 수표번호 ·
 * 수령수표계좌 · 부서 · 프로젝트. 열: 수령일자 · 수표번호 · 거래처명 · 계정명 · 적요 · 금액.
 * 줄은 <b>거래처마다 묶이고</b> 묶음 끝에 '거래처명 [코드] 계' 줄(바탕 회색 · 굵게), 맨 끝에 '합계'. 묶음 안은 수령일 오름차순,
 * 묶음끼리는 가장 늦은 수령일이 위다(실측: 2016/02/28 · 2016/01/15 · 2015/08/30 · 2015/04/01 차례).
 *
 * <p>기준일자에 아직 들고 있는(입금 · 부도 전) 받은수표를 센다 — 받은 날 ≤ 기준일자, 닫힌 날(settledDate)이 없거나 그 뒤.
 * 계정명은 우리 분개가 쓰는 <b>받을수표</b>(104)다 — 원본 회사는 보통예금을 찍었는데 그건 그 회사의 계정 설정이다.
 * 부서 · 프로젝트는 수표(BankCheck)가 들지 않는다.
 *
 * <p><b>발행수표현황</b>(E060608)도 조건 · 열이 같다(조건의 [수령수표계좌] 자리가 [발행수표계좌], 첫 열이 [발행일자]) —
 * 아직 은행에서 안 빠져나간(결제 전) 발행수표다. 계정명은 그 수표를 끊은 계좌의 계정(분개가 대변에 쓰는 것)이다.
 */
export default function CheckHoldingPage({ type }: { type: CheckType }) {
  const received = type === 'RECEIVED'
  const title = received ? '수령수표현황' : '발행수표현황'
  const acctLabel = received ? '수령수표계좌' : '발행수표계좌'
  const account = '받을수표'
  /* 발행수표의 계정명 — 그 수표를 끊은 계좌의 총계정(당좌예금 등). */
  const [glByAccount, setGlByAccount] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    if (received) return
    api.get<BankAccountRow[]>('/bank-cards/accounts')
      .then((r) => setGlByAccount(new Map(r.data.map((a) => [a.id, a.glAccountName]))))
      .catch(() => setGlByAccount(new Map()))
  }, [received])
  const accountOf = (c: BankCheck) => (received ? account : (c.bankAccountId != null ? glByAccount.get(c.bankAccountId) ?? '' : ''))
  const pickers = useCondPickers(['partners'])
  const init = periodOf('최근30일')!
  const [asOf, setAsOf] = useState(init.to)
  const [checkNo, setCheckNo] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [checks, setChecks] = useState<BankCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 기준일자까지 받은 것만 받는다 — 그 뒤에 받은 수표는 그날 들고 있을 수 없다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<BankCheck[]>('/checks', { params: { to: asOf } })
      setChecks(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [asOf, type])

  const held = useMemo(() => checks
    .filter((c) => c.type === type)
    .filter((c) => c.issueDate <= asOf && (!c.settledDate || c.settledDate > asOf))
    .filter((c) => !checkNo || c.checkNo.includes(checkNo))
    .filter((c) => !bankAccount || (c.bankAccountName ?? '') === bankAccount),
  [checks, type, asOf, checkNo, bankAccount])

  const codeOf = (partnerId: number | null) => pickers.partners.find((p) => p.id === partnerId)?.code ?? ''
  const groups = useMemo(() => {
    const by = new Map<string, BankCheck[]>()
    for (const c of held) {
      const k = String(c.partnerId ?? '')
      by.set(k, [...(by.get(k) ?? []), c])
    }
    return [...by.values()]
      .map((cs) => {
        cs.sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : a.checkNo.localeCompare(b.checkNo)))
        return { cs, last: cs[cs.length - 1].issueDate, sum: cs.reduce((a, c) => a + Number(c.amount), 0) }
      })
      .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
  }, [held])
  const total = groups.reduce((a, g) => a + g.sum, 0)
  const accounts = useMemo(() => [...new Set(checks.map((c) => c.bankAccountName).filter(Boolean) as string[])].sort(), [checks])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setAsOf(init.to); setCheckNo(''); setBankAccount('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={asOf} onPick={(r) => setAsOf(r.to)} />
          </span>
        </EcCond>
        {/* 원본 [계정] — 받은수표는 받을수표 하나, 발행수표는 끊은 계좌의 계정이라 계좌 조건이 그 몫을 한다. */}
        <EcCond label="계정">
          <select className="ec-input" value={received ? account : ''} disabled style={{ width: 140 }}>
            <option value={received ? account : ''}>{received ? account : '계좌의 계정'}</option>
          </select>
        </EcCond>
        <EcCond label="수표번호">
          <input className="ec-input" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label={received ? '수령수표계좌' : '발행수표계좌'} pick>
          <CodePickerField label={acctLabel} hideLabel width={200} emptyLabel="전체" value={bankAccount} onChange={setBankAccount}
                           items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
      </ul>

      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 6px' }}>
        {title} <span style={{ fontWeight: 400, color: '#8a929c' }}>{dateText(asOf)}</span>
      </h3>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>{received ? '수령일자' : '발행일자'}</th>
            <th>수표번호</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th>적요</th>
            <th style={{ textAlign: 'right' }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...g.cs.map((c) => (
              <tr key={c.id}>
                <td style={{ textAlign: 'center' }}>{dateText(c.issueDate)}</td>
                <td>{c.checkNo}</td>
                <td>{c.partnerName ?? ''}</td>
                <td>{accountOf(c)}</td>
                <td>{c.remark ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{won(Number(c.amount))}</td>
              </tr>
            )),
            <tr key={`sub-${g.cs[0].id}`} style={SUB_ROW}>
              <td colSpan={5}>{g.cs[0].partnerName ?? ''}{codeOf(g.cs[0].partnerId) ? ` [${codeOf(g.cs[0].partnerId)}]` : ''} 계</td>
              <td style={{ textAlign: 'right' }}>{won(g.sum)}</td>
            </tr>,
          ])}
        </tbody>
        <tfoot>
          <tr style={SUB_ROW}>
            <td colSpan={5}>합계</td>
            <td style={{ textAlign: 'right' }}>{won(total)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
