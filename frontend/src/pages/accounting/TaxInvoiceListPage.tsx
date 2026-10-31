import { useEffect, useMemo, useRef, useState } from 'react'
import { vatSlipAmounts } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { SALES_TAX_LIST_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { JournalEntry } from '../../types/api'
import { loadSupplierParty, type DocParty } from '../../utils/printDocument'
import type { PaperParty, PaperVoucher } from '../../features/taxvoucher/components/TaxInvoicePaper'
import TradeDetailModal from '../../features/taxvoucher/components/TradeDetailModal'
import TaxInvoicePaperModal from '../../features/taxvoucher/components/TaxInvoicePaperModal'
import TaxVoucherForm, { voucherFormOf, type PartnerOpt, type Voucher, type VoucherForm } from '../../features/taxvoucher/components/TaxVoucherForm'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { fmtAmountBlank } from '../../utils/format'

type Side = '매출' | '매입'
type Status = '전체' | '결재중' | '미확인' | '확인'
interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
/** 내역보기: 판매 · 구매 전표면 거래명세서, 회계에서 바로 쓴 전표면 회계 I, (세금)계산서발행/수령에서 쓴 계산서면 세무. */
type Source = '거래명세서' | '회계 I' | '세무'
interface Row { key: string; date: string; no: string; partnerId: number | null; partner: string; supply: number; vat: number; source: Source; voucher?: Voucher; sourceId?: number | null }
const STATUSES: Status[] = ['전체', '결재중', '미확인', '확인']

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>매출(세금)계산서조회(세무)</b>(E030203) · <b>매입(세금)계산서조회(세무)</b>(E030204, 원본 화면 제목은
 * '매입청구서조회') — 2026-10-04 loginaa 실측.
 *
 * <p>위 알약 [전체 · 결재중 · 미확인 · <b>확인</b>], 기간은 접힌 조건(기본 최근30일(+1개월) — 오늘 한 달 전 같은 날 ~ 한 달 뒤 전날),
 * 목록 [☐ · 일자-번호 · 거래처명 · 공급가액 · 부가세 · 합계 · 내역보기], 최근 일자부터. [내역보기]는 판매 · 구매 전표에서 온 줄이면
 * '내역보기 거래명세서', 회계에서 바로 쓴 줄이면 '회계 I'. 줄은 부가세 줄(매출 255 · 매입 135)이 든 회계전표 한 장이다 — 회계 I 의
 * 매출(세금)계산서현황과 같은 셈(utils/vatSlip). 우리 회계전표는 결재를 거치지 않아 결재중 · 미확인은 늘 비어 있다.
 * (세금)계산서발행/수령(E030202)에서 쓴 계산서도 한 줄씩 싣는다 — 분개가 없는 부가세 신고용 자료라 [내역보기]는 '세무'
 * (2026-10-12 원본에서 매출 100,000 을 저장해 확인).
 *
 * <p>2026-10-20 다시 잼: 매출 끝 [인쇄] 열 → '청구서' 창(종이 세금계산서 두 장, (세금)계산서발행/수령과 같은 창 — '회계 I' 줄도 뜬다),
 * 매입은 [인쇄] 열이 없고 [내역보기] 가 그냥 '내역보기'. '세무' 줄의 일자-번호를 누르면 (세금)계산서발행/수령의 매출 · 매입 창이 떠
 * 그 자리에서 고치고 [삭제] 한다(원본 2026/10/20-5 를 200,000 으로 고치고 지움).
 *
 * <p>두지 않은 것: [Email](바깥 전송) · [대화방] · [인쇄] · [확인취소] · [선택삭제] · [Excel] — 확인취소 · 선택삭제는 원본에서 남의 자료를
 * 지워 보지 않고는 잴 수 없었다.
 */
/** title — 회계 I › 회계거래관리 의 같은 화면은 제목만 '매출(세금)계산서조회'(2026-10-20 실측, 격자 · 단추 같음). */
export default function TaxInvoiceListPage({ side, title: titleProp }: { side: Side; title?: string }) {
  const init = periodOf('최근30일(+1개월)')!
  const title = titleProp ?? (side === '매출' ? '매출(세금)계산서조회(세무)' : '매입청구서조회')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [status, setStatus] = useState<Status>('확인')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [company, setCompany] = useState<DocParty | null>(null)
  const [form, setForm] = useState<VoucherForm | null>(null)
  const [paper, setPaper] = useState<Row | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  /* 조건 — [검색] 을 누를 때 걸린다(applied). 발송여부는 매출만. 이 앱의 계산서는 메일을 보내는 길이 없어 모두 미발송이다. */
  const [docNo, setDocNo] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [sent, setSent] = useState<'' | 'N' | 'Y'>('')
  const [applied, setApplied] = useState({ docNo: '', partnerId: '', sent: '' as '' | 'N' | 'Y' })

  async function load() {
    setError('')
    setApplied({ docNo: docNo.trim(), partnerId, sent })
    try {
      const [r, v] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from, to, all: true } }),
        api.get<Voucher[]>('/tax-vouchers', { params: { from, to, side: side === '매출' ? 'SALES' : 'PURCHASE' } }),
      ])
      setEntries(r.data.rows)
      setVouchers(v.data)
      setPicked(new Set())
    } catch (e) {
      setEntries([]); setVouchers([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])
  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
    void loadSupplierParty().then(setCompany)
  }, [])

  const sales = side === '매출'
  const rows = useMemo(() => {
    if (status === '결재중' || status === '미확인') return [] as Row[]
    const out: Row[] = []
    for (const e of entries) {
      const amt = vatSlipAmounts(e.lines, side)
      if (!amt) continue
      out.push({ key: String(e.id), date: e.entryDate, no: e.docNo, partnerId: e.partnerId ?? null, partner: e.partnerName ?? '', supply: amt.supply, vat: amt.vat,
        source: e.sourceType === 'SALES' || e.sourceType === 'PURCHASE' ? '거래명세서' : '회계 I', sourceId: e.sourceId })
    }
    for (const v of vouchers) {
      out.push({ key: `tv-${v.id}`, date: v.entryDate, no: String(v.entryNo), partnerId: v.partnerId, partner: v.partnerName,
        supply: Number(v.supplyAmount), vat: Number(v.vatAmount), source: '세무', voucher: v })
    }
    const f = out.filter((r) => (!applied.docNo || dateNo(r.date, r.no).includes(applied.docNo))
      && (!applied.partnerId || String(r.partnerId) === applied.partnerId)
      && (applied.sent !== 'Y' || !sales))
    return f.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.no.localeCompare(a.no)))
  }, [entries, vouchers, status, side, applied, sales])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [rows.length])
  const allPicked = rows.length > 0 && picked.size === rows.length
  const cols = sales ? 8 : 7

  /** 청구서 두 장 — 매출은 우리 회사가 공급자, 거래처가 공급받는자. */
  const paperOf = (r: Row): { v: PaperVoucher; supplier: PaperParty; buyer: PaperParty } => {
    const p = partners.find((x) => x.id === r.partnerId)
    return {
      v: { entryDate: r.date, entryNo: Number(r.no.split('-').pop()) || 0, supplyAmount: r.supply, vatAmount: r.vat,
           totalAmount: r.supply + r.vat, remark: r.voucher?.remark ?? null },
      supplier: { bizRegNo: company?.bizRegNo, name: company?.name, ceo: company?.ceo, address: company?.address, bizType: company?.bizType, bizItem: company?.bizItem },
      buyer: { bizRegNo: p?.bizRegNo, name: p?.name ?? r.partner, ceo: p?.ceoName, address: p?.address, bizType: p?.bizType, bizItem: p?.bizItem },
    }
  }

  return (
    <EcListShell title={title} onSearch={load} collapseConditions
      actions={sales ? [{ label: 'Email', disabled: true }, { label: '대화방', disabled: true }, { label: '인쇄' }, { label: '확인취소', disabled: true }, { label: '선택삭제', disabled: true, selected: picked.size }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[150px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[150px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <EcPeriodPicks labels={SALES_TAX_LIST_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input w-[150px]" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
        </EcCond>
        {/* 원본 조건 판(2026-10-21 실측, 세무 매출 · 매입계산서조회): 기준일자 · 회계전표No. · 부서 · 프로젝트 · 거래처 · 거래처관리담당자 · 부가세유형 · 최종수정자 · 발송여부(매출) · 양식 · 적용양식.
            부서 · 프로젝트 · 담당자 · 부가세유형 · 최종수정자는 우리 전표에 없는 값이라 칸 모양만 둔다. */}
        <EcCond label="부서"><input className="ec-input w-[170px]" placeholder="부서" disabled /></EcCond>
        <EcCond label="프로젝트"><input className="ec-input w-[170px]" placeholder="프로젝트" disabled /></EcCond>
        <EcCond label="거래처">
          <CodePickerField label="거래처" hideLabel pair emptyLabel="(전체)" value={partnerId} onChange={setPartnerId}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="거래처관리담당자"><input className="ec-input w-[170px]" placeholder="거래처관리담당자" disabled /></EcCond>
        <EcCond label="부가세유형"><input className="ec-input w-[170px]" placeholder="부가세유형" disabled /></EcCond>
        <EcCond label="최종수정자"><input className="ec-input w-[170px]" placeholder="최종수정자" disabled /></EcCond>
        {sales && (
          <EcCond label="발송여부">
            <select className="ec-input w-[100px]" value={sent} onChange={(e) => setSent(e.target.value as '' | 'N' | 'Y')}>
              <option value="">전체</option><option value="N">미발송</option><option value="Y">발송</option>
            </select>
          </EcCond>
        )}
        <EcCond label="적용양식">
          <select className="ec-input w-[170px]" aria-label="적용양식" defaultValue="기본"><option value="기본">기본(수정불가)</option></select>
        </EcCond>
        <li className="full">
          <div className="form">
            <button className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
          </div>
        </li>
      </ul>

      <div className="ec-pills mb-[8px]">
        {STATUSES.map((s) => (
          <button key={s} className={`ec-pill${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      <p className="text-right mb-[4px]">{from.replace(/-/g, '/')} ~ {to.replace(/-/g, '/')}</p>

      <table ref={tableRef} className="w-full">
        <thead>
          <tr>
            <th className="w-[47px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.key)))} />
            </th>
            <th className="text-center">일자 - 번호</th>
            <th>거래처명</th>
            <th className="text-right">공급가액</th>
            <th className="text-right">부가세</th>
            <th className="text-right">합 계</th>
            <th className="text-center">내역보기</th>
            {sales && <th className="text-center w-[88px]">인쇄</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.key}>
              <td className="text-center whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.no} 선택`} checked={picked.has(r.key)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center text-ec-blue">
                {r.voucher
                  ? <button className="ec-link" onClick={() => setForm(voucherFormOf(r.voucher!))}>{dateNo(r.date, r.no)}</button>
                  : dateNo(r.date, r.no)}
              </td>
              <td>{r.partner}</td>
              <td className="text-right">{fmtAmountBlank(r.supply)}</td>
              <td className="text-right">{fmtAmountBlank(r.vat)}</td>
              <td className="text-right">{fmtAmountBlank(r.supply + r.vat)}</td>
              <td className={`text-center${r.source === '거래명세서' ? ' text-ec-blue' : ''}`}>
                {r.source === '거래명세서'
                  ? <><button className="ec-link" onClick={() => setDetail(r)}>내역보기</button>{sales ? ' 거래명세서' : ''}</>
                  : r.source}
              </td>
              {sales && <td className="text-center"><button className="ec-link" onClick={() => setPaper(r)}>인쇄</button></td>}
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <TaxVoucherForm initial={form} partners={partners} onClose={() => setForm(null)}
                        onSaved={async (saved, print, after) => {
                          if (after) { await load(); return }
                          setForm(null); await load()
                          if (print && saved) setPaper({ key: `tv-${saved.id}`, date: saved.entryDate, no: String(saved.entryNo), partnerId: saved.partnerId,
                            partner: saved.partnerName, supply: Number(saved.supplyAmount), vat: Number(saved.vatAmount), source: '세무', voucher: saved })
                        }} />
      )}
      {detail && <TradeDetailModal side={side} entryDate={detail.date} entryNo={detail.no} slipId={detail.sourceId ?? null} onClose={() => setDetail(null)} />}
      {paper && (() => { const x = paperOf(paper); return <TaxInvoicePaperModal v={x.v} supplier={x.supplier} buyer={x.buyer} onClose={() => setPaper(null)} /> })()}
    </EcListShell>
  )
}
