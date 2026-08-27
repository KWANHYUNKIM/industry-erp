import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, PurchaseDoc, SalesDoc } from '../../api/types'

/**
 * 영업 > 거래처중심입력.
 *
 * <p>원본 실측(사본): 거래처를 고정해 놓고 그 거래처로 바로 가는 화면 묶음을 준다 —
 * 채권/채무현황 · 판매조회 · 구매조회 · 회계거래조회 · 채권현황 · 채무현황 ·
 * 거래처관리대장1(채권) · 거래처관리대장1(채무) · <b>전표입력</b> · 수정.
 * 이름은 '입력' 이지만 실은 <b>거래처 한 곳을 파고드는 허브</b>다.
 *
 * <p>우리 화면은 고른 거래처의 판매·구매 내역을 늘어놓기만 했고, 다른 화면으로 가는 길은
 * "판매입력·구매입력 메뉴에서 처리하세요" 라는 안내문 한 줄이었다. 거기서 다시 거래처를
 * 골라야 하니 허브가 있으나 마나였다.
 *
 * <p>이제 각 화면이 거래처를 물고 열린다(?partner= / ?partnerId=).
 * 회계거래조회는 우리에게 거래처별 회계전표 조회가 없어 넣지 않았다 —
 * 눌러도 아무 일이 없는 버튼을 만들지 않는다.
 */
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

/**
 * 원본 바로가기 목록 순서 그대로.
 * 회계거래조회는 우리에게 거래처별 회계전표 조회가 없어 뺐다 —
 * 눌러도 아무 일이 없는 버튼을 만들지 않는다.
 */
const LINKS: { label: string; to: (p: Partner) => string }[] = [
  { label: '채권/채무현황', to: (p) => `/sales/ar-ap-status?partner=${encodeURIComponent(p.name)}` },
  { label: '판매조회', to: (p) => `/sales/sales-list?partner=${encodeURIComponent(p.name)}` },
  { label: '구매조회', to: (p) => `/sales/purchase-list?partner=${encodeURIComponent(p.name)}` },
  { label: '채권현황', to: (p) => `/sales/receivable-status?partner=${encodeURIComponent(p.name)}` },
  { label: '채무현황', to: (p) => `/sales/payable-status?partner=${encodeURIComponent(p.name)}` },
  { label: '거래처관리대장1(채권)', to: (p) => `/sales/partner-ledger-receivable?partner=${encodeURIComponent(p.name)}` },
  { label: '거래처관리대장1(채무)', to: (p) => `/sales/partner-ledger-payable?partner=${encodeURIComponent(p.name)}` },
  { label: '전표입력', to: (p) => `/sales/sell?partnerId=${p.id}` },
]

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

      {/*
        원본의 바로가기 묶음. 고른 거래처를 물고 열린다 — 거기서 다시 고르게 하면
        허브가 있으나 마나다. 거래처를 안 고르면 눌러도 뜻이 없으므로 그때는 잠근다.
      */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {LINKS.map((l) => (selectedPartner ? (
          <Link key={l.label} to={l.to(selectedPartner)} className="ec-btn no-ec"
                style={{ textDecoration: 'none', color: 'var(--ec-blue-dark)' }}>
            {l.label}
          </Link>
        ) : (
          <span key={l.label} className="ec-btn" style={{ color: '#c9ced6', cursor: 'default' }}>{l.label}</span>
        )))}
        {!selectedPartner && (
          <span style={{ fontSize: 11.5, color: '#8a929c', alignSelf: 'center' }}>
            거래처를 먼저 고르세요.
          </span>
        )}
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
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
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
