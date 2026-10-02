import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [YYYY/MM 계 (n 건)] · [누계 (n 건)] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; code: string; name: string; bizRegNo: string | null; regNoKind: string | null; taxReport: boolean }
type Mode = '매출' | '매입' | '매출집계' | '매입집계' | '매입/매출'
const MODES: Mode[] = ['매출', '매입', '매출집계', '매입집계', '매입/매출']
type Side = '매출' | '매입'
/** 부가세 계정(StandardAccounts) — 매출은 255 부가세예수금, 매입은 135 부가세대급금. 이 줄이 든 전표가 매입/매출장의 한 줄이다. */
const VAT_CODE: Record<Side, string> = { 매출: '255', 매입: '135' }
/** 우리 전표는 부가세가 붙은 세금계산서 거래만 부가세 줄을 남긴다 — 계산서 · 카드 · 영세 같은 다른 유형이 없다. */
const KIND_NAME = '세금계산서'

interface Row { key: string; side: Side; date: string; no: string; partnerId: number | null; partner: string; text: string; supply: number; vat: number }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>매입/매출장</b>(E010806) — 2026-10-03 loginaa 실측(자료가 든 판, 전월).
 *
 * <p>조건: 매출/매입구분(<b>매출</b> · 매입 · 매출집계 · 매입집계 · 매입/매출) · 기준일자(구간, 기본 <b>전월</b>, 빠른선택 금일 … 전월 · 이번기수 ·
 * 직전기수 · 종료일) · 부서 · 프로젝트 · 거래처 · 부가세유형(전체) · 세무신고거래처구분(<b>전체</b> · 사업자등록번호 · 주민등록번호) ·
 * 최종수정자 · 회계전표No. · 기타([세무신고거래처] 꺼짐).
 *
 * <p>매출(매입)은 한 표 — 일자-No. · 유형명 · 전자구분 · 거래처명 · 세부내역 · 매출(매입)공급가액 · 매출(매입)부가세, 달마다
 * [YYYY/MM 계 (n 건)], 끝 [누계 (n 건)](앞 다섯 칸 묶음). 집계는 사업자등록번호 · 거래처명 · 매수 · 공급가액 · 세액 · 합계,
 * [[사업자등록번호] 계] · [누계](두 칸 묶음). 매입/매출 판은 원본에서 바꿔 눌러도 매출집계 판이 그대로 남아 못 쟀다 — 매출 · 매입 표를 잇달아 찍는다.
 *
 * <p>부가세 줄(매출 255 · 매입 135)이 든 회계전표가 한 줄이다. 공급가액은 부가세 줄을 뺀 그쪽(매출은 대변 · 매입은 차변) 합.
 * 유형명은 늘 세금계산서, 전자구분은 회계전표가 전자 발행 여부를 들지 않아 비운다. 부서 · 프로젝트는 회계전표에 없다.
 */
export default function VatBookPage() {
  const { companyName } = useAuth()
  const init = periodOf('전월')!
  const [mode, setMode] = useState<Mode>('매출')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [kind, setKind] = useState('')
  const [regKind, setRegKind] = useState<'전체' | '사업자등록번호' | '주민등록번호'>('전체')
  const [docNo, setDocNo] = useState('')
  const [taxOnly, setTaxOnly] = useState(false)
  const [entries, setEntries] = useState<JournalEntry[]>([])
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
  useEffect(() => { void load() }, [from, to])

  const pById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners])

  const rows = useMemo(() => {
    const out: Row[] = []
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      if (partner && String(e.partnerId) !== partner) continue
      if (docNo && !e.docNo.includes(docNo)) continue
      const p = e.partnerId != null ? pById.get(e.partnerId) : undefined
      if (taxOnly && !p?.taxReport) continue
      if (regKind !== '전체' && (p?.regNoKind ?? '사업자등록번호') !== regKind) continue
      for (const side of ['매출', '매입'] as Side[]) {
        const vatLines = e.lines.filter((l) => l.accountCode === VAT_CODE[side])
        if (vatLines.length === 0) continue
        const others = e.lines.filter((l) => l.accountCode !== VAT_CODE[side])
        const vat = side === '매출'
          ? vatLines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0)
          : vatLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)
        const supply = side === '매출'
          ? others.reduce((s, l) => s + Number(l.credit), 0)
          : others.reduce((s, l) => s + Number(l.debit), 0)
        out.push({ key: `${e.id}${side}`, side, date: e.entryDate, no: e.docNo, partnerId: e.partnerId, partner: e.partnerName ?? '',
          text: e.description ?? '', supply, vat })
      }
    }
    return kind && kind !== KIND_NAME ? [] : out
  }, [entries, partner, docNo, taxOnly, regKind, pById, kind])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '매입/매출장', [rows.length, mode])

  const reset = () => {
    setMode('매출'); setFrom(init.from); setTo(init.to); setPartner(''); setKind(''); setRegKind('전체'); setDocNo(''); setTaxOnly(false)
  }

  /** 매출 · 매입 한 표 — 분개장이 아니라 전표 한 장이 한 줄이다. */
  function ledger(side: Side, first: boolean) {
    const rs = rows.filter((r) => r.side === side)
    const months = [...new Set(rs.map((r) => r.date.slice(0, 7)))]
    const sum = (xs: Row[]) => xs.reduce((s, r) => ({ s: s.s + r.supply, v: s.v + r.vat }), { s: 0, v: 0 })
    const t = sum(rs)
    const body = (
      <>
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>일자-No.</th>
            <th>유형명</th>
            <th>전자구분</th>
            <th>거래처명</th>
            <th>세부내역</th>
            <th style={{ textAlign: 'right' }}>{side}공급가액</th>
            <th style={{ textAlign: 'right' }}>{side}부가세</th>
          </tr>
        </thead>
        <tbody>
          {rs.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>}
          {months.map((mo) => {
            const ms = rs.filter((r) => r.date.slice(0, 7) === mo)
            const s = sum(ms)
            return (
              <Fragment key={mo}>
                {ms.map((r) => (
                  <tr key={r.key}>
                    <td style={{ textAlign: 'center', color: 'var(--ec-blue)' }}>{slash(r.date)} -{r.no}</td>
                    <td>{KIND_NAME}</td>
                    <td></td>
                    <td>{r.partner}</td>
                    <td>{r.text}</td>
                    <td style={{ textAlign: 'right' }}>{won(r.supply)}</td>
                    <td style={{ textAlign: 'right' }}>{won(r.vat)}</td>
                  </tr>
                ))}
                <tr style={SUB_ROW}>
                  <td colSpan={5} style={{ textAlign: 'center' }}>{slash(mo)}  계 ({ms.length} 건)</td>
                  <td style={{ textAlign: 'right' }}>{won(s.s)}</td>
                  <td style={{ textAlign: 'right' }}>{won(s.v)}</td>
                </tr>
              </Fragment>
            )
          })}
          {rs.length > 0 && (
            <tr style={SUB_ROW}>
              <td colSpan={5} style={{ textAlign: 'center' }}>누계 ({rs.length} 건)</td>
              <td style={{ textAlign: 'right' }}>{won(t.s)}</td>
              <td style={{ textAlign: 'right' }}>{won(t.v)}</td>
            </tr>
          )}
        </tbody>
      </>
    )
    return first
      ? <table ref={tableRef} className="w-full text-left" style={{ marginBottom: 16 }}>{body}</table>
      : <table className="w-full text-left" style={{ marginBottom: 16 }}>{body}</table>
  }

  /** 매출집계 · 매입집계 — 거래처(사업자등록번호)마다 한 줄. */
  function summary(side: Side) {
    const m = new Map<string, { reg: string; name: string; n: number; s: number; v: number }>()
    for (const r of rows.filter((x) => x.side === side)) {
      const p = r.partnerId != null ? pById.get(r.partnerId) : undefined
      const k = String(r.partnerId ?? r.partner)
      if (!m.has(k)) m.set(k, { reg: p?.bizRegNo ?? '', name: r.partner, n: 0, s: 0, v: 0 })
      const g = m.get(k)!
      g.n += 1; g.s += r.supply; g.v += r.vat
    }
    const gs = [...m.values()].sort((a, b) => a.reg.localeCompare(b.reg))
    const t = gs.reduce((s, g) => ({ n: s.n + g.n, s: s.s + g.s, v: s.v + g.v }), { n: 0, s: 0, v: 0 })
    return (
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>사업자등록번호</th>
            <th>거래처명</th>
            <th style={{ textAlign: 'right' }}>매수</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>세액</th>
            <th style={{ textAlign: 'right' }}>합계</th>
          </tr>
        </thead>
        <tbody>
          {gs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>}
          {gs.map((g) => (
            <tr key={`${g.reg}${g.name}`}>
              <td>{g.reg}</td>
              <td>{g.name}</td>
              <td style={{ textAlign: 'right' }}>{g.n}</td>
              <td style={{ textAlign: 'right' }}>{won(g.s)}</td>
              <td style={{ textAlign: 'right' }}>{won(g.v)}</td>
              <td style={{ textAlign: 'right' }}>{won(g.s + g.v)}</td>
            </tr>
          ))}
          {gs.length > 0 && ['[사업자등록번호] 계', '누계'].map((l) => (
            <tr key={l} style={SUB_ROW}>
              <td colSpan={2} style={{ textAlign: 'center' }}>{l}</td>
              <td style={{ textAlign: 'right' }}>{t.n}</td>
              <td style={{ textAlign: 'right' }}>{won(t.s)}</td>
              <td style={{ textAlign: 'right' }}>{won(t.v)}</td>
              <td style={{ textAlign: 'right' }}>{won(t.s + t.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <EcListShell
      title="매입/매출장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="매출/매입구분">
          {MODES.map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="vat-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
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
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="부가세유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 140 }}>
            <option value="">전체</option>
            <option value={KIND_NAME}>{KIND_NAME}</option>
          </select>
        </EcCond>
        <EcCond label="세무신고거래처구분">
          {(['전체', '사업자등록번호', '주민등록번호'] as const).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="vat-reg" checked={regKind === v} onChange={() => setRegKind(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={taxOnly} onChange={(e) => setTaxOnly(e.target.checked)} /> 세무신고거래처
          </label>
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: '#c07a00', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>매입/매출장</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
            <span>회사명 : {companyName ?? ''}</span>
            <span>{slash(from)} ~ {slash(to)}</span>
          </div>
          {mode === '매출' && ledger('매출', true)}
          {mode === '매입' && ledger('매입', true)}
          {mode === '매출집계' && summary('매출')}
          {mode === '매입집계' && summary('매입')}
          {mode === '매입/매출' && <>{ledger('매출', true)}{ledger('매입', false)}</>}
        </>
      )}
    </EcListShell>
  )
}
