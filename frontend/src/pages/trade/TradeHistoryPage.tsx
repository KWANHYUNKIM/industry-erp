import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, PurchaseDoc, SalesDoc } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'

/**
 * 영업관리 > 거래이력조회 (이카운트 E040716)
 * 거래처를 중심으로 판매·구매 전표를 한 타임라인에 통합해 보는 화면.
 * 데이터는 GET /api/sales + GET /api/purchases 를 그대로 합쳐 쓴다(백엔드 무변경).
 *
 * 이카운트 원본은 수금·지급까지 포함한 채권/채무 잔액 원장이지만, 우리는 수금/지급 전표를
 * 이 뷰에 실을 정산 소스를 배선하지 않았으므로 <b>판매·구매 전표 이력</b>으로 한정한다
 * (값 없는 잔액 컬럼을 흉내내지 않는다). 잔액 대장은 거래처관리대장(PartnerLedgerPage)이 담당.
 */

type Kind = 'SALE' | 'PURCHASE'
const KIND_COLOR: Record<Kind, { bg: string; fg: string; label: string }> = {
  SALE: { bg: '#eef4ff', fg: 'var(--ec-blue)', label: '판매' },
  PURCHASE: { bg: '#fdf3ea', fg: '#a5561b', label: '구매' },
}

interface Row {
  key: string
  kind: Kind
  date: string
  docNo: string
  partnerId: number
  partnerName: string
  warehouseName: string
  itemSummary: string
  qty: number
  supply: number
  vat: number
  total: number
  employeeName: string | null
}

const won = (n: number) => n.toLocaleString('ko-KR')

function itemSummary(lines: { itemName: string }[]): string {
  if (lines.length === 0) return '-'
  return lines[0].itemName + (lines.length > 1 ? ` 외 ${lines.length - 1}건` : '')
}

export default function TradeHistoryPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 필터
  const [partnerId, setPartnerId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [kindFilter, setKindFilter] = useState<'ALL' | Kind>('ALL')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [p, s, b] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setPartners(p.data)
      const merged: Row[] = []
      for (const d of s.data) {
        merged.push({
          key: `S-${d.id}`, kind: 'SALE', date: d.saleDate, docNo: d.docNo,
          partnerId: d.partnerId, partnerName: d.partnerName, warehouseName: d.warehouseName,
          itemSummary: itemSummary(d.lines), qty: d.lines.reduce((a, l) => a + l.quantity, 0),
          supply: d.supplyAmount, vat: d.vatAmount, total: d.totalAmount, employeeName: d.employeeName,
        })
      }
      for (const d of b.data) {
        merged.push({
          key: `P-${d.id}`, kind: 'PURCHASE', date: d.purchaseDate, docNo: d.docNo,
          partnerId: d.partnerId, partnerName: d.partnerName, warehouseName: d.warehouseName,
          itemSummary: itemSummary(d.lines), qty: d.lines.reduce((a, l) => a + l.quantity, 0),
          supply: d.supplyAmount, vat: d.vatAmount, total: d.totalAmount, employeeName: d.employeeName,
        })
      }
      setRows(merged)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    const pid = partnerId ? Number(partnerId) : null
    return rows
      .filter((r) => {
        if (pid != null && r.partnerId !== pid) return false
        if (from && r.date < from) return false
        if (to && r.date > to) return false
        if (kindFilter !== 'ALL' && r.kind !== kindFilter) return false
        if (kw && !r.partnerName.includes(kw) && !r.itemSummary.includes(kw) && !r.docNo.includes(kw)) return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key < b.key ? 1 : -1))
  }, [rows, partnerId, from, to, kindFilter, keyword])

  const totals = useMemo(() => shown.reduce((s, r) => {
    if (r.kind === 'SALE') { s.saleSupply += r.supply; s.saleTotal += r.total }
    else { s.buySupply += r.supply; s.buyTotal += r.total }
    return s
  }, { saleSupply: 0, saleTotal: 0, buySupply: 0, buyTotal: 0 }), [shown])

  const label: React.CSSProperties = { width: 56, fontSize: 12.5, color: '#3c4553', fontWeight: 600 }
  const saleCount = rows.filter((r) => r.kind === 'SALE').length
  const buyCount = rows.filter((r) => r.kind === 'PURCHASE').length

  return (
    <EcListShell
      title="거래이력조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">거래처 중심으로 판매·구매 전표를 시간순 통합. 채권/채무 잔액은 거래처관리대장 참조.</p>

      {/* 조회 조건 */}
      <div style={{ border: '1px solid #d4dae2', borderRadius: 4, background: '#fbfcfe', padding: '10px 14px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>거래처</span>
          <CodePickerField label="거래처" hideLabel width={230} value={partnerId} onChange={setPartnerId}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.typeName }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={label}>기간</span>
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 148 }} />
          <span style={{ margin: '0 6px', color: '#8a929c' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 148 }} />
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 구분 탭 + 요약 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['ALL', 'SALE', 'PURCHASE'] as const).map((k) => (
            <button key={k} onClick={() => setKindFilter(k)} className="no-ec" style={{
              padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
              background: kindFilter === k ? 'var(--ec-blue)' : '#fff', color: kindFilter === k ? '#fff' : '#3a4453', fontWeight: kindFilter === k ? 700 : 400,
            }}>{k === 'ALL' ? '전체' : KIND_COLOR[k].label} ({k === 'ALL' ? rows.length : k === 'SALE' ? saleCount : buyCount})</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          판매 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.saleTotal)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          구매 <b style={{ color: '#a5561b', fontSize: 14 }}>{won(totals.buyTotal)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          순액 <b style={{ color: (totals.saleTotal - totals.buyTotal) >= 0 ? '#1c7c3c' : '#c60a2e', fontSize: 14 }}>{won(totals.saleTotal - totals.buyTotal)}</b>
        </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자 ▼</th>
            <th style={{ textAlign: 'center', width: 54 }}>구분</th>
            <th>전표번호</th>
            <th>거래처</th>
            <th>품목</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
            <th style={{ textAlign: 'right' }}>합계</th>
            <th>창고</th>
            <th>담당자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {rows.length === 0 ? '거래 내역이 없습니다.' : '조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : shown.map((r, i) => {
            const c = KIND_COLOR[r.kind]
            return (
              <tr key={r.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ background: c.bg, color: c.fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{c.label}</span>
                </td>
                <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
                <td>{r.partnerName}</td>
                <td>{r.itemSummary}</td>
                <td style={{ textAlign: 'right' }}>{won(r.qty)}</td>
                <td style={{ textAlign: 'right' }}>{won(r.supply)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.vat)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: c.fg }}>{won(r.total)}</td>
                <td style={{ color: '#5a626e' }}>{r.warehouseName}</td>
                <td style={{ color: '#5a626e' }}>{r.employeeName ?? '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
