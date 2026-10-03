import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [계정 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게, 앞 두 칸 묶음. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')
/** 자금현황표 원본 기준 PICKS — 결산 묶음(… 이번기수 · 직전기수 · 종료일) 뒤에 최근30일(기본). */
const FUND_STATUS_PICKS = [...SETTLE_PICKS, '최근30일'] as const

/**
 * 원본이 이 표에 넣는 계정(2026-10-03 실측 — 보통예금 · 외상매출금 · 미수금 · 가지급금 · 외상매입금 · 미지급금). 원본은 회사가 고른
 * '자금관리 계정' 이지만 우리는 그 설정이 없어, 원본 판에 나온 계정 이름에 현금 · 당좌예금을 더해 고정으로 둔다.
 */
const FUND_ACCOUNTS = ['현금', '당좌예금', '보통예금', '외상매출금', '미수금', '가지급금', '외상매입금', '미지급금']

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; code: string; name: string; parentId: number | null }
interface Cell { carry: number; inc: number; dec: number }
interface Line extends Cell { key: string; partner: string; code: string }
interface Block extends Cell { accCode: string; accName: string; lines: Line[] }
interface BankTxn { journalEntryId: number | null; bankAccountId: number }
interface BankAccount { id: number; name: string | null; bankName: string | null; accountNo: string | null }
/** 현금 · 당좌 · 보통예금 — 이 줄의 거래처 자리는 전표의 거래처가 아니라 통장(현금은 '[ ]')이다. 자금일보와 같은 가름. */
const CASH_CODES = ['101', '102', '103']
/** 통장 이름 — 등록한 통장명, 없으면 원본 모양 '은행명-계좌끝4자리'(원본 예: 기업은행-1122). */
const bookLabel = (a: BankAccount) => a.name || `${a.bankName ?? ''}-${(a.accountNo ?? '').replace(/\D/g, '').slice(-4)}`

/**
 * 회계 I &gt; 경영자료 &gt; <b>자금현황표</b>(E010804) — 2026-10-03 loginaa 실측(자료가 든 판, 최근30일).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일</b>, 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일 · 최근30일) · 부서 · 프로젝트 ·
 * 기타([결재방표시]) · 대표거래처로 합산(<b>거래처관계기준</b> | 개별거래처기준).
 *
 * <p>한 표 — 계정명 · 거래처명 · 이월잔액[외화] · 증가[외화] · 감소[외화] · 금일잔액[외화] · 거래처코드 · 계정코드(자금일보와 끝 두 칸 차례가
 * 반대다). 계정마다 거래처별 줄(계정명은 첫 줄에만), [계정 계], 끝 [합계]. 잔액은 계정 구분과 상관없이 <b>차변 − 대변</b>으로 쌓는다 —
 * 원본에서 외상매입금 · 미지급금도 그렇게 찍혔다(외상매입금 계 −518,824,300). 거래처 없는 줄은 '[ ]'.
 * 현금 · 예금 줄의 거래처 자리는 자금일보처럼 통장(계좌 입출금이 가리키는 전표로 찾음, 현금은 '[ ]')이다 — 전표의 거래처를 쓰면
 * 외상 수금 입금이 '보통예금 / 한울ICT' 로 갈라져 통장 잔액을 볼 수가 없었다.
 * 외화는 회계전표가 외화 금액을 들지 않아 원화만. 부서 · 프로젝트는 회계전표에 없다.
 */
export default function FundStatusPage() {
  const { companyName } = useAuth()
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [byParent, setByParent] = useState(true)
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [bookOf, setBookOf] = useState<Map<number, { id: number; label: string; no: string }>>(new Map())
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, t, a] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from: '1900-01-01', to, all: true } }),
        api.get<{ rows: BankTxn[] }>('/bank-cards/transactions', { params: { all: true, from: '1900-01-01', to } }).catch(() => ({ data: { rows: [] as BankTxn[] } })),
        api.get<BankAccount[]>('/bank-cards/accounts').catch(() => ({ data: [] as BankAccount[] })),
      ])
      const acc = new Map(a.data.map((x) => [x.id, x]))
      setBookOf(new Map(t.data.rows.filter((x) => x.journalEntryId != null && acc.has(x.bankAccountId))
        .map((x) => { const b = acc.get(x.bankAccountId)!; return [x.journalEntryId!, { id: b.id, label: bookLabel(b), no: b.accountNo ?? '' }] })))
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const blocks = useMemo(() => {
    const pById = new Map(partners.map((p) => [p.id, p]))
    const m = new Map<string, Block>()
    for (const e of entries) {
      let pid = e.partnerId
      if (byParent && pid != null && pById.get(pid)?.parentId) pid = pById.get(pid)!.parentId
      const p = pid != null ? pById.get(pid) : undefined
      for (const l of e.lines) {
        if (!FUND_ACCOUNTS.includes(l.accountName)) continue
        if (!m.has(l.accountCode)) m.set(l.accountCode, { accCode: l.accountCode, accName: l.accountName, carry: 0, inc: 0, dec: 0, lines: [] })
        const b = m.get(l.accountCode)!
        const cash = CASH_CODES.includes(l.accountCode)
        const bk = cash && l.accountCode !== '101' ? bookOf.get(e.id) : undefined
        /* 통장은 번호로 묶는다 — 끝 네 자리가 같은 두 통장이 한 줄로 합쳐지지 않게. */
        const key = cash ? `bank:${bk?.id ?? ''}` : String(pid ?? '')
        let line = b.lines.find((x) => x.key === key)
        if (!line) {
          line = cash
            ? { key, partner: bk?.label ?? '[ ]', code: bk?.no ?? '[ ]', carry: 0, inc: 0, dec: 0 }
            : { key, partner: p?.name ?? e.partnerName ?? '[ ]', code: p?.code ?? '[ ]', carry: 0, inc: 0, dec: 0 }
          b.lines.push(line)
        }
        const d = Number(l.debit), c = Number(l.credit)
        if (e.entryDate < from) { line.carry += d - c; b.carry += d - c }
        else { line.inc += d; line.dec += c; b.inc += d; b.dec += c }
      }
    }
    const order = (n: string) => FUND_ACCOUNTS.indexOf(n)
    return [...m.values()]
      .map((b) => ({ ...b, lines: b.lines.filter((x) => x.carry || x.inc || x.dec)
        .sort((x, y) => (x.partner === '[ ]' ? -1 : y.partner === '[ ]' ? 1 : x.partner.localeCompare(y.partner, 'ko') || x.code.localeCompare(y.code))) }))
      .filter((b) => b.lines.length > 0)
      .sort((a, b) => order(a.accName) - order(b.accName))
  }, [entries, partners, byParent, from, bookOf])
  const tot = blocks.reduce((s, b) => ({ carry: s.carry + b.carry, inc: s.inc + b.inc, dec: s.dec + b.dec }), { carry: 0, inc: 0, dec: 0 })
  const bal = (c: Cell) => c.carry + c.inc - c.dec

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '자금현황표', [blocks.length])

  return (
    <EcListShell
      title="자금현황표"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setByParent(true) } },
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
            <EcPeriodPicks labels={FUND_STATUS_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="대표거래처로 합산">
          {([['거래처관계기준', true], ['개별거래처기준', false]] as const).map(([l, v]) => (
            <label key={l} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="fs-parent" checked={byParent === v} onChange={() => setByParent(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">전표가 많아 앞부분만 받았습니다.</p>}
      <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[4px]">자금현황표</h3>
      <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
        <span>회사명 : {companyName ?? ''}</span>
        <span>{slash(from)} ~ {slash(to)}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>계정명</th>
            <th>거래처명</th>
            <th className="text-right">이월잔액[외화]</th>
            <th className="text-right">증가[외화]</th>
            <th className="text-right">감소[외화]</th>
            <th className="text-right">금일잔액[외화]</th>
            <th>거래처코드</th>
            <th>계정코드</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : blocks.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {blocks.map((b) => (
                <Fragment key={b.accCode}>
                  {b.lines.map((x, i) => (
                    <tr key={x.key}>
                      <td>{i === 0 ? b.accName : ''}</td>
                      <td>{x.partner}</td>
                      <td className="text-right">{won(x.carry)}</td>
                      <td className="text-right">{won(x.inc)}</td>
                      <td className="text-right">{won(x.dec)}</td>
                      <td className="text-right">{won(bal(x))}</td>
                      <td>{x.code}</td>
                      <td>{i === 0 ? b.accCode : ''}</td>
                    </tr>
                  ))}
                  <tr style={SUB_ROW}>
                    <td colSpan={2} className="text-center">{b.accName} 계</td>
                    <td className="text-right">{won(b.carry)}</td>
                    <td className="text-right">{won(b.inc)}</td>
                    <td className="text-right">{won(b.dec)}</td>
                    <td className="text-right">{won(bal(b))}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </Fragment>
              ))}
              <tr style={SUB_ROW}>
                <td colSpan={2} className="text-center">합계</td>
                <td className="text-right">{won(tot.carry)}</td>
                <td className="text-right">{won(tot.inc)}</td>
                <td className="text-right">{won(tot.dec)}</td>
                <td className="text-right">{won(bal(tot))}</td>
                <td></td>
                <td></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}
