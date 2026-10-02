import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { AccountDivision, JournalEntry } from '../../types/api'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/** 원본 [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { id: number; code: string; name: string; division: AccountDivision; detailCategory: string | null }
interface PartnerOpt { id: number; name: string; parentId: number | null }
interface Block { code: string; name: string; rows: { key: string; partner: string; amt: number }[] }

/** 원본 빠른선택(2026-10-03 실측) — 기준일자가 하루라 고른 구간의 <b>끝날</b>을 기준일로 쓴다. */
function pickDate(label: string, fiscalStart: number): string {
  const t = new Date()
  const end = (y: number, m: number) => ymd(new Date(y, m + 1, 0))
  switch (label) {
    case '전월': return end(t.getFullYear(), t.getMonth() - 1)
    case '이번기수': { const y = t.getMonth() + 1 >= fiscalStart ? t.getFullYear() : t.getFullYear() - 1; return ymd(new Date(y + 1, fiscalStart - 1, 0)) }
    case '직전기수': { const y = t.getMonth() + 1 >= fiscalStart ? t.getFullYear() : t.getFullYear() - 1; return ymd(new Date(y, fiscalStart - 1, 0)) }
    default: return ymd(t)   // 금월(~오늘) · 전월+금월 — 끝날이 오늘이다
  }
}
const PICKS = ['금월(~오늘)', '전월', '전월+금월', '이번기수', '직전기수']

/**
 * 회계 I &gt; 출력물 &gt; 주요재무제표 &gt; <b>계정명세서</b>(E010844) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(<b>하루</b>, 기본 오늘, 빠른선택 금월(~오늘) · 전월 · 전월+금월 · 이번기수 · 직전기수) · 계정속성(<b>전표입력계정</b> |
 * 집계계정) · 계정 · 부서 · 프로젝트 · 대표거래처로 합산(<b>거래처관계기준</b> | 개별거래처기준) · 적용양식 · 양식구분([결재방표시]) · 데이터 보기형식.
 *
 * <p>계정마다 표 하나 — 머리 "회사명 : … / 계정코드(계정명)" 와 "기준일 (단위 : 원)", 열 계정명 · 거래처명 · 금액, 거래처마다 그날까지의 잔액 한 줄,
 * 끝 [합계], 꼬리 [P.n] · 인쇄일시. 거래처 없는 잔액은 원본처럼 '[]' 로 찍는다. 계정을 안 고르면 잔액이 남은 재무상태표 계정이 모두 나온다.
 * [집계계정]은 원본의 집계 계정(유동자산 같은) 축이다 — 우리는 집계 계정을 따로 두지 않아 계정의 세부분류로 묶는다.
 * 부서 · 프로젝트는 회계전표에 없다.
 */
export default function AccountDetailPage() {
  const { companyName } = useAuth()
  const [asOf, setAsOf] = useState(ymd(new Date()))
  const [fiscalStart, setFiscalStart] = useState(1)
  const [attr, setAttr] = useState<'전표입력계정' | '집계계정'>('전표입력계정')
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [account, setAccount] = useState('')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [byParent, setByParent] = useState(true)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printedAt, setPrintedAt] = useState(new Date())

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => { /* 못 받으면 1월 기수로 본다 */ })
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from: '1900-01-01', to: asOf, all: true } })
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
      setPrintedAt(new Date())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [asOf])

  const blocks = useMemo(() => {
    const accByCode = new Map(accounts.map((a) => [a.code, a]))
    const pById = new Map(partners.map((p) => [p.id, p]))
    const m = new Map<string, Map<string, { partner: string; amt: number }>>()
    const names = new Map<string, string>()
    for (const e of entries) {
      let pid = e.partnerId
      if (byParent && pid != null && pById.get(pid)?.parentId) pid = pById.get(pid)!.parentId
      const pname = pid == null ? '[]' : pById.get(pid)?.name ?? e.partnerName ?? ''
      for (const l of e.lines) {
        const a = accByCode.get(l.accountCode)
        if (!a || !(a.division === 'ASSET' || a.division === 'LIABILITY' || a.division === 'EQUITY')) continue
        if (account && String(a.id) !== account) continue
        const sign = a.division === 'ASSET' ? 1 : -1
        /* [집계계정]이면 계정 대신 그 세부분류(유동자산 · 매출채권 …)로 묶는다 — 우리 집계 계정이 곧 세부분류다. */
        const key = attr === '집계계정' ? `${a.division}|${a.detailCategory ?? ''}` : l.accountCode
        names.set(key, attr === '집계계정' ? (a.detailCategory || '기타') : l.accountName)
        if (!m.has(key)) m.set(key, new Map())
        const g = m.get(key)!
        const k = String(pid ?? '')
        if (!g.has(k)) g.set(k, { partner: pname, amt: 0 })
        g.get(k)!.amt += sign * (Number(l.debit) - Number(l.credit))
      }
    }
    const out: Block[] = []
    for (const [code, g] of [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const rows = [...g.entries()].filter(([, v]) => Math.round(v.amt) !== 0)
        .map(([k, v]) => ({ key: k, ...v }))
        .sort((x, y) => (x.partner === '[]' ? -1 : y.partner === '[]' ? 1 : x.partner.localeCompare(y.partner, 'ko')))
      if (rows.length) out.push({ code, name: names.get(code) ?? '', rows })
    }
    return out
  }, [entries, accounts, partners, account, byParent, attr])

  const tableRef = useRef<HTMLTableElement>(null)
  /** 계정 하나의 머리 · 줄 · [합계]. */
  const tableBody = (b: Block) => (
  <>
    <thead>
      <tr>
        <th>계정명</th>
        <th>거래처명</th>
        <th style={{ textAlign: 'right' }}>금액</th>
      </tr>
    </thead>
    <tbody>
      {b.rows.map((r) => (
        <tr key={r.key}>
          <td style={{ color: 'var(--ec-blue)' }}>{b.name}</td>
          <td style={{ color: 'var(--ec-blue)' }}>{r.partner}</td>
          <td style={{ textAlign: 'right' }}>{won(r.amt)}</td>
        </tr>
      ))}
      <tr style={SUB_ROW}>
        <td colSpan={2} style={{ textAlign: 'center' }}>합계</td>
        <td style={{ textAlign: 'right' }}>{won(b.rows.reduce((s, r) => s + r.amt, 0))}</td>
      </tr>
    </tbody>
  </>
  )

  useTableColumnCheck(tableRef, '계정명세서', [blocks.length])
  const stamp = `${slash(ymd(printedAt))} ${printedAt.getHours() < 12 ? '오전' : '오후'} ${printedAt.getHours() % 12 || 12}:${String(printedAt.getMinutes()).padStart(2, '0')}:${String(printedAt.getSeconds()).padStart(2, '0')}`

  return (
    <EcListShell
      title="계정명세서"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setAsOf(ymd(new Date())); setAttr('전표입력계정'); setAccount(''); setByParent(true) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            {PICKS.map((l) => (
              <button key={l} type="button" className="ec-btn" style={{ marginRight: 4 }} onClick={() => setAsOf(pickDate(l, fiscalStart))}>{l}</button>
            ))}
          </span>
        </EcCond>
        <EcCond label="계정속성">
          {(['전표입력계정', '집계계정'] as const).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="ad-attr" checked={attr === v} onChange={() => setAttr(v)} /> {v}
            </label>
          ))}
          <span style={{ display: 'inline-block', width: 230, verticalAlign: 'middle' }}>
            <CodePickerField label="계정" hideLabel width={220} emptyLabel="전체" value={account} onChange={setAccount}
                             items={accounts.filter((a) => a.division === 'ASSET' || a.division === 'LIABILITY' || a.division === 'EQUITY')
                               .map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
          </span>
        </EcCond>
        <EcCond label="대표거래처로 합산">
          {([['거래처관계기준', true], ['개별거래처기준', false]] as const).map(([l, v]) => (
            <label key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="ad-parent" checked={byParent === v} onChange={() => setByParent(v)} /> {l}
            </label>
          ))}
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: '#c07a00', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다 — 기준일을 앞당겨 보세요.</p>}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>계정명세서</h3>
          {blocks.length === 0 && <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</p>}
          {blocks.map((b, i) => (
            <div key={b.code} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
                <span>회사명 : {companyName ?? ''} / {attr === '집계계정' ? b.name : `${b.code}(${b.name})`}</span>
                <span>{slash(asOf)} (단위 : 원)</span>
              </div>
              {i === 0
                ? <table ref={tableRef} className="w-full text-left">{tableBody(b)}</table>
                : <table className="w-full text-left">{tableBody(b)}</table>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                <span>[P.{i + 1}]</span><span>{stamp}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </EcListShell>
  )
}
