import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import type { BankAccountRow, BankCheck, CheckType } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 소계 · 누계줄 모양(2026-10-02 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }

interface Move { date: string; kind: '증가' | '감소'; inc: number; dec: number }

/**
 * 회계 II &gt; 수표관리 &gt; 수령수표 &gt; <b>수령수표거래내역</b>(E060613) — 2026-10-02 loginaa 실측(자료가 든 판, 기간을 2015년까지 넓혀 쟀다).
 *
 * <p>조건: 기준일자(구간, 기본 [최근30일]) · 계정 · 수표번호 · 수령수표계좌 · 부서 · 프로젝트 · 잔액([잔액(수표)] [0 포함]).
 * 열: 일자 · 증감구분 · 수표번호 · 수령수표계좌코드 · 거래처명 · 계정명 · 부서명 · 프로젝트명 · 적요 · 증가금액 · 감소금액 · 잔액.
 *
 * <p>줄 모양(실측): <b>수표 하나가 한 묶음</b>(수표번호 오름차순). 기간 앞에 들고 있던 수표는 맨 위에 <b>'이월잔액'</b> 줄(잔액 칸에만
 * 값), 그 아래 기간 안 움직임(받은 날 증가 · 입금 · 부도 날 감소)과 그때의 잔액, 묶음 끝에 '계정명 / 수표번호 계' 줄(증가 · 감소 합,
 * 바탕 회색 · 굵게), 맨 끝 '누계'. 원본은 기간 앞 수표가 이월 줄만 남고 움직임이 없어도 묶음을 보인다([0 포함]).
 *
 * <p>부서 · 프로젝트는 수표에 없어 조건도 열(부서명 · 프로젝트명)도 두지 않는다 — 열만 세우면 늘 빈칸이다.
 * 계정명은 우리 분개가 쓰는 받을수표(104). 수령수표계좌코드는 입금한 계좌의 계좌번호다.
 *
 * <p><b>발행수표거래내역</b>(E060614)도 조건 · 열이 같다([발행수표계좌] · [발행수표계좌코드]). 발행한 날 증가, 은행에서 빠져나간(결제완료)
 * 날 감소. 계정명은 끊은 계좌의 총계정, 계좌코드는 그 계좌번호다.
 */
export default function CheckLedgerPage({ type }: { type: CheckType }) {
  const received = type === 'RECEIVED'
  const title = received ? '수령수표거래내역' : '발행수표거래내역'
  const acctLabel = received ? '수령수표계좌' : '발행수표계좌'
  const account = '받을수표'
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [checkNo, setCheckNo] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  /* 원본 [잔액]의 [0 포함] 태그 — 켜진 채 열린다. 끄면 기간 끝 잔액이 0 인 수표(다 입금 · 부도된 것)를 뺀다. */
  const [withZero, setWithZero] = useState(true)
  const [checks, setChecks] = useState<BankCheck[]>([])
  const [acctNo, setAcctNo] = useState<Map<number, string>>(new Map())
  const [glByAccount, setGlByAccount] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /* 기간 끝날까지 받은 수표를 받는다 — 이월(기간 앞에 받은 것)과 기간 안 움직임을 둘 다 세려면 시작날로 자르면 안 된다. */
  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, a] = await Promise.all([
        api.get<BankCheck[]>('/checks', { params: { to } }),
        api.get<BankAccountRow[]>('/bank-cards/accounts').catch(() => ({ data: [] as BankAccountRow[] })),
      ])
      setChecks(r.data)
      setAcctNo(new Map(a.data.map((x) => [x.id, x.accountNo])))
      setGlByAccount(new Map(a.data.map((x) => [x.id, x.glAccountName])))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, type])

  const groups = useMemo(() => checks
    .filter((c) => c.type === type)
    .filter((c) => !checkNo || c.checkNo.includes(checkNo))
    .filter((c) => !bankAccount || (c.bankAccountName ?? '') === bankAccount)
    .map((c) => {
      const amt = Number(c.amount)
      const opening = c.issueDate < from && (!c.settledDate || c.settledDate >= from) ? amt : 0
      const moves: Move[] = []
      if (c.issueDate >= from && c.issueDate <= to) moves.push({ date: c.issueDate, kind: '증가', inc: amt, dec: 0 })
      if (c.settledDate && c.settledDate >= from && c.settledDate <= to) moves.push({ date: c.settledDate, kind: '감소', inc: 0, dec: amt })
      let bal = opening
      const lines = moves.map((m) => { bal += m.inc - m.dec; return { ...m, bal } })
      return { c, opening, lines, bal, inc: lines.reduce((a, l) => a + l.inc, 0), dec: lines.reduce((a, l) => a + l.dec, 0) }
    })
    .filter((g) => g.opening !== 0 || g.lines.length > 0)
    .filter((g) => withZero || g.bal !== 0)
    .sort((a, b) => a.c.checkNo.localeCompare(b.c.checkNo)),
  [checks, type, from, to, checkNo, bankAccount, withZero])
  const total = groups.reduce((a, g) => ({ inc: a.inc + g.inc, dec: a.dec + g.dec }), { inc: 0, dec: 0 })
  const accounts = useMemo(() => [...new Set(checks.filter((c) => c.type === type).map((c) => c.bankAccountName).filter(Boolean) as string[])].sort(), [checks, type])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length])

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setCheckNo(''); setBankAccount(''); setWithZero(true) } },
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
        <EcCond label="잔액">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={withZero} onChange={(e) => setWithZero(e.target.checked)} /> 0 포함
          </label>
        </EcCond>
      </ul>

      <h3 className="text-[13px] font-bold mt-[4px] mx-0 mb-[6px]">
        {title} <span className="font-normal text-ec-hint">{dateText(from)} ~ {dateText(to)}</span>
      </h3>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자</th>
            <th className="text-center">증감구분</th>
            <th>수표번호</th>
            <th>{received ? '수령수표계좌코드' : '발행수표계좌코드'}</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th>적요</th>
            <th className="text-right">증가금액</th>
            <th className="text-right">감소금액</th>
            <th className="text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...(g.opening !== 0 ? [
              <tr key={`${g.c.id}-open`}>
                <td colSpan={9}>이월잔액</td>
                <td className="text-right">{won(g.opening)}</td>
              </tr>,
            ] : []),
            ...g.lines.map((l, i) => (
              <tr key={`${g.c.id}-${i}`}>
                <td className="text-center">{dateText(l.date)}</td>
                <td className="text-center">{l.kind}</td>
                <td>{g.c.checkNo}</td>
                <td>{g.c.bankAccountId != null ? acctNo.get(g.c.bankAccountId) ?? '' : ''}</td>
                <td>{g.c.partnerName ?? ''}</td>
                <td>{received ? account : (g.c.bankAccountId != null ? glByAccount.get(g.c.bankAccountId) ?? '' : '')}</td>
                <td>{g.c.remark ?? ''}</td>
                <td className="text-right">{won(l.inc)}</td>
                <td className="text-right">{won(l.dec)}</td>
                <td className="text-right">{Math.round(l.bal).toLocaleString('ko-KR')}</td>
              </tr>
            )),
            <tr key={`${g.c.id}-sub`} style={SUB_ROW}>
              <td colSpan={7}>{received ? account : (g.c.bankAccountId != null ? glByAccount.get(g.c.bankAccountId) ?? '' : '')} / {g.c.checkNo} 계</td>
              <td className="text-right">{won(g.inc)}</td>
              <td className="text-right">{won(g.dec)}</td>
              <td></td>
            </tr>,
          ])}
        </tbody>
        <tfoot>
          <tr style={SUB_ROW}>
            <td colSpan={7}>누계</td>
            <td className="text-right">{won(total.inc)}</td>
            <td className="text-right">{won(total.dec)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
