import { useEffect, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { vatSlipAmounts } from '../../utils/vatSlip'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks from '../../components/EcPeriodPicks'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import type { JournalEntry } from '../../types/api'

type DocKind = 'PAPER' | 'ELECTRONIC' | 'MODIFY_ERROR' | 'MODIFY_AMOUNT' | 'MODIFY_RETURN' | 'MODIFY_CANCEL' | 'MODIFY_LC' | 'MODIFY_DUPLICATE'
type Progress = 'NONE' | 'LATE' | 'ELSEWHERE'
interface Mark { journalEntryId: number; docKind: DocKind; progress: Progress }
interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
type Kind = '세금계산서' | '계산서'
interface Cell { count: number; supply: number; vat: number }

/** 원본 줄 차례 그대로 — [종류 · 구분]과 그 묶음. 묶음 끝마다 '… 계' 줄. */
const GROUPS: { kind: string; total: string; rows: { key: string; label: string }[] }[] = [
  { kind: '종이', total: '종이 계', rows: [{ key: 'PAPER', label: '종이(세금)계산서' }] },
  { kind: '미전송', total: '미전송 계', rows: [
    { key: 'UNSENT', label: '미발행' }, { key: 'WAITING', label: '전송대기' }, { key: 'SENDING', label: '전송중' }, { key: 'ERROR', label: '에러' },
  ] },
  { kind: '전송완료', total: '전송완료 계', rows: [
    { key: 'SENT_ELECTRONIC', label: '전자(세금)계산서' }, { key: 'SENT_MODIFY_ERROR', label: '기재사항착오정정' },
    { key: 'SENT_MODIFY_AMOUNT', label: '공급가액변동' }, { key: 'SENT_MODIFY_RETURN', label: '환입' },
    { key: 'SENT_MODIFY_CANCEL', label: '계약의해제' }, { key: 'SENT_MODIFY_LC', label: '내국신용장개설' },
    { key: 'SENT_MODIFY_DUPLICATE', label: '착오에의한이중발행' },
  ] },
  { kind: '타발행', total: '타발행 계', rows: [{ key: 'ELSEWHERE', label: '타발행' }] },
  { kind: '기한후발행', total: '기한후발행 계', rows: [{ key: 'LATE', label: '기한후발행' }] },
]
const PICKS = ['금월(~오늘)', '전월', '이번기수', '직전기수', '직전분기', '직전반기'] as const
const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const lastDay = (m: string) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)
  return `${m}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 진행상태 → 줄. 국세청 전송을 하지 않으므로 전자(세금)계산서는 모두 '미발행'이다(전송대기 · 전송중 · 에러 · 전송완료는 늘 빈 줄).
 * 타발행 · 기한후 발행이 종이/전자보다 먼저다.
 */
function bucketOf(m: Mark | undefined): string {
  if (m?.progress === 'ELSEWHERE') return 'ELSEWHERE'
  if (m?.progress === 'LATE') return 'LATE'
  if (m?.docKind === 'PAPER') return 'PAPER'
  return 'UNSENT'
}

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>매출(세금)계산서요약</b>(E030206) — 2026-10-04 loginaa 실측.
 *
 * <p>조건 [구분 ◉세금계산서 ○계산서 · 기준일자 연/월 ~ 연/월(기본 이번 달) · 부서 · 프로젝트 · 기타 □결재방표시],
 * 아래 [검색(F8) · 금월(~오늘) · 전월 · 이번기수 · 직전기수 · 직전분기 · 직전반기]. 검색하면 조건이 접히고 요약표 한 장 —
 * [종류 · 구분 · 건수 · 공급가액 계 · 부가세계], 묶음(종이 · 미전송 · 전송완료 · 타발행 · 기한후발행)마다 계, 끝에 합계.
 * 원본 2026/09 이카운트 4,000,000 · 400,000 한 건이 미전송 › 미발행.
 * 줄은 매출 부가세 줄(255)이 든 회계전표 한 장, 종이 · 타발행 · 기한후발행은 각종구분값변경에서 매긴 값이다.
 * 계산서는 부가세가 0 인 전표다.
 *
 * <p>두지 않은 것: 부서 · 프로젝트 · 결재방표시 조건, [전체] 탭, 구분 글자를 눌러 여는 내역 창, [설정] · [다시 작성].
 */
export default function SalesTaxSummaryPage() {
  const thisMonth = ym(new Date())
  const [kind, setKind] = useState<Kind>('세금계산서')
  const [fromYm, setFromYm] = useState(thisMonth)
  const [toYm, setToYm] = useState(thisMonth)
  const [fiscalStart, setFiscalStart] = useState(1)
  const [report, setReport] = useState<{ from: string; to: string; cells: Map<string, Cell> } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => undefined)
  }, [])

  async function search(f = fromYm, t = toYm) {
    setError('')
    const from = `${f}-01`
    const to = lastDay(t)
    try {
      const [j, m] = await Promise.all([
        api.get<JournalList>('/journals', { params: { from, to, all: true } }),
        api.get<Mark[]>('/vat-invoice-marks'),
      ])
      const marks = new Map(m.data.map((x) => [x.journalEntryId, x]))
      const cells = new Map<string, Cell>()
      for (const e of j.data.rows) {
        const amt = vatSlipAmounts(e.lines, '매출')
        if (!amt || (kind === '세금계산서') !== (amt.vat !== 0)) continue
        const key = bucketOf(marks.get(e.id))
        const c = cells.get(key) ?? { count: 0, supply: 0, vat: 0 }
        cells.set(key, { count: c.count + 1, supply: c.supply + amt.supply, vat: c.vat + amt.vat })
      }
      setReport({ from, to, cells })
    } catch (e) {
      setReport(null); setError(extractErrorMessage(e))
    }
  }

  const sum = (keys: string[]) => keys.reduce<Cell>((a, k) => {
    const c = report?.cells.get(k)
    return c ? { count: a.count + c.count, supply: a.supply + c.supply, vat: a.vat + c.vat } : a
  }, { count: 0, supply: 0, vat: 0 })
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '매출(세금)계산서요약', [report])
  const total = sum(GROUPS.flatMap((g) => g.rows.map((r) => r.key)))

  return (
    <EcListShell title="매출(세금)계산서요약" onSearch={() => setReport(null)} option={false}
                 actions={report ? [{ label: '인쇄', primary: true }, { label: 'Excel' }] : []}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {!report && (
        <ul className="ec-cond mb-[8px]">
          <EcCond label="구분">
            {(['세금계산서', '계산서'] as Kind[]).map((k) => (
              <label key={k} className="inline-flex items-center gap-[3px] mr-[10px]">
                <input type="radio" name="sales-tax-summary-kind" checked={kind === k} onChange={() => setKind(k)} /> {k}
              </label>
            ))}
          </EcCond>
          <EcCond label="기준일자">
            <input type="month" className="ec-input w-[150px]" value={fromYm} onChange={(e) => setFromYm(e.target.value)} />
            ~
            <input type="month" className="ec-input w-[150px]" value={toYm} onChange={(e) => setToYm(e.target.value)} />
          </EcCond>
          <li className="full">
            <div className="form">
              <button className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
              <EcPeriodPicks labels={PICKS} currentFrom={`${fromYm}-01`} fiscalStart={fiscalStart}
                             onPick={(r) => {
                               const f = r.from.slice(0, 7)
                               const t = r.to.slice(0, 7)
                               setFromYm(f); setToYm(t); void search(f, t)
                             }} />
            </div>
          </li>
        </ul>
      )}

      {report && (
        <div className="max-w-[650px]">
          <EcReportHead title={kind === '세금계산서' ? '매출(세금)계산서요약' : '매출계산서요약'} period={reportPeriod(report.from, report.to)} />
          <table ref={tableRef} className="w-full ec-report">
            <thead>
              <tr>
                <th>종류</th>
                <th>구분</th>
                <th className="text-right">건수</th>
                <th className="text-right">공급가액 계</th>
                <th className="text-right">부가세계</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => {
                const t = sum(g.rows.map((r) => r.key))
                return [
                  ...g.rows.map((r) => {
                    const c = report.cells.get(r.key)
                    return (
                      <tr key={r.key}>
                        <td>{g.kind}</td>
                        <td className="text-ec-blue">{r.label}</td>
                        <td className="text-right">{c?.count || ''}</td>
                        <td className="text-right">{won(c?.supply ?? 0)}</td>
                        <td className="text-right">{won(c?.vat ?? 0)}</td>
                      </tr>
                    )
                  }),
                  <tr key={g.total} className="ec-total">
                    <td colSpan={2} className="text-center font-bold">{g.total}</td>
                    <td className="text-right font-bold">{t.count || ''}</td>
                    <td className="text-right font-bold">{won(t.supply)}</td>
                    <td className="text-right font-bold">{won(t.vat)}</td>
                  </tr>,
                ]
              })}
              <tr className="ec-total">
                <td colSpan={2} className="text-center font-bold">합계</td>
                <td className="text-right font-bold">{total.count || ''}</td>
                <td className="text-right font-bold">{won(total.supply)}</td>
                <td className="text-right font-bold">{won(total.vat)}</td>
              </tr>
            </tbody>
          </table>
          <EcReportFoot />
        </div>
      )}
    </EcListShell>
  )
}
