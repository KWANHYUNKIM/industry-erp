import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { ACCOUNT_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { AccountDivision, JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게, 앞 네 칸 묶음. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { id: number; code: string; name: string; division: AccountDivision }
interface PartnerOpt { id: number; code: string; name: string }
interface Row { key: string; date: string; no: string; text: string; partnerId: number | null; partner: string; amount: number }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>계정증감내역</b>(E010857) — 2026-10-03 loginaa 실측(자료가 든 판, 계정 외상매출금 · 전월).
 *
 * <p>조건: 기준일자(구간, 기본 <b>금월(~오늘)</b>, 빠른선택 금일 … 전월 · 금년 · 전년 · 종료일) · 계정(반드시 — 안 고르고 검색하면
 * "검색창에 계정코드를 입력하고 검색 바랍니다.") · 거래처 · 부서 · 프로젝트 · 기타([결재방표시]).
 *
 * <p>표가 둘 — "회사명 : … / 계정 / 계정 의 증가" 와 "… 의 감소". 열은 둘 다 일자 · 적요 · 거래처코드 · 거래처명 · 금액, 분개 한 줄이 한 줄,
 * 끝 [합계](앞 네 칸 묶음). 증가는 계정 구분의 늘어나는 쪽이다 — 자산 · 비용은 차변, 부채 · 자본 · 수익은 대변.
 * 부서 · 프로젝트는 회계전표가 들지 않는다.
 */
export default function AccountFlowPage() {
  const { companyName } = useAuth()
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [account, setAccount] = useState('')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  async function load() {
    if (!account) { setError('검색창에 계정코드를 입력하고 검색 바랍니다.'); return }
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (account) void load() }, [account, from, to])

  const acc = accounts.find((a) => String(a.id) === account)
  const debitSide = !acc || acc.division === 'ASSET' || acc.division === 'EXPENSE'
  const codeOf = useMemo(() => new Map(partners.map((p) => [p.id, p.code])), [partners])

  const { up, down } = useMemo(() => {
    const up: Row[] = [], down: Row[] = []
    if (!entries) return { up, down }
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      if (partner && String(e.partnerId) !== partner) continue
      for (const l of [...e.lines].sort((a, b) => a.lineNo - b.lineNo)) {
        if (String(l.accountId) !== account) continue
        const base = { date: e.entryDate, no: e.docNo, text: l.description ?? e.description ?? '', partnerId: e.partnerId, partner: e.partnerName ?? '' }
        const d = Number(l.debit), c = Number(l.credit)
        if (d) (debitSide ? up : down).push({ ...base, key: `${l.id}d`, amount: d })
        if (c) (debitSide ? down : up).push({ ...base, key: `${l.id}c`, amount: c })
      }
    }
    return { up, down }
  }, [entries, account, partner, debitSide])

  const tableRef = useRef<HTMLTableElement>(null)
  const downRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '계정증감내역', [up.length])
  useTableColumnCheck(downRef, '계정증감내역', [down.length])

  const head = (label: '증가' | '감소') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
      <span>회사명 : {companyName ?? ''} / {acc?.name ?? ''} / {acc?.name ?? ''} 의 {label}</span>
      <span>{slash(from)} ~ {slash(to)}</span>
    </div>
  )
  const thead = (
    <thead>
      <tr>
        <th>일자</th>
        <th>적요</th>
        <th>거래처코드</th>
        <th>거래처명</th>
        <th style={{ textAlign: 'right' }}>금액</th>
      </tr>
    </thead>
  )
  const tbody = (rows: Row[]) => (
    <tbody>
      {rows.map((r) => (
        <tr key={r.key}>
          <td>{slash(r.date)}</td>
          <td>{r.text}</td>
          <td>{r.partnerId != null ? codeOf.get(r.partnerId) ?? '' : ''}</td>
          <td>{r.partner}</td>
          <td style={{ textAlign: 'right' }}>{won(r.amount)}</td>
        </tr>
      ))}
      <tr style={SUB_ROW}>
        <td colSpan={4} style={{ textAlign: 'center' }}>합계</td>
        <td style={{ textAlign: 'right' }}>{won(rows.reduce((s, r) => s + r.amount, 0))}</td>
      </tr>
    </tbody>
  )

  return (
    <EcListShell
      title="계정증감내역"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setAccount(''); setPartner(''); setEntries(null) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={ACCOUNT_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} emptyLabel="선택" value={account} onChange={setAccount}
                           items={accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: 'var(--ec-warn)', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</p>
      ) : !entries ? (
        <p style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>계정을 선택하고 검색하세요.</p>
      ) : (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>계정증감내역</h3>
          <div style={{ marginBottom: 18 }}>
            {head('증가')}
            <table ref={tableRef} className="w-full text-left">{thead}{tbody(up)}</table>
          </div>
          <div style={{ marginBottom: 18 }}>
            {head('감소')}
            <table ref={downRef} className="w-full text-left">{thead}{tbody(down)}</table>
          </div>
        </>
      )}
    </EcListShell>
  )
}
