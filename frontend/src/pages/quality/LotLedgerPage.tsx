import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { LotTransaction, LotTxType } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { periodOf, LOT_LEDGER_PICKS } from '../../components/EcPeriodPicks'

/**
 * 재고 II > 시리얼/로트No. — 로트 수불부 / 내역조회 (이카운트 E040618·E040620·E040639)
 * 로트별 입고·출고·조정 이력을 시간순으로 보고 잔량(balanceAfter)을 읽는다.
 * 데이터는 GET /api/lots/transactions (LotTransactionResponse[], 로트별 오름차순). 백엔드 신설.
 */

const TYPE_COLOR: Record<LotTxType, { bg: string; fg: string }> = {
  INBOUND: { bg: '#eef4ff', fg: 'var(--ec-blue)' },
  OUTBOUND: { bg: '#fdf3ea', fg: '#a5561b' },
  ADJUST: { bg: '#f3eefb', fg: '#6b3fb0' },
}
const num = (n: number) => n.toLocaleString('ko-KR')

/* 원본 E040620 은 [전월+금월] 을 보고 열린다(2026-09-01 실측). */
const initP = periodOf('전월+금월')!

export default function LotLedgerPage() {
  const [rows, setRows] = useState<LotTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /*
   * 원본 시리얼/로트No.재고수불부(E040620) 조건의 <b>[기준일자]</b>. 기본은 <b>[전월+금월]</b>
   * 이다(2026-09-01 실측: 2026/08/01 ~ 2026/09/01) — 수불은 지난달 것이 이번 달로 넘어와
   * 이어지는 자료라 두 달을 함께 본다.
   *
   * <p>우리 화면에는 기간이 <b>아예 없어</b> /lots/transactions 를 조건 없이 불러
   * <b>여태 쌓인 움직임을 통째로</b> 받고 있었다. 서버도 안 받고 있었다.
   */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [lotNo, setLotNo] = useState('')
  /*
   * 원본 조건 [창고]·[품목](2026-09-01 E040620 실측). 표에는 품목이 찍히는데 그 값으로
   * 거를 수가 없었고, 창고는 아예 보이지도 않았다. 고를 후보는 <b>지금 걸린 자료</b>에서
   * 뽑는다 — 마스터를 통째로 받으면 조건을 안 쓰는 사람에게도 느려진다.
   */
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | LotTxType>('ALL')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get<LotTransaction[]>('/lots/transactions', {
        params: { from: from || undefined, to: to || undefined },
      })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to])

  const lotNos = useMemo(() => [...new Set(rows.map((r) => r.lotNo))].sort(), [rows])
  const warehouses = useMemo(
    () => [...new Set(rows.map((r) => r.warehouseName).filter(Boolean) as string[])].sort(), [rows])
  const items = useMemo(() => [...new Set(rows.map((r) => r.itemName))].sort(), [rows])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (warehouse && r.warehouseName !== warehouse) return false
      if (item && r.itemName !== item) return false
      if (lotNo && r.lotNo !== lotNo) return false
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false
      if (kw && !r.lotNo.includes(kw) && !r.itemName.includes(kw)) return false
      return true
    })
  }, [rows, warehouse, item, lotNo, typeFilter, keyword])

  const totals = useMemo(() => shown.reduce((s, r) => {
    if (r.quantityChange >= 0) s.inQty += r.quantityChange
    else s.outQty += -r.quantityChange
    return s
  }, { inQty: 0, outQty: 0 }), [shown])
  // 단일 로트 선택 시 기말 = 마지막 행 잔량
  const closing = lotNo && shown.length ? shown[shown.length - 1].balanceAfter : null

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }

  return (
    <EcListShell
      /* 원본 화면 이름 그대로다(2026-09-01 E040620 실측) — 우리는 [로트 수불부] 라고만 불렀다. */
      title="시리얼/로트No.재고수불부"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">로트별 입고·출고·조정 이력과 잔량. 로트를 선택하면 그 로트의 수불부(기말 재고 포함).</p>

      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        {/* 원본 조건 판의 [기준일자] — 서버가 이 구간만 준다. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={label}>기준일자</span>
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <EcPeriodPicks labels={LOT_LEDGER_PICKS} currentFrom={from}
                         onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
        </div>
        {/* 원본 조건 차례: 기준일자 · … · [창고] · [품목]. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>창고</span>
          <select className="ec-input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} style={{ width: 160 }}>
            <option value="">전체</option>
            {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>품목</span>
          <select className="ec-input" value={item} onChange={(e) => setItem(e.target.value)} style={{ width: 200 }}>
            <option value="">전체</option>
            {items.map((it) => <option key={it} value={it}>{it}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>로트</span>
          <select className="ec-input" value={lotNo} onChange={(e) => setLotNo(e.target.value)} style={{ width: 200 }}>
            <option value="">전체</option>
            {lotNos.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['ALL', 'INBOUND', 'OUTBOUND', 'ADJUST'] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: typeFilter === t ? 'var(--ec-blue)' : '#fff', color: typeFilter === t ? '#fff' : '#3a4453', fontWeight: typeFilter === t ? 700 : 400,
            }}>{t === 'ALL' ? '전체' : t === 'INBOUND' ? '입고' : t === 'OUTBOUND' ? '출고' : '조정'}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          입고계 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totals.inQty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          출고계 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.outQty)}</b>
          {closing != null && (
            <><span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>기말 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{num(closing)}</b></>
          )}
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>로트No.</th>
            <th>품목</th>
            <th>일자</th>
            <th style={{ textAlign: 'center', width: 56 }}>유형</th>
            <th style={{ textAlign: 'right' }}>입고</th>
            <th style={{ textAlign: 'right' }}>출고</th>
            <th style={{ textAlign: 'right' }}>잔량</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '로트 이력이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => {
            const inQ = r.quantityChange >= 0 ? r.quantityChange : 0
            const outQ = r.quantityChange < 0 ? -r.quantityChange : 0
            const c = TYPE_COLOR[r.type]
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.lotNo}</td>
                <td>{r.itemName}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(r.txDate)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: c.bg, color: c.fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{r.typeName}</span>
                </td>
                <td style={{ textAlign: 'right', color: inQ ? 'var(--ec-blue)' : '#c5cbd3', fontWeight: inQ ? 600 : 400 }}>{inQ ? num(inQ) : ''}</td>
                <td style={{ textAlign: 'right', color: outQ ? '#a5561b' : '#c5cbd3', fontWeight: outQ ? 600 : 400 }}>{outQ ? num(outQ) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(r.balanceAfter)}</td>
                <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
