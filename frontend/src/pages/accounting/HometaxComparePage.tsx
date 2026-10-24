import { useEffect, useMemo, useRef, useState } from 'react'
import { vatSlipAmounts, type VatSide } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { EcReportFoot, reportPeriod } from '../../components/EcReportFrame'
import type { JournalEntry } from '../../types/api'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface PartnerOpt { id: number; code: string; name: string; bizRegNo: string | null }
type Basis = '전체' | '일치' | '불일치'
interface Row { key: string; taxCode: string; name: string; count: number; supply: number; vat: number }

const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '이번기수', '직전기수', '직전분기', '직전반기', '종료일', '최근30일'] as const
const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>이카운트 vs 홈택스 자료비교</b>(E010726) — 2026-10-04 loginaa 실측.
 *
 * <p>조건 [기준일자(기본 최근30일 — 10/04 에 2026/09/04 ~ 10/04) · 거래처 · 세무신고거래처코드 · 거래처관리담당자 · 매입/매출구분 ◉매출 ·
 * 계산서분류 · 세금계산서종류 · 구분 ◉거래처별 ○건별(국세청) · 자료기준 ○전체 ○일치 ◉불일치 □일자 불일치 제외].
 * 판은 '1. 국세청 자료 (불일치)' 아래 [세무신고거래처 · 거래처명 · ERP(미확인건수 · 확인건수 · 공급가액 · 부가세 · 합계) ·
 * 국세청(건수 · 공급가액 · 부가세 · 합계) · 차이(건수 · 공급가액 · 부가세 · 합계)], 거래처 한 줄. 세무신고거래처는 사업자등록번호, 없으면 거래처코드.
 * 원본 2026/09/04~10/04 매출: 이카운트 1 · 4,000,000 · 400,000 / 조명공장 1 · 15,105 · 1,511 / ㅎㄴ222 2 · 1,300,000 · 130,000 /
 * (주)구로 1 · 2,000,000 · 200,000 — 국세청 0 건이라 차이가 ERP 그대로. 우리 줄은 부가세 줄이 든 회계전표(utils/vatSlip)이고
 * 결재가 없어 모두 확인건수다.
 *
 * <p>두지 않은 것: [즉시조회] · [인증서관리](홈택스 연동 — 바깥 전송), [ERP전표생성](국세청 자료가 있어야 쓴다), 건별(국세청) ·
 * 일자 불일치 제외 · 계산서분류 · 세금계산서종류 · 거래처 · 담당자 조건. 국세청 쪽은 늘 비어 있다.
 */
export default function HometaxComparePage() {
  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [side, setSide] = useState<VatSide>('매출')
  const [basis, setBasis] = useState<Basis>('불일치')
  const [fiscalStart, setFiscalStart] = useState(1)
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [shown, setShown] = useState({ from, to, side, basis })
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => undefined)
  }, [])

  async function search() {
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      setEntries(r.data.rows); setShown({ from, to, side, basis })
    } catch (e) {
      setEntries(null); setError(extractErrorMessage(e))
    }
  }

  const rows = useMemo(() => {
    if (!entries) return [] as Row[]
    const partnerOf = new Map(partners.map((p) => [p.id, p]))
    const by = new Map<string, Row>()
    for (const e of entries) {
      const amt = vatSlipAmounts(e.lines, shown.side)
      if (!amt) continue
      const p = e.partnerId != null ? partnerOf.get(e.partnerId) : undefined
      const taxCode = p?.bizRegNo?.replace(/-/g, '') || p?.code || ''
      const key = String(e.partnerId ?? '')
      const r = by.get(key) ?? { key, taxCode, name: e.partnerName ?? '', count: 0, supply: 0, vat: 0 }
      r.count += 1; r.supply += amt.supply; r.vat += amt.vat
      by.set(key, r)
    }
    /* 국세청 쪽(건수 · 합계)은 홈택스에서 가져와야 해서 늘 0 이다. */
    const nts = { count: 0, total: 0 }
    const same = (r: Row) => r.count === nts.count && r.supply + r.vat === nts.total
    return [...by.values()]
      .filter((r) => shown.basis === '전체' || (shown.basis === '일치') === same(r))
      .sort((a, b) => a.taxCode.localeCompare(b.taxCode) * -1)
  }, [entries, partners, shown])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '이카운트 vs 홈택스 자료비교', [rows.length])

  return (
    <EcListShell title="이카운트 vs 홈택스 자료비교" onSearch={() => setEntries(null)}
                 actions={entries ? [{ label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {!entries && (
        <ul className="ec-cond mb-[8px]">
          <EcCond label="기준일자">
            <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            ~
            <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </EcCond>
          <EcCond label="매입/매출구분">
            {(['매출', '매입'] as VatSide[]).map((s) => (
              <label key={s} className="inline-flex items-center gap-[3px] mr-[10px]">
                <input type="radio" name="hometax-side" checked={side === s} onChange={() => setSide(s)} /> {s}
              </label>
            ))}
          </EcCond>
          <EcCond label="자료기준">
            {(['전체', '일치', '불일치'] as Basis[]).map((b) => (
              <label key={b} className="inline-flex items-center gap-[3px] mr-[10px]">
                <input type="radio" name="hometax-basis" checked={basis === b} onChange={() => setBasis(b)} /> {b}
              </label>
            ))}
          </EcCond>
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
              <EcPeriodPicks labels={PICKS} currentFrom={from} fiscalStart={fiscalStart} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
            </div>
          </li>
        </ul>
      )}

      {entries && (
        <>
          <div className="ec-report-head">
            <div className="ec-report-title">이카운트 vs 홈택스 자료비교</div>
            <div className="ec-report-meta"><span /><span>{reportPeriod(shown.from, shown.to)}</span></div>
          </div>
          <p className="mb-[4px]">1. 국세청 자료 ({shown.basis})</p>
          <div className="overflow-x-auto">
            <table ref={tableRef} className="w-full ec-report whitespace-nowrap">
              <thead>
                <tr>
                  <th rowSpan={2}>세무신고거래처</th><th rowSpan={2}>거래처명</th>
                  <th colSpan={5} className="text-center">ERP</th>
                  <th colSpan={4} className="text-center">국세청</th>
                  <th colSpan={4} className="text-center">차이</th>
                </tr>
                <tr>
                  <th className="text-right">미확인건수</th><th className="text-right">확인건수</th>
                  <th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
                  <th className="text-right">건수</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
                  <th className="text-right">건수</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={15} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.key}>
                    <td className="text-ec-blue">{r.taxCode}</td><td>{r.name}</td>
                    <td className="text-right">0</td><td className="text-right">{r.count}</td>
                    <td className="text-right">{won(r.supply)}</td><td className="text-right">{won(r.vat)}</td><td className="text-right">{won(r.supply + r.vat)}</td>
                    <td className="text-right">0</td><td className="text-right"></td><td className="text-right"></td><td className="text-right"></td>
                    <td className="text-right">{r.count}</td>
                    <td className="text-right">{won(r.supply)}</td><td className="text-right">{won(r.vat)}</td><td className="text-right">{won(r.supply + r.vat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <EcReportFoot />
        </>
      )}
    </EcListShell>
  )
}
