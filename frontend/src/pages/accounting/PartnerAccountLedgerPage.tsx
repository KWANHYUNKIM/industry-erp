import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { AccountDivision, JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [YYYY/MM 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { id: number; code: string; name: string; division: AccountDivision }
interface PartnerOpt { id: number; code: string; name: string; parentId: number | null }
type Mode = '건별' | '일별' | '월별' | '계정별집계'
const MODES: Mode[] = ['건별', '일별', '월별', '계정별집계']

/** 분개 한 줄을 원장 줄로 — 일자 · 전표번호 · 적요 · 차변 · 대변. */
interface Row { date: string; no: string; text: string; d: number; c: number }
/** 계정 하나의 원장 — 이월잔액과 기간 안 줄. */
interface Block { id: number; code: string; name: string; debitSide: boolean; carry: number; rows: Row[] }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>거래처별계정별원장</b>(E010809) — 2026-10-03 loginaa 실측(자료가 든 판, 거래처 좋은컴퓨터).
 *
 * <p>계정별거래처별원장의 짝이다 — 거래처를 하나 고르고(반드시 고른다) 그 거래처가 걸린 계정마다 원장을 편다.
 * 조건: 구분(<b>건별</b> · 일별 · 월별 · 계정별집계) · 기준일자(구간, 기본 <b>전월</b>, 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일) ·
 * 부서 · 프로젝트 · 계정 · 거래처 · 대표거래처로 합산(<b>거래처관계기준</b> | 개별거래처기준 — 짝 화면과 기본이 반대다) ·
 * 기타([전월이월포함] 켜짐 · [거래내역없는계정제외] 꺼짐).
 *
 * <p>건별은 계정마다 표 하나 — 머리 "회사명 : … / 거래처명 / 계정코드(계정명)" 와 기간, 열 일자-No. · 적요 · 차변금액 · 대변금액 · 잔액.
 * 첫 줄 [이월잔액], 잔액은 그날 마지막 줄에만, 달마다 [YYYY/MM 계](짝 화면과 달리 <b>잔액 칸에도</b> 그달 끝 잔액을 찍는다),
 * 끝 [합계](차변 = 이월 + 차변). 계정별집계는 한 표 — 계정코드 · 계정명 · 이월잔액 · 차변 · 대변 · 잔액, 끝 [합계](두 칸 묶음).
 * 잔액은 계정마다 제 방향으로 쌓는다 — 원본에서 외상매출금은 차변 − 대변, 부가세예수금은 대변 − 차변이었다. [합계]는 그 잔액을 그대로 더한다.
 *
 * <p>일별 · 월별은 원본 판을 못 쟀다 — 건별 표에서 하루 · 한 달을 한 줄로 묶는다. 부서 · 프로젝트는 회계전표가 들지 않는다.
 * 이월잔액을 내려고 처음부터 끝날까지 전표를 받아 거래처로 거른다.
 */
export default function PartnerAccountLedgerPage() {
  const { companyName } = useAuth()
  const init = periodOf('전월')!
  const [mode, setMode] = useState<Mode>('건별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [account, setAccount] = useState('')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [byParent, setByParent] = useState(true)
  const [withCarry, setWithCarry] = useState(true)
  const [hideIdle, setHideIdle] = useState(false)
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  async function load() {
    if (!partner) { setError('거래처를 선택하세요.'); return }
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: '1900-01-01', to, all: true } })
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (partner) void load() }, [partner, from, to])

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const parentOf = useMemo(() => new Map(partners.map((p) => [p.id, p.parentId])), [partners])
  const chosen = partners.find((p) => String(p.id) === partner)

  const blocks = useMemo(() => {
    if (!entries || !partner) return [] as Block[]
    const pid = Number(partner)
    /* 거래처관계기준이면 고른 거래처를 대표로 둔 거래처의 전표도 함께 센다. */
    const mine = (id: number | null) => id === pid || (byParent && id != null && parentOf.get(id) === pid)
    const m = new Map<number, Block>()
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      if (!mine(e.partnerId)) continue
      for (const l of e.lines) {
        if (account && String(l.accountId) !== account) continue
        const acc = accById.get(l.accountId)
        const debitSide = !acc || acc.division === 'ASSET' || acc.division === 'EXPENSE'
        if (!m.has(l.accountId)) m.set(l.accountId, { id: l.accountId, code: l.accountCode, name: l.accountName, debitSide, carry: 0, rows: [] })
        const b = m.get(l.accountId)!
        const d = Number(l.debit), c = Number(l.credit)
        if (e.entryDate < from) { if (withCarry) b.carry += debitSide ? d - c : c - d }
        else b.rows.push({ date: e.entryDate, no: e.docNo, text: l.description ?? e.description ?? '', d, c })
      }
    }
    return [...m.values()]
      .filter((b) => b.rows.length > 0 || (!hideIdle && b.carry !== 0))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [entries, partner, byParent, parentOf, account, accById, withCarry, hideIdle, from])

  const sumOf = (rows: Row[]) => rows.reduce((s, r) => ({ d: s.d + r.d, c: s.c + r.c }), { d: 0, c: 0 })
  const net = (b: Block, d: number, c: number) => b.carry + (b.debitSide ? d - c : c - d)
  const total = blocks.reduce((s, b) => { const x = sumOf(b.rows); return { carry: s.carry + b.carry, d: s.d + x.d, c: s.c + x.c, bal: s.bal + net(b, x.d, x.c) } },
    { carry: 0, d: 0, c: 0, bal: 0 })

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '거래처별계정별원장', [blocks.length, mode])

  const reset = () => {
    setMode('건별'); setFrom(init.from); setTo(init.to); setAccount(''); setPartner(''); setByParent(true)
    setWithCarry(true); setHideIdle(false); setEntries(null)
  }
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  /** 건별 · 일별 · 월별 — 계정 하나의 표. 일별 · 월별은 하루 · 한 달을 한 줄로 묶는다. */
  function blockTable(b: Block, i: number) {
    const unit = mode === '월별' ? 7 : 10
    const groups: { key: string; rows: Row[] }[] = []
    for (const r of b.rows) {
      const k = mode === '건별' ? `${r.date}|${r.no}|${groups.length}` : r.date.slice(0, unit)
      const last = groups[groups.length - 1]
      if (mode !== '건별' && last && last.key === k) last.rows.push(r)
      else groups.push({ key: k, rows: [r] })
    }
    let bal = b.carry
    const months = [...new Set(b.rows.map((r) => r.date.slice(0, 7)))]
    const s = sumOf(b.rows)
    return (
      <div key={b.id} style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
          <span>회사명 : {companyName ?? ''} / {chosen?.name ?? ''} / {b.code}({b.name})</span>
          <span>{slash(from)} ~ {slash(to)}</span>
        </div>
        <table ref={i === 0 ? tableRef : undefined} className="w-full text-left">
          <thead>
            <tr>
              <th>일자-No.</th>
              <th>적요</th>
              <th style={{ textAlign: 'right' }}>차변금액</th>
              <th style={{ textAlign: 'right' }}>대변금액</th>
              <th style={{ textAlign: 'right' }}>잔액</th>
            </tr>
          </thead>
          <tbody>
            {b.carry !== 0 && (
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={2} style={{ textAlign: 'center' }}>이월잔액</td>
                <td style={{ textAlign: 'right' }}>{won(b.carry)}</td>
                <td></td>
                <td style={{ textAlign: 'right' }}>{won(b.carry)}</td>
              </tr>
            )}
            {months.map((mo) => {
              const gs = groups.filter((g) => g.rows[0].date.slice(0, 7) === mo)
              const ms = sumOf(gs.flatMap((g) => g.rows))
              return (
                <Fragment key={mo}>
                  {gs.map((g, gi) => {
                    const x = sumOf(g.rows)
                    bal += b.debitSide ? x.d - x.c : x.c - x.d
                    const r = g.rows[0]
                    /* 원본은 잔액을 그날 마지막 줄에만 찍는다. */
                    const lastOfDay = mode !== '건별' || gs[gi + 1]?.rows[0].date !== r.date
                    return (
                      <tr key={g.key}>
                        <td style={{ color: 'var(--ec-blue)' }}>{mode === '건별' ? `${slash(r.date)} -${r.no}` : slash(g.key)}</td>
                        <td>{mode === '건별' ? r.text : ''}</td>
                        <td style={{ textAlign: 'right' }}>{won(x.d)}</td>
                        <td style={{ textAlign: 'right' }}>{won(x.c)}</td>
                        <td style={{ textAlign: 'right' }}>{lastOfDay ? won(bal) : ''}</td>
                      </tr>
                    )
                  })}
                  <tr style={SUB_ROW}>
                    <td colSpan={2} style={{ textAlign: 'center' }}>{slash(mo)} 계</td>
                    <td style={{ textAlign: 'right' }}>{won(ms.d)}</td>
                    <td style={{ textAlign: 'right' }}>{won(ms.c)}</td>
                    <td style={{ textAlign: 'right' }}>{won(bal)}</td>
                  </tr>
                </Fragment>
              )
            })}
            <tr style={SUB_ROW}>
              <td colSpan={2} style={{ textAlign: 'center' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(b.carry + s.d)}</td>
              <td style={{ textAlign: 'right' }}>{won(s.c)}</td>
              <td style={{ textAlign: 'right' }}>{won(net(b, s.d, s.c))}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, marginTop: 4 }}>[P.{i + 1}]</div>
      </div>
    )
  }

  return (
    <EcListShell
      title="거래처별계정별원장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {MODES.map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="pal-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} emptyLabel="전체" value={account} onChange={setAccount}
                           items={accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="선택" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="대표거래처로 합산">
          {([['거래처관계기준', true], ['개별거래처기준', false]] as const).map(([l, v]) => (
            <label key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="pal-parent" checked={byParent === v} onChange={() => setByParent(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="기타">
          {check('전월이월포함', withCarry, setWithCarry)}
          {check('거래내역없는계정제외', hideIdle, setHideIdle)}
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: 'var(--ec-warn)', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</p>
      ) : !entries ? (
        <p style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>거래처를 선택하고 검색하세요.</p>
      ) : (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>거래처별계정별원장</h3>
          {mode === '계정별집계' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
                <span>회사명 : {companyName ?? ''} / {chosen?.name ?? ''}</span>
                <span>{slash(from)} ~ {slash(to)}</span>
              </div>
              <table ref={tableRef} className="w-full text-left">
                <thead>
                  <tr>
                    <th>계정코드</th>
                    <th>계정명</th>
                    <th style={{ textAlign: 'right' }}>이월잔액</th>
                    <th style={{ textAlign: 'right' }}>차변</th>
                    <th style={{ textAlign: 'right' }}>대변</th>
                    <th style={{ textAlign: 'right' }}>잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
                  ) : blocks.map((b) => {
                    const x = sumOf(b.rows)
                    return (
                      <tr key={b.id}>
                        <td>{b.code}</td>
                        <td>{b.name}</td>
                        <td style={{ textAlign: 'right' }}>{won(b.carry)}</td>
                        <td style={{ textAlign: 'right' }}>{won(x.d)}</td>
                        <td style={{ textAlign: 'right' }}>{won(x.c)}</td>
                        <td style={{ textAlign: 'right' }}>{won(net(b, x.d, x.c))}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={SUB_ROW}>
                    <td colSpan={2} style={{ textAlign: 'center' }}>합계</td>
                    <td style={{ textAlign: 'right' }}>{won(total.carry)}</td>
                    <td style={{ textAlign: 'right' }}>{won(total.d)}</td>
                    <td style={{ textAlign: 'right' }}>{won(total.c)}</td>
                    <td style={{ textAlign: 'right' }}>{won(total.bal)}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          ) : blocks.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</p>
          ) : blocks.map(blockTable)}
        </>
      )}
    </EcListShell>
  )
}
