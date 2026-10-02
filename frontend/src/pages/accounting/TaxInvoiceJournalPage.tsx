import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [YYYY/MM 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게, 앞 두 칸 묶음. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

type Side = '매출' | '매입'
interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; code: string; name: string; manager: string | null; taxReport: boolean }
/** 부가세 계정(StandardAccounts) — 매출 255 부가세예수금, 매입 135 부가세대급금. 이 줄이 든 회계전표가 한 줄이다(매입/매출장과 같다). */
const VAT_CODE: Record<Side, string> = { 매출: '255', 매입: '135' }
const KIND_NAME = '세금계산서'
type Status = '전체' | '결재중' | '미확인' | '확인'
interface Row { key: string; date: string; no: string; partner: string; supply: number; vat: number; fromSlip: boolean }

/**
 * 회계 I &gt; 출력물 &gt; 기타 &gt; <b>매출(세금)계산서현황</b>(E010845) · <b>매입(세금)계산서현황</b>(E010846) — 2026-10-03 loginaa 실측.
 *
 * <p>조건: 기준일자(구간 — 매출은 기본 <b>최근30일</b>, 빠른선택 금일 … 전월 · 종료일 · 최근30일 / 매입은 기본 <b>금월(~오늘)</b>,
 * 빠른선택 금일 … 전월 · 종료일) · 회계전표No. · 부서 · 프로젝트 · 거래처 · 거래처관리담당자 · 기타([세무신고거래처], 매출에만) ·
 * 부가세유형 · 상태(전체 · 결재중 · 미확인 · <b>확인</b>) · 적용양식 · 데이터 보기형식.
 *
 * <p>열: 일자-No. · 거래처명 · 공급가액 · 매출(매입)부가세 · 매출(매입)합계 · 내역보기, 달마다 [YYYY/MM 계], 끝 [합계](앞 두 칸 묶음).
 * [내역보기]는 판매 · 구매 전표에서 온 줄이면 '내역보기 거래명세서', 회계에서 바로 쓴 줄이면 '회계 I' 이다.
 * 우리 회계전표는 결재를 거치지 않고 저장하면 곧 확인이라 [상태]는 확인 · 전체만 줄이 나오고 결재중 · 미확인은 비어 있다.
 * 부서 · 프로젝트는 회계전표에 없다.
 */
export default function TaxInvoiceJournalPage({ side }: { side: Side }) {
  const { companyName } = useAuth()
  const init = side === '매출' ? periodOf('최근30일')! : periodOf('금월(~오늘)')!
  const title = side === '매출' ? '매출(세금)계산서현황' : '매입(세금)계산서현황'
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [manager, setManager] = useState('')
  const [taxOnly, setTaxOnly] = useState(false)
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState<Status>('확인')
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
    if (status === '결재중' || status === '미확인') return [] as Row[]
    if (kind && kind !== KIND_NAME) return [] as Row[]
    const out: Row[] = []
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      const p = e.partnerId != null ? pById.get(e.partnerId) : undefined
      if (docNo && !e.docNo.includes(docNo)) continue
      if (partner && String(e.partnerId) !== partner) continue
      if (manager && (p?.manager ?? '') !== manager) continue
      if (taxOnly && !p?.taxReport) continue
      const vatLines = e.lines.filter((l) => l.accountCode === VAT_CODE[side])
      if (vatLines.length === 0) continue
      const others = e.lines.filter((l) => l.accountCode !== VAT_CODE[side])
      const vat = vatLines.reduce((s, l) => s + (side === '매출' ? Number(l.credit) - Number(l.debit) : Number(l.debit) - Number(l.credit)), 0)
      const supply = others.reduce((s, l) => s + (side === '매출' ? Number(l.credit) : Number(l.debit)), 0)
      out.push({ key: String(e.id), date: e.entryDate, no: e.docNo, partner: e.partnerName ?? '', supply, vat,
        fromSlip: e.sourceType === 'SALES' || e.sourceType === 'PURCHASE' })
    }
    return out
  }, [entries, pById, docNo, partner, manager, taxOnly, kind, status, side])
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))]
  const sum = (rs: Row[]) => rs.reduce((s, r) => ({ s: s.s + r.supply, v: s.v + r.vat }), { s: 0, v: 0 })
  const total = sum(rows)
  const managers = useMemo(() => [...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort(), [partners])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [rows.length])

  return (
    <EcListShell
      title={side === '매출' ? '매출(세금)계산서현황' : '매입(세금)계산서현황'}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setDocNo(''); setPartner(''); setManager(''); setTaxOnly(false); setKind(''); setStatus('확인') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={side === '매출' ? NOTE_FLOW_PICKS : INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={180} emptyLabel="전체" value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        {side === '매출' && (
          <EcCond label="기타">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
              <input type="checkbox" checked={taxOnly} onChange={(e) => setTaxOnly(e.target.checked)} /> 세무신고거래처
            </label>
          </EcCond>
        )}
        <EcCond label="부가세유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 140 }}>
            <option value="">전체</option>
            <option value={KIND_NAME}>{KIND_NAME}</option>
          </select>
        </EcCond>
        <EcCond label="상태">
          {(['전체', '결재중', '미확인', '확인'] as Status[]).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name={`tij-status-${side}`} checked={status === v} onChange={() => setStatus(v)} /> {v}
            </label>
          ))}
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: '#c07a00', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>{side === '매출' ? '매출(세금)계산서현황' : '매입(세금)계산서현황'}</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
        <span>회사명 : {companyName ?? ''}</span>
        <span>{slash(from)} ~ {slash(to)}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>일자-No.</th>
            <th>거래처명</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>{side}부가세</th>
            <th style={{ textAlign: 'right' }}>{side}합계</th>
            <th style={{ textAlign: 'center' }}>내역보기</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {months.map((mo) => {
                const ms = rows.filter((r) => r.date.slice(0, 7) === mo)
                const s = sum(ms)
                return (
                  <Fragment key={mo}>
                    {ms.map((r) => (
                      <tr key={r.key}>
                        <td style={{ textAlign: 'center', color: 'var(--ec-blue)' }}>{slash(r.date)} -{r.no}</td>
                        <td>{r.partner}</td>
                        <td style={{ textAlign: 'right' }}>{won(r.supply)}</td>
                        <td style={{ textAlign: 'right' }}>{won(r.vat)}</td>
                        <td style={{ textAlign: 'right' }}>{won(r.supply + r.vat)}</td>
                        <td style={{ textAlign: 'center', color: 'var(--ec-blue)' }}>{r.fromSlip ? '내역보기 거래명세서' : '회계 I'}</td>
                      </tr>
                    ))}
                    <tr style={SUB_ROW}>
                      <td colSpan={2} style={{ textAlign: 'center' }}>{slash(mo)}  계</td>
                      <td style={{ textAlign: 'right' }}>{won(s.s)}</td>
                      <td style={{ textAlign: 'right' }}>{won(s.v)}</td>
                      <td style={{ textAlign: 'right' }}>{won(s.s + s.v)}</td>
                      <td></td>
                    </tr>
                  </Fragment>
                )
              })}
              <tr style={SUB_ROW}>
                <td colSpan={2} style={{ textAlign: 'center' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(total.s)}</td>
                <td style={{ textAlign: 'right' }}>{won(total.v)}</td>
                <td style={{ textAlign: 'right' }}>{won(total.s + total.v)}</td>
                <td></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}
