import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 영업관리 > 월별채권/채무증감내역 (이카운트 E040713·E040714)
 * 연도별 12개월의 전월이월·증가·감소·당월잔액을 채권/채무로 나눠 본다.
 *  - 채권: 증가=매출(판매전표 합계), 감소=수금(정산 RECEIPT)
 *  - 채무: 증가=매입(구매전표 합계), 감소=지급(정산 PAYMENT)
 * 데이터는 GET /api/sales, /purchases, /settlements 를 그대로 집계(백엔드 무변경).
 * 전월이월(1월) = 해당 연도 시작 이전까지의 누적 순잔액.
 */

type Mode = 'AR' | 'AP'   // 채권 / 채무
type SettlementType = 'RECEIPT' | 'PAYMENT'
interface Settlement {
  id: number; type: SettlementType; typeName: string
  partnerId: number; partnerName: string; settleDate: string; amount: number
}

interface MonthRow { month: number; opening: number; increase: number; decrease: number; closing: number }

const won = (n: number) => n.toLocaleString('ko-KR')
const thisYear = () => Number(ymd(new Date()).slice(0, 4))
const ym = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) })

export default function MonthlyArApPage({ defaultMode = 'AR' }: { defaultMode?: Mode }) {
  const [year, setYear] = useState<number>(thisYear())
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, b, st] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<Settlement[]>('/settlements'),
      ])
      setSales(s.data); setPurchases(b.data); setSettlements(st.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  // 채권판·채무판이 같은 컴포넌트를 쓰므로 메뉴를 갈아타도 다시 마운트되지 않는다 — 값을 따라가게 한다.
  useEffect(() => { setMode(defaultMode) }, [defaultMode])

  const rows = useMemo<MonthRow[]>(() => {
    // 증가/감소 소스: 채권=매출/수금, 채무=매입/지급
    const incDocs = mode === 'AR'
      ? sales.map((d) => ({ date: d.saleDate, amt: d.totalAmount }))
      : purchases.map((d) => ({ date: d.purchaseDate, amt: d.totalAmount }))
    const decType: SettlementType = mode === 'AR' ? 'RECEIPT' : 'PAYMENT'
    const decDocs = settlements.filter((s) => s.type === decType).map((s) => ({ date: s.settleDate, amt: s.amount }))

    // 연초 이전 누적 순잔액 = 전월이월(1월)
    let opening = 0
    for (const d of incDocs) if (ym(d.date).y < year) opening += d.amt
    for (const d of decDocs) if (ym(d.date).y < year) opening -= d.amt

    const inc = new Array(13).fill(0)
    const dec = new Array(13).fill(0)
    for (const d of incDocs) { const { y, m } = ym(d.date); if (y === year && m >= 1 && m <= 12) inc[m] += d.amt }
    for (const d of decDocs) { const { y, m } = ym(d.date); if (y === year && m >= 1 && m <= 12) dec[m] += d.amt }

    const out: MonthRow[] = []
    let carry = opening
    for (let m = 1; m <= 12; m++) {
      const closing = carry + inc[m] - dec[m]
      out.push({ month: m, opening: carry, increase: inc[m], decrease: dec[m], closing })
      carry = closing
    }
    return out
  }, [sales, purchases, settlements, mode, year])

  const totals = useMemo(() => rows.reduce((s, r) => ({ inc: s.inc + r.increase, dec: s.dec + r.decrease }), { inc: 0, dec: 0 }), [rows])
  const closing = rows.length ? rows[rows.length - 1].closing : 0
  const years = [thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2]
  const incLabel = mode === 'AR' ? '매출(증가)' : '매입(증가)'
  const decLabel = mode === 'AR' ? '수금(감소)' : '지급(감소)'
  const incColor = 'var(--ec-blue)'
  const decColor = '#a5561b'

  return (
    <EcListShell
      title="월별채권/채무증감내역"
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">
        채권=매출−수금, 채무=매입−지급. 전월이월(1월) = 해당 연도 시작 이전 누적 순잔액.
        {settlements.length === 0 && ' (정산 데이터가 없어 감소=0으로 표시됩니다.)'}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: '#3c4553', fontWeight: 600 }}>연도</span>
          <select className="ec-input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }}>
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['AR', 'AP'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="no-ec" style={{
              padding: '5px 14px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: mode === m ? 'var(--ec-blue)' : '#fff', color: mode === m ? '#fff' : '#3a4453', fontWeight: mode === m ? 700 : 400,
            }}>{m === 'AR' ? '채권(받을 돈)' : '채무(줄 돈)'}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          연말잔액 <b style={{ color: closing >= 0 ? 'var(--ec-blue-dark)' : '#c60a2e', fontSize: 15 }}>{won(closing)}</b>
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 70 }}>월</th>
            <th style={{ textAlign: 'right' }}>전월이월</th>
            <th style={{ textAlign: 'right' }}>{incLabel}</th>
            <th style={{ textAlign: 'right' }}>{decLabel}</th>
            <th style={{ textAlign: 'right' }}>당월잔액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.map((r) => (
            <tr key={r.month}>
              <td style={{ fontWeight: 600 }}>{r.month}월</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.opening)}</td>
              <td style={{ textAlign: 'right', color: r.increase ? incColor : '#c5cbd3', fontWeight: r.increase ? 600 : 400 }}>{r.increase ? won(r.increase) : '-'}</td>
              <td style={{ textAlign: 'right', color: r.decrease ? decColor : '#c5cbd3', fontWeight: r.decrease ? 600 : 400 }}>{r.decrease ? won(r.decrease) : '-'}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.closing)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td>연간합계</td>
            <td></td>
            <td style={{ textAlign: 'right', color: incColor }}>{won(totals.inc)}</td>
            <td style={{ textAlign: 'right', color: decColor }}>{won(totals.dec)}</td>
            <td style={{ textAlign: 'right' }}>{won(closing)}</td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
