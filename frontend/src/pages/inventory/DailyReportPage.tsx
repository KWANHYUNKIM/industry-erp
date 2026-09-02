import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { SalesDoc, PurchaseDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { INQUIRY_PICKS, ymd } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 재고 > 일보 (이카운트 E040708)
 *
 * 원본 기준일자는 <b>구간</b>이다. 우리는 하루짜리였다 — 한 달 치를 보려면 날짜를 서른 번
 * 눌러야 했다. 구간을 받아 <b>일자별 요약</b>을 본체로 내고, 줄을 누르면 그날 전표를 펼친다.
 *
 * 원본 조건: 기준일자 · 창고 · 거래처 · 품목 · 프로젝트 · 관리항목 · 내.외자구분 · 종류.
 * 창고·프로젝트·관리항목·내외자구분·종류는 이 화면이 합치는 자료(매출·매입 전표)에 대응 필드가
 * 없거나 우리 모델에 개념이 없어 넣지 않았다. 거래처·품목은 전표에 있으므로 조건으로 둔다.
 *
 * **프론트 전용**(`/sales` + `/purchases` + `/stock/movement` 조합).
 */
interface MovementRow { inQty: number; outQty: number }
const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())

export default function DailyReportPage() {
  /** 펼쳐 볼 하루. 빈 값이면 아무 줄도 안 펼친 상태. */
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  /*
   * 원본 일보의 조건 차례는 <b>기준일자 · 창고 · 거래처 · 품목 · 프로젝트</b> 다(사본 실측).
   * 창고와 프로젝트가 없었는데 <b>판매·구매 응답이 이미 둘 다 보내고</b> 있었다.
   */
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])
  const [date, setDate] = useState(today())
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [movement, setMovement] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, p, m] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<MovementRow[]>('/stock/movement', { params: { from, to } }),
      ])
      setSales(s.data); setPurchases(p.data); setMovement(m.data)
    } catch (err) { setError(extractErrorMessage(err)); setSales([]); setPurchases([]); setMovement([]) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  /** 조건(거래처·품목)은 두 표에 같은 규칙으로 걸려야 한다 — 한 곳에 적는다. */
  const hitSales = (d: SalesDoc) =>
    (!partner || d.partnerName.includes(partner))
    && (!item || d.lines.some((l) => l.itemName.includes(item)))
    && (!warehouse || d.warehouseName.includes(warehouse))
    && (!project || (d.projectName ?? '').includes(project))
  const hitPurch = (d: PurchaseDoc) =>
    (!partner || d.partnerName.includes(partner))
    && (!item || d.lines.some((l) => l.itemName.includes(item)))
    && (!warehouse || d.warehouseName.includes(warehouse))
    && (!project || (d.projectName ?? '').includes(project))

  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to)

  /** 일자별 요약 — 원본이 구간을 받으므로 하루에 한 줄씩 낸다. */
  const daily = useMemo(() => {
    const map = new Map<string, { date: string; sCount: number; sAmt: number; pCount: number; pAmt: number }>()
    const at = (d: string) => {
      const r = map.get(d) ?? { date: d, sCount: 0, sAmt: 0, pCount: 0, pAmt: 0 }
      map.set(d, r)
      return r
    }
    sales.filter((d) => inRange(d.saleDate)).filter(hitSales).forEach((d) => {
      const r = at(d.saleDate); r.sCount += 1; r.sAmt += d.totalAmount
    })
    purchases.filter((d) => inRange(d.purchaseDate)).filter(hitPurch).forEach((d) => {
      const r = at(d.purchaseDate); r.pCount += 1; r.pAmt += d.totalAmount
    })
    // 날짜 축은 오름차순 — 재고수불부·재고변동표(일별)와 같은 방향으로 읽힌다.
    return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, purchases, from, to, partner, item, warehouse, project])

  const daySales = useMemo(() => sales.filter((d) => d.saleDate === date).filter(hitSales),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, date, partner, item, warehouse, project])
  const dayPurch = useMemo(() => purchases.filter((d) => d.purchaseDate === date).filter(hitPurch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [purchases, date, partner, item, warehouse, project])

  const salesSum = daySales.reduce((a, d) => ({ supply: a.supply + d.supplyAmount, total: a.total + d.totalAmount }), { supply: 0, total: 0 })
  const purchSum = dayPurch.reduce((a, d) => ({ supply: a.supply + d.supplyAmount, total: a.total + d.totalAmount }), { supply: 0, total: 0 })
  const moveSum = movement.reduce((a, r) => ({ inQty: a.inQty + Number(r.inQty), outQty: a.outQty + Number(r.outQty) }), { inQty: 0, outQty: 0 })

  /** 구간 안에 자료가 있는데 펼친 날이 그 밖이면 마지막 날을 펼친다 — 아래가 빈 채로 남지 않게. */
  useEffect(() => {
    if (daily.length > 0 && !daily.some((r) => r.date === date)) setDate(daily[daily.length - 1].date)
  }, [daily, date])

  /** KPI 는 <b>구간 전체</b>다 — 조건 판이 구간이므로 요약도 구간이어야 앞뒤가 맞는다. */
  const periodSum = daily.reduce(
    (a, r) => ({ sCount: a.sCount + r.sCount, sAmt: a.sAmt + r.sAmt, pCount: a.pCount + r.pCount, pAmt: a.pAmt + r.pAmt }),
    { sCount: 0, sAmt: 0, pCount: 0, pAmt: 0 },
  )
  const kpis = [
    { label: '매출', sub: `${periodSum.sCount}건`, value: periodSum.sAmt, color: 'var(--ec-blue)' },
    { label: '매입', sub: `${periodSum.pCount}건`, value: periodSum.pAmt, color: '#a5561b' },
    { label: '입고수량', sub: '기간', value: moveSum.inQty, color: '#1c7c3c' },
    { label: '출고수량', sub: '기간', value: moveSum.outQty, color: '#c07a00' },
  ]

  const reset = () => {
    setFrom(today()); setTo(today()); setDate(today()); setPartner(''); setItem('')
  }

  return (
    <EcListShell
      title="일보"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_PICKS}
      >
        {/* 원본은 [창고]가 [거래처]보다 앞이다. */}
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* KPI 카드 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ flex: '1 1 0', minWidth: 150, border: '1px solid #e2e6eb', borderRadius: 6, padding: '10px 14px', background: '#fbfcfe' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: k.color }}>{k.label}<span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}> · {k.sub}</span></div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#3c4553', lineHeight: 1.2, marginTop: 4 }}>{won(k.value)}</div>
          </div>
        ))}
      </div>

      {/* 일자별 요약 — 구간 조회의 본체. 줄을 누르면 아래에 그날 전표가 펼쳐진다. */}
      <table className="w-full text-left" style={{ marginBottom: 14 }}>
        <colgroup>
          <col style={{ width: '5%' }} /><col style={{ width: '18%' }} />
          <col style={{ width: '10%' }} /><col /><col style={{ width: '10%' }} /><col />
        </colgroup>
        <thead>
          <tr>
            <th></th><th>일자</th>
            <th style={{ textAlign: 'right' }}>매출건수</th>
            <th style={{ textAlign: 'right' }}>매출액</th>
            <th style={{ textAlign: 'right' }}>매입건수</th>
            <th style={{ textAlign: 'right' }}>매입액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
          ) : daily.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
          ) : daily.map((r, i) => (
            <tr key={r.date}
                onClick={() => setDate(r.date)}
                style={{ cursor: 'pointer', background: r.date === date ? '#eef5ff' : undefined }}>
              <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
              <td>{r.date.replace(/-/g, '/')}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.sCount || ''}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{r.sAmt ? won(r.sAmt) : ''}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.pCount || ''}</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{r.pAmt ? won(r.pAmt) : ''}</td>
            </tr>
          ))}
        </tbody>
        {daily.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f5f7fa' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(periodSum.sCount)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(periodSum.sAmt)}</td>
              <td style={{ textAlign: 'right' }}>{won(periodSum.pCount)}</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(periodSum.pAmt)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      {loading ? null : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* 매출 전표 */}
          <div style={{ flex: '1 1 340px', minWidth: 320 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ec-blue)', margin: '0 0 6px' }}>{date.replace(/-/g, '/')} 매출 전표 ({daySales.length})</div>
            <table className="w-full text-left">
              <thead>
                <tr><th style={{ width: 34 }}></th><th>전표번호</th><th>매출처</th><th style={{ textAlign: 'right' }}>공급가</th><th style={{ textAlign: 'right' }}>합계</th></tr>
              </thead>
              <tbody>
                {daySales.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>해당 일자 매출 없음</td></tr>
                ) : daySales.map((d, i) => (
                  <tr key={d.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
                    <td>{d.partnerName}</td>
                    <td style={{ textAlign: 'right' }}>{won(d.supplyAmount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(d.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              {daySales.length > 0 && (
                <tfoot><tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                  <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
                  <td style={{ textAlign: 'right' }}>{won(salesSum.supply)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(salesSum.total)}</td>
                </tr></tfoot>
              )}
            </table>
          </div>

          {/* 매입 전표 */}
          <div style={{ flex: '1 1 340px', minWidth: 320 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a5561b', margin: '0 0 6px' }}>{date.replace(/-/g, '/')} 매입 전표 ({dayPurch.length})</div>
            <table className="w-full text-left">
              <thead>
                <tr><th style={{ width: 34 }}></th><th>전표번호</th><th>매입처</th><th style={{ textAlign: 'right' }}>공급가</th><th style={{ textAlign: 'right' }}>합계</th></tr>
              </thead>
              <tbody>
                {dayPurch.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>해당 일자 매입 없음</td></tr>
                ) : dayPurch.map((d, i) => (
                  <tr key={d.id}>
                    <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
                    <td>{d.partnerName}</td>
                    <td style={{ textAlign: 'right' }}>{won(d.supplyAmount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{won(d.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              {dayPurch.length > 0 && (
                <tfoot><tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                  <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
                  <td style={{ textAlign: 'right' }}>{won(purchSum.supply)}</td>
                  <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(purchSum.total)}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
