import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, PurchaseDoc, SalesDoc } from '../../types/api'
import { dateText } from '../../utils/dateText'

/**
 * 영업 > 품목중심입력 (이카운트 E040633)
 * 품목을 선택하면 그 품목의 판매/구매 내역을 거래처별로 표시(거래처중심입력의 짝).
 * 데이터는 /api/items + /api/sales + /api/purchases (백엔드 무변경).
 */
interface Row {
  key: string
  itemId: number
  date: string
  docNo: string
  partner: string
  gubun: '판매' | '구매'
  itemName: string
  qty: number
  unitPrice: number
  amount: number
}

export default function ItemEntryPage() {
  const [items, setItems] = useState<Item[]>([])
  const [itemId, setItemId] = useState<number | ''>('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [itemRes, salesRes, purchaseRes] = await Promise.all([
        api.get<Item[]>('/items'),
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setItems(itemRes.data)
      const flat: Row[] = []
      for (const d of salesRes.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `S-${d.id}-${idx}`, itemId: l.itemId, date: d.saleDate, docNo: d.docNo,
          partner: d.partnerName, gubun: '판매', itemName: l.itemName,
          qty: l.quantity, unitPrice: l.unitPrice, amount: l.supplyAmount,
        }))
      }
      for (const d of purchaseRes.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `P-${d.id}-${idx}`, itemId: l.itemId, date: d.purchaseDate, docNo: d.docNo,
          partner: d.partnerName, gubun: '구매', itemName: l.itemName,
          qty: l.quantity, unitPrice: l.unitPrice, amount: l.supplyAmount,
        }))
      }
      flat.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      setRows(flat)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const selectedItem = items.find((it) => it.id === itemId)
  const shown = rows.filter((r) =>
    (itemId === '' || r.itemId === itemId)
    && (!keyword || r.partner.includes(keyword) || r.itemName.includes(keyword)))

  const totals = useMemo(() => shown.reduce((s, r) => {
    if (r.gubun === '판매') { s.saleQty += r.qty; s.saleAmt += r.amount }
    else { s.buyQty += r.qty; s.buyAmt += r.amount }
    return s
  }, { saleQty: 0, saleAmt: 0, buyQty: 0, buyAmt: 0 }), [shown])

  return (
    <EcListShell
      title="품목중심입력"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <p className="mb-[8px] text-[12.5px] text-ec-hint">
        전표 신규 입력은 <Link to="/sales/sell" style={{ color: 'var(--ec-blue-dark)', textDecoration: 'underline' }}>판매입력</Link> · <Link to="/sales/buy" style={{ color: 'var(--ec-blue-dark)', textDecoration: 'underline' }}>구매입력</Link> 메뉴에서 처리하세요.
      </p>
      <div className="flex items-center gap-[6px] mb-[8px] flex-wrap">
        <span className="text-[12.5px] text-ec-label">품목</span>
        {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). 지난 전표를 보는 자리라 중단 품목도 남긴다. */}
        <CodePickerField label="품목" hideLabel width={240} placeholder="품목" emptyLabel="전체"
                         value={String(itemId)} onChange={(v) => setItemId(v ? Number(v) : '')}
                         items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))} />
        {selectedItem && (
          <span className="text-[12.5px] text-ec-hint">
            {selectedItem.spec ? `${selectedItem.spec} · ` : ''}{selectedItem.unit} · 표준단가 {selectedItem.unitPrice.toLocaleString()}
          </span>
        )}
        <span className="ml-auto text-[12.5px] text-ec-label">
          판매 <b className="text-ec-blue text-[14px]">{totals.saleAmt.toLocaleString()}</b>
          <span className="my-0 mx-[6px] text-ec-off">|</span>
          구매 <b style={{ color: '#a5561b', fontSize: 14 }}>{totals.buyAmt.toLocaleString()}</b>
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>일자</th><th>전표번호</th>
            <th className="text-center">구분</th>
            <th>거래처</th>
            <th>품목명</th>
            <th className="text-right">수량</th><th className="text-right">단가</th>
            <th className="text-right">공급가액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{dateText(r.date)}</td>
              <td>{r.docNo}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.gubun === '판매' ? '#1c56b0' : 'var(--ec-warn)' }}>{r.gubun}</td>
              <td>{r.partner}</td>
              <td>{r.itemName}</td>
              <td className="text-right">{r.qty.toLocaleString()}</td>
              <td className="text-right">{r.unitPrice.toLocaleString()}</td>
              <td className="text-right font-semibold">{r.amount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
