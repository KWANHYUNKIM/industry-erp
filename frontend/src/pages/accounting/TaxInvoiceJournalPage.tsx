import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { vatSlipAmounts } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { INQUIRY_PICKS, NOTE_FLOW_PICKS, SALES_TAX_STOCK_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [YYYY/MM 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게, 앞 두 칸 묶음. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

type Side = '매출' | '매입'
interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; code: string; name: string; manager: string | null; taxReport: boolean }
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
/**
 * menu='세무' — 세무 › 부가세 › 신고전검토자료의 매출(세금)계산서현황(세무) E030212 · 매입(세금)계산서현황(세무). 원본 판이 회계 I 판과
 * 같고(조건 · 상태 기본 확인) 제목에 '(세무)' 가 붙고 기간 빠른선택에 직전분기 · 직전반기 · 최근30일이 붙는다(2026-10-04 실측).
 */
export default function TaxInvoiceJournalPage({ side, menu }: { side: Side; menu?: '세무' }) {
  const { companyName } = useAuth()
  const init = side === '매출' ? periodOf('최근30일')! : periodOf('금월(~오늘)')!
  const title = (side === '매출' ? '매출(세금)계산서현황' : '매입(세금)계산서현황') + (menu === '세무' ? '(세무)' : '')
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
      /* 반품(역분개)은 공급가액도 음수다 — utils/vatSlip. */
      const amt = vatSlipAmounts(e.lines, side)
      if (!amt) continue
      const { supply, vat } = amt
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
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setDocNo(''); setPartner(''); setManager(''); setTaxOnly(false); setKind(''); setStatus('확인') } },
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
            <EcPeriodPicks labels={menu === '세무' ? SALES_TAX_STOCK_PICKS : side === '매출' ? NOTE_FLOW_PICKS : INQUIRY_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
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
            <label className="inline-flex items-center gap-[3px] text-[12.5px]">
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
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name={`tij-status-${side}`} checked={status === v} onChange={() => setStatus(v)} /> {v}
            </label>
          ))}
        </EcCond>
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">{side === '매출' ? '매출(세금)계산서현황' : '매입(세금)계산서현황'}</h3>
      <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
        <span>회사명 : {companyName ?? ''}</span>
        <span>{slash(from)} ~ {slash(to)}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="text-center">일자-No.</th>
            <th>거래처명</th>
            <th className="text-right">공급가액</th>
            <th className="text-right">{side}부가세</th>
            <th className="text-right">{side}합계</th>
            <th className="text-center">내역보기</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {months.map((mo) => {
                const ms = rows.filter((r) => r.date.slice(0, 7) === mo)
                const s = sum(ms)
                return (
                  <Fragment key={mo}>
                    {ms.map((r) => (
                      <tr key={r.key}>
                        <td className="text-center text-ec-blue">{dateNo(r.date, r.no)}</td>
                        <td>{r.partner}</td>
                        <td className="text-right">{won(r.supply)}</td>
                        <td className="text-right">{won(r.vat)}</td>
                        <td className="text-right">{won(r.supply + r.vat)}</td>
                        <td className="text-center text-ec-blue">{r.fromSlip ? '내역보기 거래명세서' : '회계 I'}</td>
                      </tr>
                    ))}
                    <tr style={SUB_ROW}>
                      <td colSpan={2} className="text-center">{slash(mo)}  계</td>
                      <td className="text-right">{won(s.s)}</td>
                      <td className="text-right">{won(s.v)}</td>
                      <td className="text-right">{won(s.s + s.v)}</td>
                      <td></td>
                    </tr>
                  </Fragment>
                )
              })}
              <tr style={SUB_ROW}>
                <td colSpan={2} className="text-center">합계</td>
                <td className="text-right">{won(total.s)}</td>
                <td className="text-right">{won(total.v)}</td>
                <td className="text-right">{won(total.s + total.v)}</td>
                <td></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}
