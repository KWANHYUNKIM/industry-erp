import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, PurchaseDoc, SalesDoc } from '../../api/types'

/** 영업 > 거래처중심입력 — 거래처를 선택하면 해당 거래처의 판매/구매 내역을 표시 (/api/partners + /api/sales + /api/purchases 연동) */
interface Row {
  key: string
  date: string
  docNo: string
  partner: string
  gubun: '판매' | '구매'
  itemName: string
  qty: number
  unitPrice: number
  amount: number
}

export default function PartnerEntryPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [partnerRes, salesRes, purchaseRes] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setPartners(partnerRes.data)
      const flat: Row[] = []
      for (const d of salesRes.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `S-${d.id}-${idx}`,
          date: d.saleDate,
          docNo: d.docNo,
          partner: d.partnerName,
          gubun: '판매',
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          amount: l.supplyAmount,
        }))
      }
      for (const d of purchaseRes.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `P-${d.id}-${idx}`,
          date: d.purchaseDate,
          docNo: d.docNo,
          partner: d.partnerName,
          gubun: '구매',
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          amount: l.supplyAmount,
        }))
      }
      flat.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedPartner = partners.find((p) => p.id === partnerId)
  const shown = rows.filter((r) =>
    (!selectedPartner || r.partner === selectedPartner.name)
    && (!keyword || r.partner.includes(keyword) || r.itemName.includes(keyword)))
  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])

  return (
    <EcListShell
      title="거래처중심입력"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <p style={{ marginBottom: 8, fontSize: 12.5, color: '#8a929c' }}>
        전표 신규 입력은 <Link to="/sales/sell" style={{ color: 'var(--ec-blue-dark)', textDecoration: 'underline' }}>판매입력</Link> · <Link to="/sales/buy" style={{ color: 'var(--ec-blue-dark)', textDecoration: 'underline' }}>구매입력</Link> 메뉴에서 처리하세요.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5a626e' }}>거래처</span>
        <select
          className="ec-input"
          style={{ width: 220 }}
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">전체</option>
          {partners.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
        </select>
        {selectedPartner && (
          <span style={{ fontSize: 12.5, color: '#8a929c' }}>
            {selectedPartner.typeName}{selectedPartner.manager ? ` · 담당 ${selectedPartner.manager}` : ''}{selectedPartner.phone ? ` · ${selectedPartner.phone}` : ''}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          공급가액 합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자</th><th>전표번호</th><th>거래처</th>
            <th style={{ textAlign: 'center' }}>구분</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>거래 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
              <td>{r.partner}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.gubun === '판매' ? '#1c56b0' : '#c07a00' }}>{r.gubun}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.amount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
