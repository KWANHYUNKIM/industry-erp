import { useEffect, useMemo, useRef, useState } from 'react'
import { vatSlipAmounts } from '../../utils/vatSlip'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { SALES_TAX_LIST_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { JournalEntry } from '../../types/api'

type Side = '매출' | '매입'
type Status = '전체' | '결재중' | '미확인' | '확인'
interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface Row { key: string; date: string; no: string; partner: string; supply: number; vat: number; fromSlip: boolean }
const STATUSES: Status[] = ['전체', '결재중', '미확인', '확인']
const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>매출(세금)계산서조회(세무)</b>(E030203) · <b>매입(세금)계산서조회(세무)</b>(E030204, 원본 화면 제목은
 * '매입청구서조회') — 2026-10-04 loginaa 실측.
 *
 * <p>위 알약 [전체 · 결재중 · 미확인 · <b>확인</b>], 기간은 접힌 조건(기본 최근30일(+1개월) — 오늘 한 달 전 같은 날 ~ 한 달 뒤 전날),
 * 목록 [☐ · 일자-번호 · 거래처명 · 공급가액 · 부가세 · 합계 · 내역보기], 최근 일자부터. [내역보기]는 판매 · 구매 전표에서 온 줄이면
 * '내역보기 거래명세서', 회계에서 바로 쓴 줄이면 '회계 I'. 줄은 부가세 줄(매출 255 · 매입 135)이 든 회계전표 한 장이다 — 회계 I 의
 * 매출(세금)계산서현황과 같은 셈(utils/vatSlip). 우리 회계전표는 결재를 거치지 않아 결재중 · 미확인은 늘 비어 있다.
 *
 * <p>두지 않은 것: [Email](바깥 전송) · [대화방] · [인쇄] · [확인취소] · [선택삭제] · [Excel] — 확인취소 · 선택삭제는 원본에서 남의 자료를
 * 지워 보지 않고는 잴 수 없었다.
 */
export default function TaxInvoiceListPage({ side }: { side: Side }) {
  const init = periodOf('최근30일(+1개월)')!
  const title = side === '매출' ? '매출(세금)계산서조회(세무)' : '매입청구서조회'
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [status, setStatus] = useState<Status>('확인')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      setEntries(r.data.rows)
      setPicked(new Set())
    } catch (e) {
      setEntries([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const rows = useMemo(() => {
    if (status === '결재중' || status === '미확인') return [] as Row[]
    const out: Row[] = []
    for (const e of entries) {
      const amt = vatSlipAmounts(e.lines, side)
      if (!amt) continue
      out.push({ key: String(e.id), date: e.entryDate, no: e.docNo, partner: e.partnerName ?? '', supply: amt.supply, vat: amt.vat,
        fromSlip: e.sourceType === 'SALES' || e.sourceType === 'PURCHASE' })
    }
    return out.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.no.localeCompare(a.no)))
  }, [entries, status, side])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [rows.length])
  const allPicked = rows.length > 0 && picked.size === rows.length

  return (
    <EcListShell title={title} onSearch={load} collapseConditions>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          ~
          <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <EcPeriodPicks labels={SALES_TAX_LIST_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
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
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.key}>
              <td className="text-center whitespace-nowrap">
                <input type="checkbox" aria-label={`${r.no} 선택`} checked={picked.has(r.key)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center text-ec-blue">{dateNo(r.date, r.no)}</td>
              <td>{r.partner}</td>
              <td className="text-right">{won(r.supply)}</td>
              <td className="text-right">{won(r.vat)}</td>
              <td className="text-right">{won(r.supply + r.vat)}</td>
              <td className="text-center text-ec-blue">{r.fromSlip ? '내역보기 거래명세서' : '회계 I'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
