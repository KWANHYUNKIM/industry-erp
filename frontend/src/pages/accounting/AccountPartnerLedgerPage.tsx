import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, fiscalYearStartOf, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { AccountDivision, AccountLedger, LedgerRow } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [YYYY/MM 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

interface AccountOpt { id: number; code: string; name: string; division?: AccountDivision }
interface PartnerOpt { id: number; code: string; name: string; manager: string | null; parentId: number | null; active: boolean }
type Mode = '건별' | '일별' | '월별' | '거래처별집계'
const MODES: Mode[] = ['건별', '일별', '월별', '거래처별집계']
const NONE = 0

/** 거래처 한 곳의 원장 — 이월잔액과 기간 안 줄. */
interface Block { key: number; code: string; name: string; carry: number; rows: LedgerRow[] }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>계정별거래처별원장</b>(E010808) — 2026-10-03 loginaa 실측(자료가 든 판, 계정 외상매출금).
 *
 * <p>조건: 구분(<b>건별</b> · 일별 · 월별 · 거래처별집계) · 기준일자(구간, 기본 <b>전월</b>, 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일) ·
 * 부서 · 프로젝트 · 계정(반드시 고른다) · 거래처 · 대표거래처로 합산(거래처관계기준 | <b>개별거래처기준</b>) · 거래처관리담당자 ·
 * 기타([거래처코드없는자료만] 꺼짐 · [전월이월포함] 켜짐 · [거래내역없는거래처제외] 꺼짐 · [사용중단거래처포함] 켜짐).
 *
 * <p>건별은 거래처마다 표 하나 — 머리 "회사명 : … / 계정 / 거래처코드(거래처명)" 와 기간, 열 일자-No. · 적요 · 차변금액 · 대변금액 · 잔액.
 * 첫 줄 [이월잔액](두 칸 묶음, 차변 칸에 부호째), 잔액은 그날 마지막 줄에만 찍고, 달마다 [YYYY/MM 계], 끝에 [합계](차변 = 이월 + 차변).
 * 꼬리에 [P.n]. 거래처별집계는 한 표 — 거래처코드 · 거래처명 · 이월잔액 · 차변 · 대변 · 잔액, 거래처명 차례, 끝 [합계](두 칸 묶음).
 * 원본은 외상매출금도 잔액을 차변 − 대변으로 찍었다 — 부채 · 자본 · 수익 계정은 대변 − 차변으로 쌓는다(계정별원장과 같은 방향).
 *
 * <p>일별 · 월별은 원본 판을 못 쟀다 — 건별 표에서 하루 · 한 달을 한 줄로 묶어 찍는다.
 * 부서 · 프로젝트는 회계전표가 들지 않는다.
 */
export default function AccountPartnerLedgerPage() {
  const { companyName } = useAuth()
  const init = periodOf('전월')!
  const [mode, setMode] = useState<Mode>('건별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [accountId, setAccountId] = useState('')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [byParent, setByParent] = useState(false)
  const [manager, setManager] = useState('')
  const [noCodeOnly, setNoCodeOnly] = useState(false)
  const [withCarry, setWithCarry] = useState(true)
  const [hideIdle, setHideIdle] = useState(false)
  const [withInactive, setWithInactive] = useState(true)
  const [ledger, setLedger] = useState<AccountLedger | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  /* 기수 시작월 — 수익 · 비용 계정의 이월잔액은 기수 첫날부터만 쌓는다(지난 기수 손익은 이익잉여금으로 넘어갔다). */
  const [fiscalStart, setFiscalStart] = useState<number | null>(null)
  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => setFiscalStart(null))
  }, [])

  /* 이월잔액을 내려면 기간 첫날 전 줄도 있어야 해서 처음부터 끝날까지 받는다. */
  async function load() {
    if (!accountId) { setError('계정을 선택하세요.'); return }
    setLoading(true)
    setError('')
    try {
      const r = await api.get<AccountLedger>('/journals/ledger', { params: { accountId, from: '1900-01-01', to } })
      setLedger(r.data)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId) void load() }, [accountId, from, to])

  const pById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners])
  const debitSide = !ledger || ledger.division === 'ASSET' || ledger.division === 'EXPENSE'
  const amt = (r: { debit: number | string; credit: number | string }) =>
    debitSide ? Number(r.debit) - Number(r.credit) : Number(r.credit) - Number(r.debit)

  const plCut = ledger && fiscalStart && (ledger.division === 'REVENUE' || ledger.division === 'EXPENSE') ? fiscalYearStartOf(from, fiscalStart) : null
  const blocks = useMemo(() => {
    if (!ledger) return [] as Block[]
    const m = new Map<number, Block>()
    const keyOf = (pid: number | null | undefined) => {
      if (pid == null) return NONE
      const p = pById.get(pid)
      return byParent && p?.parentId ? p.parentId : pid
    }
    for (const r of ledger.rows) {
      const key = keyOf(r.partnerId)
      if (noCodeOnly ? key !== NONE : key === NONE) continue
      const p = pById.get(key)
      if (p && !withInactive && !p.active) continue
      if (partner && String(key) !== partner) continue
      if (manager && (p?.manager ?? '') !== manager) continue
      if (!m.has(key)) m.set(key, { key, code: p?.code ?? '', name: p?.name ?? r.partnerName ?? '', carry: 0, rows: [] })
      const b = m.get(key)!
      if (r.entryDate < from) { if (withCarry && !(plCut && r.entryDate < plCut)) b.carry += amt(r) }
      else b.rows.push(r)
    }
    return [...m.values()]
      .filter((b) => b.rows.length > 0 || (!hideIdle && b.carry !== 0))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, pById, byParent, noCodeOnly, withInactive, partner, manager, withCarry, hideIdle, from, plCut])

  const sumOf = (rows: LedgerRow[]) => rows.reduce((s, r) => ({ d: s.d + Number(r.debit), c: s.c + Number(r.credit) }), { d: 0, c: 0 })
  const total = blocks.reduce((s, b) => { const x = sumOf(b.rows); return { carry: s.carry + b.carry, d: s.d + x.d, c: s.c + x.c } }, { carry: 0, d: 0, c: 0 })
  const net = (carry: number, d: number, c: number) => carry + (debitSide ? d - c : c - d)
  const managers = useMemo(() => [...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort(), [partners])
  const accountName = accounts.find((a) => String(a.id) === accountId)?.name ?? ''

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '계정별거래처별원장', [blocks.length, mode])

  const reset = () => {
    setMode('건별'); setFrom(init.from); setTo(init.to); setAccountId(''); setPartner(''); setByParent(false); setManager('')
    setNoCodeOnly(false); setWithCarry(true); setHideIdle(false); setWithInactive(true); setLedger(null)
  }
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  /** 건별 · 일별 · 월별 — 거래처 한 곳의 표. 일별 · 월별은 하루 · 한 달을 한 줄로 묶는다. */
  function blockTable(b: Block, i: number) {
    const unit = mode === '월별' ? 7 : 10
    const groups: { key: string; rows: LedgerRow[] }[] = []
    for (const r of b.rows) {
      const k = mode === '건별' ? `${r.entryDate}|${r.docNo}|${groups.length}` : r.entryDate.slice(0, unit)
      const last = groups[groups.length - 1]
      if (mode !== '건별' && last && last.key === k) last.rows.push(r)
      else groups.push({ key: k, rows: [r] })
    }
    let bal = b.carry
    const months = [...new Set(b.rows.map((r) => r.entryDate.slice(0, 7)))]
    const s = sumOf(b.rows)
    return (
      <div key={b.key} className="mb-[18px]">
        <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
          <span>회사명 : {companyName ?? ''} / {accountName} / {b.key === NONE ? '(거래처없음)' : `${b.code}(${b.name})`}</span>
          <span>{slash(from)} ~ {slash(to)}</span>
        </div>
        <table ref={i === 0 ? tableRef : undefined} className="w-full text-left">
          <thead>
            <tr>
              <th>일자-No.</th>
              <th>적요</th>
              <th className="text-right">차변금액</th>
              <th className="text-right">대변금액</th>
              <th className="text-right">잔액</th>
            </tr>
          </thead>
          <tbody>
            {b.carry !== 0 && (
              <tr className="font-bold">
                <td colSpan={2} className="text-center">이월잔액</td>
                <td className="text-right">{won(b.carry)}</td>
                <td></td>
                <td className="text-right">{won(b.carry)}</td>
              </tr>
            )}
            {months.map((mo) => {
              const gs = groups.filter((g) => g.rows[0].entryDate.slice(0, 7) === mo)
              const ms = sumOf(gs.flatMap((g) => g.rows))
              return (
                <Fragment key={mo}>
                  {gs.map((g, gi) => {
                    const x = sumOf(g.rows)
                    bal += debitSide ? x.d - x.c : x.c - x.d
                    const r = g.rows[0]
                    /* 원본은 잔액을 그날 마지막 줄에만 찍는다. */
                    const lastOfDay = mode !== '건별' || gs[gi + 1]?.rows[0].entryDate !== r.entryDate
                    return (
                      <tr key={g.key}>
                        <td className="text-ec-blue">{mode === '건별' ? dateNo(r.entryDate, r.docNo) : slash(g.key)}</td>
                        <td>{mode === '건별' ? r.description ?? '' : ''}</td>
                        <td className="text-right">{won(x.d)}</td>
                        <td className="text-right">{won(x.c)}</td>
                        <td className="text-right">{lastOfDay ? won(bal) : ''}</td>
                      </tr>
                    )
                  })}
                  <tr style={SUB_ROW}>
                    <td colSpan={2} className="text-center">{slash(mo)} 계</td>
                    <td className="text-right">{won(ms.d)}</td>
                    <td className="text-right">{won(ms.c)}</td>
                    <td></td>
                  </tr>
                </Fragment>
              )
            })}
            <tr style={SUB_ROW}>
              <td colSpan={2} className="text-center">합계</td>
              <td className="text-right">{won(b.carry + s.d)}</td>
              <td className="text-right">{won(s.c)}</td>
              <td className="text-right">{won(net(b.carry, s.d, s.c))}</td>
            </tr>
          </tbody>
        </table>
        <div className="text-[12px] mt-[4px]">[P.{i + 1}]</div>
      </div>
    )
  }

  return (
    <EcListShell
      title="계정별거래처별원장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {MODES.map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="apl-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} emptyLabel="선택" value={accountId} onChange={setAccountId}
                           items={accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="대표거래처로 합산">
          {([['거래처관계기준', true], ['개별거래처기준', false]] as const).map(([l, v]) => (
            <label key={l} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="apl-parent" checked={byParent === v} onChange={() => setByParent(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={180} emptyLabel="전체" value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="기타">
          {check('거래처코드없는자료만', noCodeOnly, setNoCodeOnly)}
          {check('전월이월포함', withCarry, setWithCarry)}
          {check('거래내역없는거래처제외', hideIdle, setHideIdle)}
          {check('사용중단거래처포함', withInactive, setWithInactive)}
        </EcCond>
      </ul>

      {loading ? (
        <p className="ec-empty">불러오는 중…</p>
      ) : !ledger ? (
        <p className="text-center text-ec-hint p-[20px]">계정을 선택하고 검색하세요.</p>
      ) : (
        <>
          <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">계정별거래처원장</h3>
          {mode === '거래처별집계' ? (
            <table ref={tableRef} className="w-full text-left">
              <thead>
                <tr>
                  <th>거래처코드</th>
                  <th>거래처명</th>
                  <th className="text-right">이월잔액</th>
                  <th className="text-right">차변</th>
                  <th className="text-right">대변</th>
                  <th className="text-right">잔액</th>
                </tr>
              </thead>
              <tbody>
                {blocks.length === 0 ? (
                  <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : blocks.map((b) => {
                  const x = sumOf(b.rows)
                  return (
                    <tr key={b.key}>
                      <td>{b.code}</td>
                      <td>{b.name}</td>
                      <td className="text-right">{won(b.carry)}</td>
                      <td className="text-right">{won(x.d)}</td>
                      <td className="text-right">{won(x.c)}</td>
                      <td className="text-right">{won(net(b.carry, x.d, x.c))}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={SUB_ROW}>
                  <td colSpan={2} className="text-center">합계</td>
                  <td className="text-right">{won(total.carry)}</td>
                  <td className="text-right">{won(total.d)}</td>
                  <td className="text-right">{won(total.c)}</td>
                  <td className="text-right">{won(net(total.carry, total.d, total.c))}</td>
                </tr>
              </tfoot>
            </table>
          ) : blocks.length === 0 ? (
            <p className="ec-empty">등록된 데이터가 없습니다.</p>
          ) : blocks.map(blockTable)}
        </>
      )}
    </EcListShell>
  )
}
