import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { AccountDivision, JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게, 앞 두 칸 묶음. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')
const DAY = 86400000

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { id: number; code: string; name: string; division: AccountDivision }
interface PartnerOpt { id: number; code: string; name: string; manager: string | null; parentId: number | null; active: boolean }
interface Row { key: string; code: string; name: string; bal: number; months: number | null }

/** 빠른선택 — 조회일자가 하루라 고른 구간의 <b>끝날</b>을 쓴다(계정명세서와 같은 방식). */
function pickDate(label: string): string {
  const t = new Date()
  if (label === '전일') { t.setDate(t.getDate() - 1); return ymd(t) }
  if (label === '전주') { t.setDate(t.getDate() - t.getDay() - 1); return ymd(t) }
  if (label === '전월') return ymd(new Date(t.getFullYear(), t.getMonth(), 0))
  return ymd(t)
}
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일']

/**
 * 회계 I &gt; 경영자료 &gt; <b>채권/채무회수기간표</b>(E010822) — 2026-10-03 loginaa 실측(자료가 든 판, 계정 외상매출금).
 *
 * <p>조건: 조회일자(<b>하루</b>, 기본 오늘, 빠른선택 금일 … 전월 · 종료일) · 거래처 · 대표거래처로 합산(<b>거래처관계기준</b> | 개별거래처기준) ·
 * 계정(반드시) · 부서 · 거래처관리담당자 · 프로젝트 · 기타([결재방표시] 꺼짐 · [사용중단거래처포함] 켜짐).
 *
 * <p>머리 "회사명 : …" 아래 계정명 한 줄, 표는 거래처코드 · 거래처명 · 잔액 · 미회수월수('N 개월'), 끝 [합계](두 칸 묶음).
 * 잔액은 그날까지 그 계정의 거래처별 잔액(계정의 제 쪽 — 채권은 차 − 대, 채무는 대 − 차). 미회수월수는 잔액을 <b>가장 최근 증가부터
 * 거슬러 채웠을 때</b> 가장 오래된 증가가 몇 달 전인지다(30일 = 한 달, 원본에서 09/28 매출이 10/03 기준 '0 개월'). 잔액이 0 이하이면 비운다.
 * 원본 줄 차례는 기준을 못 재 잔액 큰 순으로 둔다. 결재방표시는 우리 인쇄가 결재 칸을 그리지 않고, 부서 · 프로젝트는 회계전표에 없다.
 */
export default function ArApAgingPage() {
  const { companyName } = useAuth()
  const [asOf, setAsOf] = useState(ymd(new Date()))
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [account, setAccount] = useState('')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [byParent, setByParent] = useState(true)
  const [manager, setManager] = useState('')
  const [withInactive, setWithInactive] = useState(true)
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  async function load() {
    if (!account) { setError('계정을 선택하세요.'); return }
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: '1900-01-01', to: asOf, all: true } })
      setEntries(r.data.rows)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (account) void load() }, [account, asOf])

  const acc = accounts.find((a) => String(a.id) === account)
  const rows = useMemo(() => {
    if (!entries || !acc) return [] as Row[]
    const debitSide = acc.division === 'ASSET' || acc.division === 'EXPENSE'
    const pById = new Map(partners.map((p) => [p.id, p]))
    const m = new Map<number, { bal: number; incs: { date: string; amt: number }[] }>()
    for (const e of entries) {
      let pid = e.partnerId
      if (pid == null) continue
      if (byParent && pById.get(pid)?.parentId) pid = pById.get(pid)!.parentId!
      for (const l of e.lines) {
        if (l.accountCode !== acc.code) continue
        const inc = debitSide ? Number(l.debit) : Number(l.credit)
        const dec = debitSide ? Number(l.credit) : Number(l.debit)
        if (!m.has(pid)) m.set(pid, { bal: 0, incs: [] })
        const g = m.get(pid)!
        g.bal += inc - dec
        if (inc) g.incs.push({ date: e.entryDate, amt: inc })
      }
    }
    const asOfMs = new Date(`${asOf}T00:00:00`).getTime()
    const out: Row[] = []
    for (const [pid, g] of m) {
      const p = pById.get(pid)
      if (!p) continue
      if (partner && String(pid) !== partner) continue
      if (manager && (p.manager ?? '') !== manager) continue
      if (!withInactive && !p.active) continue
      if (Math.round(g.bal) === 0) continue
      let months: number | null = null
      if (g.bal > 0) {
        /* 가장 최근 증가부터 거슬러 잔액을 채운다 — 마지막으로 쓴 증가의 날짜가 미회수 시작점이다. */
        let left = g.bal
        let oldest = asOf
        for (const inc of [...g.incs].sort((a, b) => (a.date < b.date ? 1 : -1))) {
          oldest = inc.date
          left -= inc.amt
          if (left <= 0) break
        }
        months = Math.max(0, Math.floor((asOfMs - new Date(`${oldest}T00:00:00`).getTime()) / DAY / 30))
      }
      out.push({ key: String(pid), code: p.code, name: p.name, bal: g.bal, months })
    }
    return out.sort((a, b) => b.bal - a.bal)
  }, [entries, acc, partners, byParent, partner, manager, withInactive, asOf])
  const total = rows.reduce((s, r) => s + r.bal, 0)
  const managers = useMemo(() => [...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort(), [partners])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '채권/채무회수기간표', [rows.length])

  return (
    <EcListShell
      title="채권/채무회수기간표"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setAsOf(ymd(new Date())); setAccount(''); setPartner(''); setByParent(true); setManager(''); setWithInactive(true); setEntries(null) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: 'var(--ec-danger-bg)', color: 'var(--ec-danger)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="조회일자">
          <input type="date" className="ec-input" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            {PICKS.map((l) => (
              <button key={l} type="button" className="ec-btn" style={{ marginRight: 4 }} onClick={() => setAsOf(pickDate(l))}>{l}</button>
            ))}
          </span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="대표거래처로 합산">
          {([['거래처관계기준', true], ['개별거래처기준', false]] as const).map(([l, v]) => (
            <label key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="aging-parent" checked={byParent === v} onChange={() => setByParent(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} emptyLabel="선택" value={account} onChange={setAccount}
                           items={accounts.filter((a) => a.division === 'ASSET' || a.division === 'LIABILITY').map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={180} emptyLabel="전체" value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} /> 사용중단거래처포함
          </label>
        </EcCond>
      </ul>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>불러오는 중…</p>
      ) : !entries ? (
        <p style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>계정을 선택하고 검색하세요.</p>
      ) : (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 4px' }}>채권/채무회수기간표</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>회사명 : {companyName ?? ''}</span>
            <span>{slash(asOf)}</span>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, margin: '4px 0' }}>{acc?.name ?? ''}</div>
          <table ref={tableRef} className="w-full text-left">
            <thead>
              <tr>
                <th>거래처코드</th>
                <th>거래처명</th>
                <th style={{ textAlign: 'right' }}>잔액</th>
                <th style={{ textAlign: 'right' }}>미회수월수</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ec-text-hint)', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>}
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td style={{ textAlign: 'right' }}>{won(r.bal)}</td>
                  <td style={{ textAlign: 'right' }}>{r.months == null ? '' : `${r.months} 개월`}</td>
                </tr>
              ))}
              <tr style={SUB_ROW}>
                <td colSpan={2} style={{ textAlign: 'center' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(total)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </EcListShell>
  )
}
