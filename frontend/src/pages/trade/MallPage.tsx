import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 재고 I > 쇼핑몰관리 — 판매 전표 품목라인을 쇼핑몰(자사몰) 주문 관점으로 조회 (/api/sales 연동)
 *  외부몰 연동 스키마가 없어 자사몰 직접판매(판매전표)를 주문 목록으로 표시하고,
 *  처리상태는 주문일 경과에 따라 신규주문→상품준비중→배송중→배송완료로 표시한다. */
type Status = '신규주문' | '상품준비중' | '배송중' | '배송완료'

interface SalesLine { itemId: number; itemName: string; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }
interface SalesDoc {
  id: number
  docNo: string
  partnerId: number
  partnerName: string
  warehouseId: number
  warehouseName: string
  saleDate: string
  lines: SalesLine[]
}

interface Row {
  key: string
  mall: string
  orderNo: string
  date: string
  product: string
  qty: number
  amount: number
  buyer: string
  status: Status
  // 판매전표 생성/송장출력에 필요한 원본 식별자
  partnerId: number
  warehouseId: number
  itemId: number
  unitPrice: number
  supplyAmount: number
  taxable: boolean
}

const MALLS = ['자사몰']
const statusColor = (s: Status) => ({ 신규주문: '#c60a2e', 상품준비중: '#c07a00', 배송중: 'var(--ec-blue)', 배송완료: '#1c7c3c' }[s])

function deriveStatus(date: string): Status {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days <= 0) return '신규주문'
  if (days <= 2) return '상품준비중'
  if (days <= 5) return '배송중'
  return '배송완료'
}

export default function MallPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [mall, setMall] = useState('전체')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')      // 판매전표 생성 성공 안내
  const [creating, setCreating] = useState(false)
  const toggle = (key: string) => setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesDoc[]>('/sales')
      const flat: Row[] = []
      for (const d of res.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `${d.id}-${idx}`,
          mall: '자사몰',
          orderNo: d.docNo,
          date: d.saleDate,
          product: l.itemName,
          qty: l.quantity,
          amount: l.supplyAmount + l.vatAmount,
          buyer: d.partnerName,
          status: deriveStatus(d.saleDate),
          partnerId: d.partnerId,
          warehouseId: d.warehouseId,
          itemId: l.itemId,
          unitPrice: l.unitPrice,
          supplyAmount: l.supplyAmount,
          taxable: l.vatAmount > 0,
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

  const shown = rows
    .filter((r) => mall === '전체' || r.mall === mall)
    .filter((r) => !keyword || r.product.includes(keyword) || r.orderNo.includes(keyword) || r.buyer.includes(keyword))
  const newCount = rows.filter((r) => r.status === '신규주문').length
  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])

  const targets = () => (selected.size ? shown.filter((r) => selected.has(r.key)) : shown)

  // 송장출력 — 선택된(없으면 전체) 주문을 주문번호별 배송송장으로 인쇄
  function printInvoices() {
    const list = targets()
    if (list.length === 0) { setError('출력할 주문이 없습니다.'); return }
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
    // 주문번호 기준 그룹핑
    const byOrder = new Map<string, Row[]>()
    for (const r of list) { if (!byOrder.has(r.orderNo)) byOrder.set(r.orderNo, []); byOrder.get(r.orderNo)!.push(r) }
    const win = window.open('', '_blank', 'width=1024,height=768')
    if (!win) { alert('팝업이 차단되어 인쇄창을 열 수 없습니다.'); return }
    const sections = Array.from(byOrder.entries()).map(([orderNo, items]) => {
      const head = items[0]
      const rowsHtml = items.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.product)}</td><td class="num">${r.qty.toLocaleString()}</td><td class="num">${r.amount.toLocaleString()}</td></tr>`).join('')
      const sum = items.reduce((s, r) => s + r.amount, 0)
      return `<div class="doc"><h1>배송송장 (Delivery Invoice)</h1><div class="sub">쇼핑몰 주문 · ${esc(head.mall)}</div>
        <table class="meta"><tbody>
          <tr><th>주문번호</th><td>${esc(orderNo)}</td><th>주문일</th><td>${esc(head.date)}</td></tr>
          <tr><th>주문자</th><td>${esc(head.buyer)}</td><th>상태</th><td>${esc(head.status)}</td></tr>
        </tbody></table>
        <table class="items"><thead><tr><th style="width:36px">No</th><th>상품명</th><th style="width:90px">수량</th><th style="width:130px">금액</th></tr></thead>
        <tbody>${rowsHtml}</tbody><tfoot><tr class="tot"><td colspan="3">합계</td><td class="num">${sum.toLocaleString()}</td></tr></tfoot></table>
        <div class="sign"><div class="box">인수확인 (서명)</div></div></div>`
    })
    win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>배송송장</title><style>
      *{box-sizing:border-box}body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;margin:0;color:#1f2733}
      .doc{padding:24px 28px;page-break-after:always}.doc:last-child{page-break-after:auto}
      h1{font-size:19px;margin:0 0 2px}.sub{font-size:11px;color:#6b7480;margin-bottom:14px}
      .meta{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}
      .meta th{background:#f0f4f8;text-align:left;width:90px;padding:5px 8px;border:1px solid #c9d1da;font-weight:700}
      .meta td{padding:5px 8px;border:1px solid #c9d1da}
      table.items{width:100%;border-collapse:collapse;font-size:11.5px}
      table.items th,table.items td{border:1px solid #c9d1da;padding:5px 7px}
      table.items th{background:#eff3f8;text-align:center;font-weight:700}td.num{text-align:right}
      .tot{font-weight:700;background:#f7f9fb}.sign{margin-top:26px;font-size:12px;display:flex;justify-content:flex-end}
      .sign .box{border-top:1px solid #333;padding-top:4px;width:220px;text-align:center;color:#5a626e}
      @page{size:A4;margin:12mm}@media print{.doc{padding:0}}
    </style></head><body>${sections.join('')}</body></html>`)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  // 판매전표 생성 — 선택된 주문을 거래처+창고 단위로 묶어 실제 POST /sales (TradeEntry와 동일 형식)
  async function createSalesDocs() {
    setError(''); setMsg('')
    if (selected.size === 0) { setError('판매전표로 만들 주문을 먼저 선택하세요.'); return }
    const picked = shown.filter((r) => selected.has(r.key))
    // 거래처+창고 기준으로 묶어 전표 1건씩 생성
    const groups = new Map<string, Row[]>()
    for (const r of picked) {
      const k = `${r.partnerId}|${r.warehouseId}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }
    const today = new Date().toISOString().slice(0, 10)
    setCreating(true)
    try {
      const results = await Promise.allSettled(Array.from(groups.values()).map((grp) =>
        api.post('/sales', {
          partnerId: grp[0].partnerId,
          warehouseId: grp[0].warehouseId,
          saleDate: today,
          taxable: grp.some((r) => r.taxable),
          remark: `쇼핑몰 주문 전표생성 (${grp[0].mall})`,
          lines: grp.map((r) => ({ itemId: r.itemId, quantity: r.qty, unitPrice: r.unitPrice })),
        }),
      ))
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const fail = results.length - ok
      setSelected(new Set())
      await load()
      if (fail === 0) setMsg(`판매전표 ${ok}건 생성 완료 (${picked.length}개 주문라인).`)
      else {
        const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        setError(`${ok}건 생성, ${fail}건 실패${firstErr ? `: ${extractErrorMessage(firstErr.reason)}` : ''}`)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <EcListShell
      title="쇼핑몰 주문관리"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '주문수집', primary: true, onClick: load }, { label: '송장출력', onClick: printInvoices }, { label: `판매전표 생성${selected.size ? ` (${selected.size})` : ''}`, onClick: creating ? undefined : createSalesDocs }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {msg && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{msg}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <select className="ec-input" value={mall} onChange={(e) => setMall(e.target.value)} style={{ width: 140 }}>
          <option>전체</option>
          {MALLS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: '#5a626e' }}>신규주문 <b style={{ color: '#c60a2e' }}>{newCount}</b>건</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b> 원</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 30, textAlign: 'center' }} data-export-skip="true">
              <input
                type="checkbox"
                checked={shown.length > 0 && shown.every((r) => selected.has(r.key))}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.key)) : new Set())}
              />
            </th>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 110 }}>연동몰 ▼</th>
            <th style={{ width: 140 }}>주문번호 ▼</th>
            <th style={{ width: 100 }}>주문일 ▼</th>
            <th>상품명</th>
            <th style={{ width: 60, textAlign: 'right' }}>수량</th>
            <th style={{ width: 100, textAlign: 'right' }}>금액</th>
            <th style={{ width: 100 }}>주문자</th>
            <th style={{ width: 100, textAlign: 'center' }}>상태 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>수집된 주문이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key} style={selected.has(r.key) ? { background: '#f5f8ff' } : undefined}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
              </td>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.mall}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.orderNo}</td>
              <td>{r.date}</td>
              <td>{r.product}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.amount.toLocaleString()}</td>
              <td>{r.buyer}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
