import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { ymd } from '../../components/EcPeriodPicks'
import type { JournalEntry } from '../../types/api'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { dateNo } from '../../utils/dateNo'
import { saveJournalNav } from '../../utils/journalNav'
import { useCondPickers } from '../../utils/useCondPickers'
import {
  bucketOf, INVOICE_TYPES, salesInvoiceOf, type Bucket, type InvoiceMark, type InvoiceType, type SalesInvoice,
} from '../../utils/salesInvoice'
import { ecConfirm } from '../../components/EcDialog'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface Row { e: JournalEntry; inv: SalesInvoice; bucket: Bucket }
type Card = 'ALL' | 'CREATE_ERROR' | 'NTS_ERROR' | Bucket | 'SENDING' | 'EMAIL_RESERVED' | 'EMAIL_UNRESERVED'
  | 'WAIT_10' | 'EMAIL_UNSENT' | 'EMAIL_FAILED' | 'EMAIL_SENT'

/** 원본 계산서분류 글자 — 우리 부가세유형 '세.계(고정자산)' 은 원본 조건에서 '세금계산서(고정자산)' 이다. */
const TYPE_LABEL: Record<InvoiceType, string> = {
  계산서: '계산서', '계산서(고정자산)': '계산서(고정자산)', 세금계산서: '세금계산서', '세.계(고정자산)': '세금계산서(고정자산)', 영세율: '영세율',
}
const TYPE_ORDER: InvoiceType[] = ['계산서', '계산서(고정자산)', '세금계산서', '세.계(고정자산)', '영세율']
/** 원본 묶음(머리 글자가 있는 칸) — 국세청 전송 · Email 을 하지 않으므로 늘 0. */
const GROUPS: { title: string; cards: { key: Card; label: string }[] }[] = [
  { title: '전송대기', cards: [{ key: 'SENDING', label: '발행중' }, { key: 'EMAIL_RESERVED', label: 'Email예약' }, { key: 'EMAIL_UNRESERVED', label: 'Email미예약' }] },
  { title: '결과대기', cards: [{ key: 'WAIT_10', label: '10분 미만' }] },
  { title: '전송완료', cards: [{ key: 'EMAIL_UNSENT', label: 'Email미발송' }, { key: 'EMAIL_FAILED', label: 'Email발송실패' }, { key: 'EMAIL_SENT', label: 'Email발송완료' }] },
  { title: '기타', cards: [{ key: 'PAPER', label: '종이' }, { key: 'ELSEWHERE', label: '타발행' }, { key: 'LATE', label: '기한후발행' }] },
]
const BUCKET_LABEL: Record<Bucket, string> = { UNSENT: '미발행', PAPER: '종이', ELSEWHERE: '타발행', LATE: '기한후발행' }
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '전월+금월', '이번기수', '직전기수', '종료일'] as const
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 회계 I › 전자(세금)계산서 › <b>(세금)계산서진행단계</b>(C000045) — 2026-10-13 loginaa 실측.
 *
 * <p>줄은 <b>매출 (세금)계산서 회계전표</b> 한 장(일자-No. 가 회계전표 번호) — 매출(세금)계산서요약과 같은 규칙(utils/salesInvoice)이라
 * 두 화면 건수가 같다(원본 2026/01 ~ 2026/10 요약 미발행 38건 = 이 화면 미발행 38건). 예전 화면은 판매조회에서 끊은
 * trade 의 세금계산서(작성 → 발행 → 전송 → 승인)를 보여 회계전표와 따로 놀았다.
 *
 * <p>위 칸: 전체 · 생성오류 · 국세청오류 · 미발행 · [전송대기] 발행중 · Email예약 · Email미예약 · [결과대기] 10분 미만 ·
 * [전송완료] Email미발송 · Email발송실패 · Email발송완료 · [기타] 종이 · 타발행 · 기한후발행. 칸을 누르면 그 줄만.
 * 국세청 전송 · Email 을 하지 않으므로 전자 계산서는 모두 미발행이고, 종이 · 타발행 · 기한후발행은 각종구분값변경에서 매긴 값이다.
 *
 * <p>조건(접힘, [Search(F3)]): 기준일자(기본 전월 1일 ~ 오늘) · 회계전표No. · 거래처 · 금액 ~ · 계산서분류(전체 · 계산서 · 계산서(고정자산) ·
 * 세금계산서 · 세금계산서(고정자산) · 영세율, 모두 켜짐). 격자 [일자-No. · 발행일자 · 거래처명 · 공급가액 · 부가세 · 합계금액 · 종류 ·
 * 전자(세금)계산서 진행단계 · 단계별기능 · 승인번호 · 내역보기 · 인쇄 · 이력], 합계줄 없음.
 *
 * <p>두지 않은 것: 발행일자 · 거래처관리담당자 · 부서 · 프로젝트 · 승인번호 · (세금)계산서구분 · 작성자 · 최종수정자 조건,
 * 단계별기능 [발행] 과 아래 [발행] · [발행취소] · [즉시전송] · [Email …] · [인증서관리] · [자동알림](국세청 · 메일로 나가는 것 — 잠가 둔다),
 * 내역보기 · 거래명세서 · 이력 창. 타발행 · 기한후발행을 매긴 줄의 진행단계 글자는 원본에서 남의 전표라 매겨 보지 못했다.
 */
export default function TaxInvoiceProgressPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [from, setFrom] = useState(ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)))
  const [to, setTo] = useState(ymd(today))
  const [docCond, setDocCond] = useState('')
  const pickers = useCondPickers(['partners'])
  const [partnerCond, setPartnerCond] = useState('')
  const [minCond, setMinCond] = useState('')
  const [maxCond, setMaxCond] = useState('')
  const [types, setTypes] = useState<Set<InvoiceType>>(new Set(INVOICE_TYPES))
  const [fiscalStart, setFiscalStart] = useState(1)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [marks, setMarks] = useState<Map<number, InvoiceMark>>(new Map())
  const [period, setPeriod] = useState({ from, to })
  const [card, setCard] = useState<Card>('ALL')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => undefined)
  }, [])

  async function load(f = from, t = to) {
    setError('')
    try {
      const [j, m] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from: f, to: t, all: true } }),
        api.get<InvoiceMark[]>('/vat-invoice-marks'),
      ])
      setEntries(j.data.rows)
      setMarks(new Map(m.data.map((x) => [x.journalEntryId, x])))
      setPeriod({ from: f, to: t })
      setPicked(new Set())
    } catch (e) {
      setEntries([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  /** 조건에 맞는 매출 (세금)계산서 전표 — 칸 숫자는 이것으로 센다. 원본처럼 최근 일자부터. */
  const rows = useMemo(() => {
    const min = minCond === '' ? null : Number(minCond)
    const max = maxCond === '' ? null : Number(maxCond)
    const out: Row[] = []
    for (const e of entries as (JournalEntry & { vatType?: string | null })[]) {
      const inv = salesInvoiceOf(e)
      if (!inv || !types.has(inv.type)) continue
      if (docCond.trim() && !dateNo(e.entryDate, e.docNo).includes(docCond.trim()) && !e.docNo.includes(docCond.trim())) continue
      if (partnerCond && String(e.partnerId) !== partnerCond) continue
      const total = inv.supply + inv.vat
      if (min != null && total < min) continue
      if (max != null && total > max) continue
      out.push({ e, inv, bucket: bucketOf(marks.get(e.id)) })
    }
    return out.sort((a, b) => (a.e.entryDate !== b.e.entryDate ? b.e.entryDate.localeCompare(a.e.entryDate) : b.e.docNo.localeCompare(a.e.docNo)))
  }, [entries, marks, types, docCond, partnerCond, minCond, maxCond])

  const countOf = (c: Card) => (c === 'ALL' ? rows.length : rows.filter((r) => r.bucket === c).length)
  const shown = card === 'ALL' ? rows : rows.filter((r) => r.bucket === card)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '(세금)계산서진행단계', [shown.length])
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.e.id))

  const slipUrl = (r: Row) => (r.e.sourceType as string) === 'VAT_SALES' ? `/accounting/sales-slip?journal=${r.e.id}` : `/accounting/journals?entryId=${r.e.id}`
  function openSlip(r: Row) {
    saveJournalNav(shown.map(slipUrl))
    navigate(slipUrl(r))
  }

  async function mark(r: Row, progress: 'ELSEWHERE' | 'LATE') {
    /* 각종구분값변경과 같은 확인 창 — 기한후발행만 묻는다(타발행은 원본도 바로 바뀐다). */
    if (progress === 'LATE' && !(await ecConfirm('선택하신 전표를 기한 후 발행으로 변환하시겠습니까?'))) return
    try {
      await api.post('/vat-invoice-marks/progress', { ids: [r.e.id], progress })
      await load(period.from, period.to)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const toggleType = (t: InvoiceType | 'ALL') => setTypes((s) => {
    if (t === 'ALL') return s.size === INVOICE_TYPES.length ? new Set() : new Set(INVOICE_TYPES)
    const n = new Set(s)
    if (n.has(t)) n.delete(t); else n.add(t)
    return n
  })

  /* 원본 .score-box(2026-10-13 실측): 64.6×40.9 · 테두리 0.5 · 둥글기 10 · 위 숫자 14px(흰 바탕) · 아래 이름 12px(막힘색 바탕, 아래 둥글기 8).
     [전체]는 파랑, 생성오류 · 국세청오류는 --ec-text-danger — 테두리 · 숫자 글자 · 이름 바탕이 그 색이다. 고른 칸은 파랑. */
  const scoreBox = (key: Card, label: string, tone: 'plain' | 'blue' | 'danger' = 'plain') => {
    const t = card === key ? 'blue' : tone
    const line = t === 'blue' ? 'border-ec-blue' : t === 'danger' ? 'border-[var(--ec-text-danger)]' : 'border-ec-line'
    const num = t === 'blue' ? 'text-ec-blue' : t === 'danger' ? 'text-[var(--ec-text-danger)]' : 'text-ec-ink'
    const name = t === 'blue' ? 'bg-ec-blue text-ec-panel' : t === 'danger' ? 'bg-[var(--ec-text-danger)] text-ec-panel' : 'bg-ec-disabled text-ec-ink'
    return (
      <button key={key} type="button" onClick={() => setCard(key)}
              className={`inline-flex flex-col min-w-[64.6px] my-[4.75px] ml-[4.75px] p-0 rounded-ec border-[0.5px] border-solid overflow-hidden cursor-pointer bg-ec-panel ${line}`}>
        <span className={`block h-[21px] leading-[21px] text-[14px] text-center ${num}`}>{countOf(key)}</span>
        <span className={`block h-[18.9px] pt-[0.9px] px-[2.7px] text-[12px] text-center whitespace-nowrap rounded-b-[8px] ${name}`}>{label}</span>
      </button>
    )
  }

  return (
    <EcListShell
      title="(세금)계산서진행단계"
      onSearch={() => void load()}
      collapseConditions
      actions={[
        { label: '발행', primary: true, disabled: true },
        { label: '발행취소', disabled: true },
        { label: '매출전표 I 생성', onClick: () => navigate('/accounting/sales-slip') },
        { label: '즉시전송', disabled: true },
        { label: 'Email', disabled: true },
        { label: 'Email예약', disabled: true },
        { label: 'Email예약취소', disabled: true },
        { label: '인쇄' },
        { label: '인증서관리', disabled: true },
        { label: 'Excel' },
        { label: '자동알림', disabled: true },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          ~
          <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input w-full" placeholder="회계전표No." value={docCond} onChange={(e) => setDocCond(e.target.value)} />
        </EcCond>
        <EcCond label="거래처">
          <CodePickerField label="거래처" hideLabel fill emptyLabel="전체" value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="금액">
          <input className="ec-input w-[150px] text-right" inputMode="numeric" placeholder="금액" value={minCond} onChange={(e) => setMinCond(e.target.value.replace(/[^\d-]/g, ''))} />
          ~
          <input className="ec-input w-[150px] text-right" inputMode="numeric" value={maxCond} onChange={(e) => setMaxCond(e.target.value.replace(/[^\d-]/g, ''))} />
        </EcCond>
        <EcCond label="계산서분류">
          <label className="inline-flex items-center gap-[3px] mr-[10px]">
            <input type="checkbox" checked={types.size === INVOICE_TYPES.length} onChange={() => toggleType('ALL')} /> 전체
          </label>
          {TYPE_ORDER.map((t) => (
            <label key={t} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="checkbox" checked={types.has(t)} onChange={() => toggleType(t)} /> {TYPE_LABEL[t]}
            </label>
          ))}
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
            <EcPeriodPicks labels={PICKS} currentFrom={from} fiscalStart={fiscalStart}
                           onPick={(r) => { setFrom(r.from); setTo(r.to); void load(r.from, r.to) }} />
          </div>
        </li>
      </ul>

      <div className="inline-flex flex-wrap items-end my-[3.6px] mb-[8px] pr-[4.75px] rounded-ec border-[0.5px] border-solid border-ec-line-soft">
        {scoreBox('ALL', '전체', 'blue')}
        {scoreBox('CREATE_ERROR', '생성오류', 'danger')}
        {scoreBox('NTS_ERROR', '국세청오류', 'danger')}
        {scoreBox('UNSENT', '미발행')}
        {GROUPS.map((g) => (
          <div key={g.title} className="inline-flex flex-wrap my-[4.5px] ml-[4.5px] pr-[4.75px] rounded-ec border-[0.5px] border-solid border-ec-line-soft bg-ec-panel">
            <div className="w-full h-[21.6px] py-[1.8px] mr-[-4.75px] rounded-t-[8px] bg-ec-line-soft text-center">{g.title}</div>
            {g.cards.map((c) => scoreBox(c.key, c.label))}
          </div>
        ))}
      </div>

      <p className="text-right mb-[4px]">{period.from.replace(/-/g, '/')} ~ {period.to.replace(/-/g, '/')}</p>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full whitespace-nowrap">
          <thead>
            <tr>
              <th className="w-[47px] text-center">
                <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                       onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r) => r.e.id)))} />
              </th>
              <th className="text-center">일자-No.</th>
              <th>발행일자</th>
              <th>거래처명</th>
              <th className="text-right">공급가액</th>
              <th className="text-right">부가세</th>
              <th className="text-right">합계금액</th>
              <th>종류</th>
              <th>전자(세금)계산서 진행단계</th>
              <th>단계별기능</th>
              <th>승인번호</th>
              <th>내역보기</th>
              <th className="text-center">인쇄</th>
              <th className="text-center">이력</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={14} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.e.id}>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${dateNo(r.e.entryDate, r.e.docNo)} 선택`} checked={picked.has(r.e.id)}
                         onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.e.id)) n.delete(r.e.id); else n.add(r.e.id); return n })} />
                  {' '}{i + 1}
                </td>
                <td className="text-center"><a className="text-ec-navy cursor-pointer" onClick={() => openSlip(r)}>{dateNo(r.e.entryDate, r.e.docNo)}</a></td>
                <td></td>
                <td>{r.e.partnerName ?? ''}</td>
                <td className="text-right">{won(r.inv.supply)}</td>
                <td className="text-right">{won(r.inv.vat)}</td>
                <td className="text-right">{won(r.inv.supply + r.inv.vat)}</td>
                <td className="text-ec-navy">{r.bucket === 'PAPER' ? '종이' : '전자'}</td>
                <td>
                  {/* 원본: 다섯 단계 점 가운데 지금 단계까지 채우고 옆에 단계 이름. 국세청으로 보내지 않으므로 늘 첫 단계다. */}
                  <span className="inline-flex items-center gap-[4px] mr-[8px] align-middle" aria-hidden>
                    {[0, 1, 2, 3, 4].map((k) => <i key={k} className={`inline-block w-[9px] h-[9px] rounded-full ${k === 0 ? 'bg-ec-blue' : 'bg-ec-disabled'}`} />)}
                  </span>
                  {BUCKET_LABEL[r.bucket]}
                </td>
                <td>
                  {r.bucket === 'UNSENT' && (
                    <span className="inline-flex gap-[6px]">
                      <a className="text-ec-hint" title="국세청 전송은 하지 않습니다">발행</a>
                      <a className="text-ec-navy cursor-pointer" onClick={() => void mark(r, 'ELSEWHERE')}>타발행</a>
                      <a className="text-ec-navy cursor-pointer" onClick={() => void mark(r, 'LATE')}>기한후발행</a>
                    </span>
                  )}
                </td>
                <td></td>
                <td><a className="text-ec-navy cursor-pointer" onClick={() => openSlip(r)}>내역보기</a></td>
                <td className="text-center"><a className="text-ec-navy">인쇄</a></td>
                <td className="text-center"><a className="text-ec-navy">이력</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
