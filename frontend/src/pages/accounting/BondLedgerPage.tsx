import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import { BOND_FLOW_PICKS } from '../../features/bond/ledger'
import { bondKey, dateNo, flatten, signed, sideWord, type BondRow, type BondSide } from '../../features/bond/types'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmount } from '../../utils/format'

interface Group {
  key: string
  head: BondRow
  opening: number
  lines: { r: BondRow; balance: number }[]
  inc: number
  dec: number
  closing: number
}

/**
 * 회계 II › 채권관리 › <b>채권거래내역</b>(E060405) · 채무관리 › 채무거래내역 — 2026-10-12 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 기준일자(기본 <b>최근30일</b> — 2026/09/12 ~ 2026/10/12) · 계정 · 채권번호 · 거래처.
 * 열: 일자-No. · 증감구분 · 채권번호 · 거래처명 · 계정명 · 부서명 · 프로젝트명 · 적요 · (이름 없는 열) · 증가금액 · 감소금액 · 잔액.
 * 채권(계정 · 거래처 · 채권번호)마다 '{채권번호} 이월잔액' 줄 → 기간 안의 줄(잔액은 누계) → '1089(외상매출금) / 1234567004(김치좋아) / {채권번호} 계'.
 * 묶음 차례는 거래처코드 · 채권번호. 맨 끝 '총합계'(증가 · 감소 합 · 잔액 합). 버튼줄 인쇄 · Excel(화면).
 * 증가 50,000 → 감소 20,000 이면 잔액 50,000 → 30,000, 계 50,000 · 20,000 · 30,000.
 *
 * <p>원본 [대표거래처합산](거래처관계기준 · 개별거래처기준)은 두지 않았다 — 채권내역은 거래처 하나에 붙고 대표거래처로 묶는 화면이 아직 없다.
 */
export default function BondLedgerPage({ side }: { side: BondSide }) {
  const word = sideWord(side)
  const title = `${word}거래내역`
  const init = periodOf('최근30일')!
  const masters = useBondMasters()
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [account, setAccount] = useState('')
  const [bondNo, setBondNo] = useState('')
  const [partner, setPartner] = useState('')
  const [rows, setRows] = useState<BondRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(flatten(await fetchBonds(side, to)))
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [side, to])

  const groups = useMemo(() => {
    const m = new Map<string, Group>()
    const sorted = rows
      .filter((r) => r.entryDate <= to)
      .filter((r) => !account || String(r.accountId) === account)
      .filter((r) => !bondNo || r.bondNo.includes(bondNo))
      .filter((r) => !partner || String(r.partnerId) === partner)
      .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.entryNo - b.entryNo || a.lineNo - b.lineNo))
    for (const r of sorted) {
      const k = bondKey(r)
      let g = m.get(k)
      if (!g) { g = { key: k, head: r, opening: 0, lines: [], inc: 0, dec: 0, closing: 0 }; m.set(k, g) }
      if (r.entryDate < from) { g.opening += signed(r); g.closing = g.opening; continue }
      g.closing += signed(r)
      if (r.direction === 'INCREASE') g.inc += Number(r.amount)
      else g.dec += Number(r.amount)
      g.lines.push({ r, balance: g.closing })
    }
    return [...m.values()]
      .filter((g) => g.lines.length > 0 || Math.round(g.opening) !== 0)
      .sort((a, b) => (a.head.partnerCode ?? '').localeCompare(b.head.partnerCode ?? '') || a.head.bondNo.localeCompare(b.head.bondNo))
  }, [rows, from, to, account, bondNo, partner])
  const sum = groups.reduce((a, g) => ({ inc: a.inc + g.inc, dec: a.dec + g.dec, bal: a.bal + g.closing }), { inc: 0, dec: 0, bal: 0 })
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [groups.length])
  const cell = (n: number) => (n ? fmtAmount(n) : '')

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시작성', onClick: () => { setFrom(init.from); setTo(init.to); setAccount(''); setBondNo(''); setPartner('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={BOND_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} value={account} onChange={setAccount} items={masters.accounts} />
        </EcCond>
        <EcCond label={`${word}번호`}>
          <input className="ec-input w-[220px]" placeholder={`${word}번호`} value={bondNo} onChange={(e) => setBondNo(e.target.value)} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} value={partner} onChange={setPartner} items={masters.partners} />
        </EcCond>
      </ul>

      <p className="text-[12px] mb-[4px]">회사명 :</p>
      <table ref={tableRef} className="ec-report w-full text-left">
        <thead>
          <tr>
            <th>일자-No.</th>
            <th>증감구분</th>
            <th>{word}번호</th>
            <th>거래처명</th>
            <th>계정명</th>
            <th>부서명</th>
            <th>프로젝트명</th>
            <th>적요</th>
            <th />
            <th className="text-right">증가금액</th>
            <th className="text-right">감소금액</th>
            <th className="text-right">잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.flatMap((g) => [
            ...(Math.round(g.opening) !== 0 ? [
              <tr key={`${g.key}-o`} className="ec-total">
                <td colSpan={9} className="text-center">{g.head.bondNo} 이월잔액</td>
                <td /><td />
                <td className="text-right">{fmtAmount(g.opening)}</td>
              </tr>,
            ] : []),
            ...g.lines.map(({ r, balance }) => (
              <tr key={r.id}>
                <td>{dateNo(r)}</td>
                <td>{r.direction === 'INCREASE' ? '증가' : '감소'}</td>
                <td>{r.bondNo}</td>
                <td>{r.partnerName ?? ''}</td>
                <td>{r.accountName}</td>
                <td>{masters.deptName(r.departmentId)}</td>
                <td>{r.projectName ?? ''}</td>
                <td>{r.memo ?? ''}</td>
                <td />
                <td className="text-right">{r.direction === 'INCREASE' ? fmtAmount(Number(r.amount)) : ''}</td>
                <td className="text-right">{r.direction === 'DECREASE' ? fmtAmount(Number(r.amount)) : ''}</td>
                <td className="text-right">{fmtAmount(balance)}</td>
              </tr>
            )),
            <tr key={`${g.key}-s`} className="ec-total">
              <td colSpan={9}>
                {g.head.accountCode}({g.head.accountName}) / {g.head.partnerCode ?? ''}({g.head.partnerName ?? ''}) / {g.head.bondNo} 계
              </td>
              <td className="text-right">{cell(g.inc)}</td>
              <td className="text-right">{cell(g.dec)}</td>
              <td className="text-right">{fmtAmount(g.closing)}</td>
            </tr>,
          ])}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={9}>총합계</td>
              <td className="text-right">{cell(sum.inc)}</td>
              <td className="text-right">{cell(sum.dec)}</td>
              <td className="text-right">{fmtAmount(sum.bal)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
