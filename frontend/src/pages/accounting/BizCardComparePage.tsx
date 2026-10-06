import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { EcReportFoot, reportPeriod } from '../../components/EcReportFrame'

interface CardUsage { id: number; usageDate: string; cardNo: string | null; merchant: string | null; supplyAmount: number; vatAmount: number; totalAmount: number }
type Basis = '전체' | 'ERP' | '국세청' | '공제여부'
interface Row { key: string; cardNo: string; merchant: string; count: number; supply: number; vat: number; total: number }

const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '이번기수', '직전기수', '직전분기', '직전반기', '종료일'] as const
const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>사업용신용카드 자료비교</b>(E030214) — 2026-10-04 loginaa 실측.
 *
 * <p>조건 [조회일자(기본 직전분기) · 카드번호 · 거래처 사업자등록번호 · 자료기준 ◉전체 ○ERP ○국세청 ○공제여부 · 기타 ☑불일치만],
 * 아래 [검색(F8) · 금일 … 직전분기 · 직전반기 · 종료일]. 판은 [카드번호 · 사업자등록번호 · 거래처명 · ERP(미확인 · 확인 · 공급가액 · 부가세 · 합계) ·
 * 국세청(건수 · 공급가액 · 부가세 · 합계) · 차이(건수 · 공급가액 · 부가세 · 합계)] — 카드 × 가맹점 한 줄. 원본 2026/07~09 은 빈 판.
 *
 * <p>ERP 쪽은 부가세가 든 카드사용 줄(회계 › 카드사용)이다. 우리 카드사용은 확인 단계가 없어 모두 '확인'으로 센다.
 * 국세청 쪽은 홈택스에서 가져와야 해서(바깥 연동) 늘 비어 있고, 그래서 차이는 ERP 그대로다. 가맹점 사업자등록번호도 우리 카드사용에 없다.
 *
 * <p>두지 않은 것: 거래처 사업자등록번호 조건 · 공제여부 기준, [설정] · [다시 작성] · Option.
 */
export default function BizCardComparePage() {
  const init = periodOf('직전분기')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [cardNo, setCardNo] = useState('')
  const [basis, setBasis] = useState<Basis>('전체')
  const [onlyMismatch, setOnlyMismatch] = useState(true)
  const [fiscalStart, setFiscalStart] = useState(1)
  const [usages, setUsages] = useState<CardUsage[] | null>(null)
  const [shown, setShown] = useState({ from, to })
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => undefined)
  }, [])

  async function search() {
    setError('')
    try {
      const r = await api.get<CardUsage[]>('/bank-cards/usages', { params: { from, to } })
      setUsages(r.data); setShown({ from, to })
    } catch (e) {
      setUsages(null); setError(extractErrorMessage(e))
    }
  }

  const rows = useMemo(() => {
    if (!usages || basis === '국세청' || basis === '공제여부') return [] as Row[]
    const by = new Map<string, Row>()
    for (const u of usages) {
      if (Number(u.vatAmount) === 0) continue
      const no = u.cardNo ?? ''
      if (cardNo && !no.includes(cardNo)) continue
      const key = `${no}|${u.merchant ?? ''}`
      const r = by.get(key) ?? { key, cardNo: no, merchant: u.merchant ?? '', count: 0, supply: 0, vat: 0, total: 0 }
      r.count += 1; r.supply += Number(u.supplyAmount); r.vat += Number(u.vatAmount); r.total += Number(u.totalAmount)
      by.set(key, r)
    }
    /* 국세청 쪽(건수 · 합계)은 홈택스에서 가져와야 해서 늘 0 이다 — 불일치는 ERP 와 국세청의 건수 · 합계가 다른 줄. */
    const nts = { count: 0, total: 0 }
    return [...by.values()]
      .filter((r) => !onlyMismatch || r.count !== nts.count || r.total !== nts.total).sort((a, b) => (a.cardNo !== b.cardNo ? a.cardNo.localeCompare(b.cardNo) : a.merchant.localeCompare(b.merchant)))
  }, [usages, basis, cardNo, onlyMismatch])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '사업용신용카드 자료비교', [rows.length])

  return (
    <EcListShell title="사업용신용카드 자료비교" onSearch={() => setUsages(null)}
                 actions={usages ? [{ label: '인쇄', primary: true }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {!usages && (
        <ul className="ec-cond mb-[8px]">
          <EcCond label="조회일자">
            <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            ~
            <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </EcCond>
          <EcCond label="카드번호">
            <input className="ec-input w-full" placeholder="카드번호" value={cardNo} onChange={(e) => setCardNo(e.target.value)} />
          </EcCond>
          <EcCond label="자료기준">
            {(['전체', 'ERP', '국세청', '공제여부'] as Basis[]).map((b) => (
              <label key={b} className="inline-flex items-center gap-[3px] mr-[10px]">
                <input type="radio" name="bizcard-basis" checked={basis === b} onChange={() => setBasis(b)} /> {b}
              </label>
            ))}
          </EcCond>
          <EcCond label="기타">
            <label className="inline-flex items-center gap-[3px]">
              <input type="checkbox" checked={onlyMismatch} onChange={(e) => setOnlyMismatch(e.target.checked)} /> 불일치만
            </label>
          </EcCond>
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
              <EcPeriodPicks labels={PICKS} currentFrom={from} fiscalStart={fiscalStart} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
            </div>
          </li>
        </ul>
      )}

      {usages && (
        <>
          <div className="ec-report-head">
            <div className="ec-report-title">사업용신용카드 자료비교</div>
            <div className="ec-report-meta"><span /><span>{reportPeriod(shown.from, shown.to)}</span></div>
          </div>
          <div className="overflow-x-auto">
            <table ref={tableRef} className="w-full ec-report whitespace-nowrap">
              <thead>
                <tr>
                  <th rowSpan={2}>카드번호</th><th rowSpan={2}>사업자등록번호</th><th rowSpan={2}>거래처명</th>
                  <th colSpan={5} className="text-center">ERP</th>
                  <th colSpan={4} className="text-center">국세청</th>
                  <th colSpan={4} className="text-center">차이</th>
                </tr>
                <tr>
                  <th className="text-right">미확인</th><th className="text-right">확인</th>
                  <th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
                  <th className="text-right">건수</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
                  <th className="text-right">건수</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={16} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.cardNo}</td><td></td><td>{r.merchant}</td>
                    <td className="text-right"></td><td className="text-right">{r.count}</td>
                    <td className="text-right">{won(r.supply)}</td><td className="text-right">{won(r.vat)}</td><td className="text-right">{won(r.total)}</td>
                    <td className="text-right"></td><td className="text-right"></td><td className="text-right"></td><td className="text-right"></td>
                    <td className="text-right">{r.count}</td>
                    <td className="text-right">{won(r.supply)}</td><td className="text-right">{won(r.vat)}</td><td className="text-right">{won(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <EcReportFoot page={false} />
        </>
      )}
    </EcListShell>
  )
}
