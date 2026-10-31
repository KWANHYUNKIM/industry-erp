import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { fetchBonds, useBondMasters } from '../../features/bond/api'
import BondEntryModal from '../../features/bond/components/BondEntryModal'
import { BOND_STATUS_PICKS } from '../../features/bond/ledger'
import { bondKey, flatten, signed, sideWord, type BondRow, type BondSide } from '../../features/bond/types'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmount } from '../../utils/format'

interface Bond {
  key: string
  head: BondRow
  issue: BondRow | null
  opening: number
  lines: { r: BondRow; balance: number }[]
  inc: number
  dec: number
  closing: number
}

/**
 * 회계 II › 채권관리 › <b>거래처채권관리대장</b>(N000007) · <b>거래처채권집계관리대장</b>(N000045) · 채무관리의 같은 둘 — 2026-10-12 loginaa 실측.
 *
 * <p>조건(펼쳐 둠): 기준일자(기본 <b>금월(~오늘)</b> — 2026/10/01 ~ 2026/10/12) · 계정 · 채권번호 · 거래처. 적용양식 '현황_집계'.
 * 거래처마다 <b>표 하나</b>(머리줄이 거래처마다 다시 나온다), 거래처코드 차례(1113388888 → 1234567004 → …). 각 표 끝 '총합계'.
 * <ul>
 *   <li>관리대장 — 열: 일자 · 채권번호 · 적요 · 채권 만기일자 · 증가금액 · 감소금액 · 잔액. 채권번호마다 '{번호} 이월잔액' 줄(있을 때) →
 *       기간 안의 줄(잔액은 그 번호 안에서 누계). 김치좋아: 150505053650291 이월잔액 98,000 · 2026/10/12 증가 50,000 잔액 50,000 · 총합계 50,000 / 148,000.</li>
 *   <li>집계관리대장 — 열: 발생일자 · 채권번호 · 적요 · 만기일자 · 이월잔액 · 증가금액 · 감소금액 · 잔액. 채권번호 한 줄씩.
 *       총합계 줄의 이월잔액 칸은 비어 있다(원본 그대로).</li>
 * </ul>
 * 버튼줄 인쇄 · Excel(화면) · Email · 자동알림 — Email · 자동알림은 바깥으로 보내는 기능이라 두지 않는다.
 *
 * <p>2026-10-13 다시 잼: 격자는 출력물(.ec-report)이 아니라 <b>조회 목록 격자(table-list)</b> — 머리 700 · 33.8, 줄 28.4,
 * '이월잔액' · '총합계' 줄 700 · 바탕 247(이월잔액 이름 칸만 243), 표 사이 9. 관리대장의 [일자] 는 링크(남색) →
 * '채권내역입력(수정)' 창. 가운데: 일자 · 만기일자, 왼쪽: 채권번호 · 적요. 기간을 전일(10/12)로 하면 10/13 줄은 빠진다.
 * 거래처채권관리대장인쇄의 [거래처코드] · [인쇄] 는 이 화면(집계)을 그 거래처로 연다(?partners=).
 */
export default function BondPartnerLedgerPage({ side, summary = false }: { side: BondSide; summary?: boolean }) {
  const word = sideWord(side)
  const title = `거래처${word}${summary ? '집계' : ''}관리대장`
  const init = periodOf('금월(~오늘)')!
  const masters = useBondMasters()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [from, setFrom] = useState(params.get('from') ?? init.from)
  const [to, setTo] = useState(params.get('to') ?? init.to)
  const [account, setAccount] = useState('')
  const [bondNo, setBondNo] = useState('')
  const [partner, setPartner] = useState('')
  const only = useMemo(() => new Set((params.get('partners') ?? '').split(',').filter(Boolean)), [params])
  const [modal, setModal] = useState<number | null>(null)
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

  const partners = useMemo(() => {
    const bonds = new Map<string, Bond>()
    const sorted = rows
      .filter((r) => r.entryDate <= to)
      .filter((r) => !account || String(r.accountId) === account)
      .filter((r) => !bondNo || r.bondNo.includes(bondNo))
      .filter((r) => !partner || String(r.partnerId) === partner)
      .filter((r) => only.size === 0 || only.has(String(r.partnerId)))
      .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.entryNo - b.entryNo || a.lineNo - b.lineNo))
    for (const r of sorted) {
      const k = bondKey(r)
      let g = bonds.get(k)
      if (!g) { g = { key: k, head: r, issue: null, opening: 0, lines: [], inc: 0, dec: 0, closing: 0 }; bonds.set(k, g) }
      if (!g.issue && r.direction === 'INCREASE') g.issue = r
      if (r.entryDate < from) { g.opening += signed(r); g.closing = g.opening; continue }
      g.closing += signed(r)
      if (r.direction === 'INCREASE') g.inc += Number(r.amount)
      else g.dec += Number(r.amount)
      g.lines.push({ r, balance: g.closing })
    }
    const byPartner = new Map<string, { code: string; bonds: Bond[] }>()
    for (const g of bonds.values()) {
      if (g.lines.length === 0 && Math.round(g.opening) === 0) continue
      const k = String(g.head.partnerId ?? '')
      const p = byPartner.get(k) ?? { code: g.head.partnerCode ?? '', bonds: [] }
      p.bonds.push(g)
      byPartner.set(k, p)
    }
    return [...byPartner.entries()]
      .sort((a, b) => a[1].code.localeCompare(b[1].code))
      .map(([k, p]) => ({ key: k, bonds: p.bonds.sort((a, b) => a.head.bondNo.localeCompare(b.head.bondNo)) }))
  }, [rows, from, to, account, bondNo, partner, only])
  const cell = (n: number) => (n ? fmtAmount(n) : '')
  const day = (d: string | null | undefined) => (d ? d.replaceAll('-', '/') : '')

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
            <EcPeriodPicks labels={BOND_STATUS_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
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

      {loading ? <p className="ec-empty">불러오는 중…</p>
        : partners.length === 0 ? <p className="ec-empty">등록된 데이터가 없습니다.</p>
        : partners.map((p) => {
          const inc = p.bonds.reduce((a, g) => a + g.inc, 0)
          const dec = p.bonds.reduce((a, g) => a + g.dec, 0)
          const bal = p.bonds.reduce((a, g) => a + g.closing, 0)
          return summary ? (
            <table key={p.key} className="ec-head700 w-full text-left mb-[9px]">
              <thead>
                <tr>
                  <th className="text-center">발생일자</th>
                  <th>{word}번호</th>
                  <th>적요</th>
                  <th className="text-center">만기일자</th>
                  <th className="text-right">이월잔액</th>
                  <th className="text-right">증가금액</th>
                  <th className="text-right">감소금액</th>
                  <th className="text-right">잔액</th>
                </tr>
              </thead>
              <tbody>
                {p.bonds.map((g) => (
                  <tr key={g.key}>
                    <td className="text-center">{day(g.issue?.entryDate ?? g.head.entryDate)}</td>
                    <td>{g.head.bondNo}</td>
                    <td>{g.issue?.memo ?? ''}</td>
                    <td className="text-center">{day(g.issue?.dueDate)}</td>
                    <td className="text-right">{cell(g.opening)}</td>
                    <td className="text-right">{cell(g.inc)}</td>
                    <td className="text-right">{cell(g.dec)}</td>
                    <td className="text-right">{fmtAmount(g.closing)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="ec-list-total [&_td]:!font-bold">
                  <td colSpan={4} className="text-center">총합계</td>
                  <td className="text-center" />
                  <td className="text-right">{cell(inc)}</td>
                  <td className="text-right">{cell(dec)}</td>
                  <td className="text-right">{fmtAmount(bal)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table key={p.key} className="ec-head700 w-full text-left mb-[9px]">
              <thead>
                <tr>
                  <th className="text-center">일자</th>
                  <th>{word}번호</th>
                  <th>적요</th>
                  <th className="text-center">{word} 만기일자</th>
                  <th className="text-right">증가금액</th>
                  <th className="text-right">감소금액</th>
                  <th className="text-right">잔액</th>
                </tr>
              </thead>
              <tbody>
                {p.bonds.flatMap((g) => [
                  ...(Math.round(g.opening) !== 0 ? [
                    <tr key={`${g.key}-o`} className="ec-list-total [&_td]:!font-bold">
                      <td colSpan={4} className="text-center !bg-[var(--ec-report-stripe)]">{g.head.bondNo} 이월잔액</td>
                      <td /><td />
                      <td className="text-right">{fmtAmount(g.opening)}</td>
                    </tr>,
                  ] : []),
                  ...g.lines.map(({ r, balance }) => (
                    <tr key={r.id}>
                      <td className="text-center">
                        <button type="button" className="ec-link"
                                onClick={() => (r.journalEntryId != null
                                  ? navigate(`/accounting/vouchers?journal=${r.journalEntryId}`)
                                  : setModal(r.entryId))}>{day(r.entryDate)}</button>
                      </td>
                      <td>{r.bondNo}</td>
                      <td>{r.memo ?? ''}</td>
                      <td className="text-center">{day(r.dueDate)}</td>
                      <td className="text-right">{r.direction === 'INCREASE' ? fmtAmount(Number(r.amount)) : ''}</td>
                      <td className="text-right">{r.direction === 'DECREASE' ? fmtAmount(Number(r.amount)) : ''}</td>
                      <td className="text-right">{fmtAmount(balance)}</td>
                    </tr>
                  )),
                ])}
              </tbody>
              <tfoot>
                <tr className="ec-list-total [&_td]:!font-bold">
                  <td colSpan={4} className="text-center">총합계</td>
                  <td className="text-right">{cell(inc)}</td>
                  <td className="text-right">{cell(dec)}</td>
                  <td className="text-right">{fmtAmount(bal)}</td>
                </tr>
              </tfoot>
            </table>
          )
        })}
      <BondEntryModal side={side} open={modal != null} entryId={modal} masters={masters}
                      onClose={() => setModal(null)} onSaved={() => void load()} />
    </EcListShell>
  )
}
