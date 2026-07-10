import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 판매/구매 > 외주비할인현황 — 구매(외주) 라인의 기준단가 대비 실구매 단가 차이를 할인으로 집계
 *  (/api/purchases + /api/items 연동: 정상외주비 = 품목 기준단가 × 수량, 실외주비 = 구매 공급가액) */
interface PurchaseLine { itemId: number; itemName: string; quantity: number; unitPrice: number; supplyAmount: number }
interface PurchaseDoc {
  id: number
  docNo: string
  partnerName: string
  purchaseDate: string
  lines: PurchaseLine[]
}
interface ItemMaster { id: number; unitPrice: number }

interface Row {
  key: string
  date: string
  partner: string
  process: string
  qty: number
  listAmount: number
  discountAmount: number
}

export default function OutsourcingDiscountPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [p, it] = await Promise.all([
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<ItemMaster[]>('/items'),
      ])
      const stdPrice = new Map<number, number>(it.data.map((x) => [x.id, x.unitPrice]))
      const flat: Row[] = []
      for (const d of p.data) {
        d.lines.forEach((l, idx) => {
          const std = stdPrice.get(l.itemId) ?? 0
          // 기준단가가 있으면 정상외주비 = 기준단가×수량, 없으면 실구매액 그대로(할인 0)
          const listAmount = std > 0 ? std * l.quantity : l.supplyAmount
          flat.push({
            key: `${d.id}-${idx}`,
            date: d.purchaseDate,
            partner: d.partnerName,
            process: l.itemName,
            qty: l.quantity,
            listAmount,
            discountAmount: listAmount - l.supplyAmount,
          })
        })
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

  const shown = rows.filter((r) => !keyword || r.partner.includes(keyword) || r.process.includes(keyword))
  const totalList = useMemo(() => shown.reduce((s, r) => s + r.listAmount, 0), [shown])
  const totalDisc = useMemo(() => shown.reduce((s, r) => s + r.discountAmount, 0), [shown])
  const rate = totalList > 0 ? (totalDisc / totalList) * 100 : 0

  return (
    <EcListShell
      title="외주비할인현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={undefined}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        정상외주비 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{totalList.toLocaleString()}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        할인액 <b style={{ color: '#c60a2e', fontSize: 14 }}>{totalDisc.toLocaleString()}</b>
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        할인율 <b style={{ color: '#c60a2e', fontSize: 14 }}>{rate.toFixed(1)}%</b>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>일자 ▼</th>
            <th>외주처 ▼</th>
            <th>외주품목/공정 ▼</th>
            <th style={{ width: 90, textAlign: 'right' }}>수량</th>
            <th style={{ width: 120, textAlign: 'right' }}>정상외주비</th>
            <th style={{ width: 110, textAlign: 'right' }}>할인액</th>
            <th style={{ width: 110, textAlign: 'right' }}>실외주비</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>외주 할인 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td>{r.partner}</td>
              <td>{r.process}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.listAmount.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: r.discountAmount > 0 ? '#c60a2e' : '#9aa1ab' }}>{r.discountAmount.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{(r.listAmount - r.discountAmount).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
