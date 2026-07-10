import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 재고 II > 수출관리 — 판매 전표를 수출 오더 관점으로 조회 (/api/sales 연동)
 *  별도 수출 스키마가 없어 판매 전표(docNo→Invoice, 거래처→Buyer)를 수출 뷰로 표시하고,
 *  진행상태는 판매일 경과에 따라 오더→통관진행→선적완료→입금완료로 표시한다. */
type Status = '오더' | '통관진행' | '선적완료' | '입금완료'

interface SalesLine { itemCode?: string; itemName: string; unit?: string; quantity: number; unitPrice?: number; supplyAmount?: number; vatAmount?: number }
interface SalesDoc {
  id: number
  docNo: string
  partnerName: string
  warehouseName: string
  saleDate: string
  supplyAmount?: number
  vatAmount?: number
  totalAmount: number
  lines: SalesLine[]
}

const statusColor = (s: Status) => ({ 오더: '#c07a00', 통관진행: 'var(--ec-blue)', 선적완료: '#7a5cc0', 입금완료: '#1c7c3c' }[s])

function deriveStatus(saleDate: string): Status {
  const days = Math.floor((Date.now() - new Date(saleDate).getTime()) / 86400000)
  if (days <= 0) return '오더'
  if (days <= 3) return '통관진행'
  if (days <= 7) return '선적완료'
  return '입금완료'
}

export default function ExportPage() {
  const [docs, setDocs] = useState<SalesDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesDoc[]>('/sales')
      const list = [...res.data].sort((a, b) => (a.saleDate < b.saleDate ? 1 : a.saleDate > b.saleDate ? -1 : 0))
      setDocs(list)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = docs.filter((d) => !keyword || d.partnerName.includes(keyword) || d.docNo.includes(keyword))
  const total = useMemo(() => shown.reduce((s, d) => s + d.totalAmount, 0), [shown])

  // 선택 상태 — 각 서식은 선택된 건, 없으면 화면 전체(shown)를 대상으로 출력
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const targets = () => (selected.size ? shown.filter((d) => selected.has(d.id)) : shown)

  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  const money = (n: number) => Number(n || 0).toLocaleString('ko-KR')

  /** 인쇄용 서식 문서를 새 창으로 띄운다 (print.ts의 PRINT_CSS/escape 패턴을 페이지 안에서 재구성) */
  function openDoc(title: string, sections: string[]) {
    const list = targets()
    if (list.length === 0) { alert('출력할 수출 건이 없습니다.'); return }
    const win = window.open('', '_blank', 'width=1024,height=768')
    if (!win) { alert('팝업이 차단되어 인쇄창을 열 수 없습니다.'); return }
    win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      *{box-sizing:border-box}body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;margin:0;color:#1f2733}
      .doc{padding:24px 28px;page-break-after:always}.doc:last-child{page-break-after:auto}
      h1{font-size:20px;margin:0 0 2px;letter-spacing:1px}.sub{font-size:11px;color:#6b7480;margin-bottom:14px}
      .meta{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}
      .meta th{background:#f0f4f8;text-align:left;width:110px;padding:5px 8px;border:1px solid #c9d1da;font-weight:700}
      .meta td{padding:5px 8px;border:1px solid #c9d1da}
      table.items{width:100%;border-collapse:collapse;font-size:11.5px}
      table.items th,table.items td{border:1px solid #c9d1da;padding:5px 7px}
      table.items th{background:#eff3f8;text-align:center;font-weight:700}
      td.num{text-align:right}.tot{font-weight:700;background:#f7f9fb}
      .sign{margin-top:26px;font-size:12px;display:flex;justify-content:flex-end}
      .sign .box{border-top:1px solid #333;padding-top:4px;width:220px;text-align:center;color:#5a626e}
      .note{margin-top:10px;font-size:10.5px;color:#8a929c}
      @page{size:A4;margin:12mm}@media print{.doc{padding:0}}
    </style></head><body>${sections.join('')}</body></html>`)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  function metaRows(d: SalesDoc, extra: [string, string][] = []) {
    const base: [string, string][] = [['Invoice No.', d.docNo], ['Date', d.saleDate], ['Buyer (수입자)', d.partnerName], ['출고창고', d.warehouseName], ...extra]
    return `<table class="meta"><tbody>${base.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`
  }

  function printInvoice() {
    openDoc('Commercial Invoice', targets().map((d) => {
      const rows = d.lines.map((l, i) => {
        const amount = l.supplyAmount ?? (l.unitPrice ?? 0) * l.quantity
        return `<tr><td class="num">${i + 1}</td><td>${esc(l.itemName)}${l.itemCode ? ` <span style="color:#8a929c">(${esc(l.itemCode)})</span>` : ''}</td><td class="num">${money(l.quantity)} ${esc(l.unit ?? '')}</td><td class="num">${money(l.unitPrice ?? 0)}</td><td class="num">${money(amount)}</td></tr>`
      }).join('')
      const supply = d.supplyAmount ?? d.lines.reduce((s, l) => s + (l.supplyAmount ?? (l.unitPrice ?? 0) * l.quantity), 0)
      return `<div class="doc"><h1>COMMERCIAL INVOICE</h1><div class="sub">상업송장 · 통화 KRW</div>${metaRows(d)}
        <table class="items"><thead><tr><th style="width:36px">No</th><th>Description of Goods</th><th style="width:120px">Q'ty</th><th style="width:120px">Unit Price</th><th style="width:130px">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="tot"><td colspan="4">Sub Total (공급가액)</td><td class="num">${money(supply)}</td></tr>
        <tr class="tot"><td colspan="4">Total Amount (합계, VAT 포함)</td><td class="num">${money(d.totalAmount)}</td></tr></tfoot></table>
        <div class="sign"><div class="box">Signature (수출자)</div></div></div>`
    }))
  }

  function printPacking() {
    openDoc('Packing List', targets().map((d) => {
      const rows = d.lines.map((l, i) =>
        `<tr><td class="num">${i + 1}</td><td>${esc(l.itemName)}${l.itemCode ? ` <span style="color:#8a929c">(${esc(l.itemCode)})</span>` : ''}</td><td class="num">${money(l.quantity)} ${esc(l.unit ?? '')}</td><td class="num">1</td><td class="num">-</td><td class="num">-</td></tr>`,
      ).join('')
      const totQty = d.lines.reduce((s, l) => s + l.quantity, 0)
      return `<div class="doc"><h1>PACKING LIST</h1><div class="sub">포장명세서</div>${metaRows(d)}
        <table class="items"><thead><tr><th style="width:36px">No</th><th>Description of Goods</th><th style="width:110px">Q'ty</th><th style="width:90px">Packages</th><th style="width:110px">N.W (kg)</th><th style="width:110px">G.W (kg)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="tot"><td colspan="2">Total</td><td class="num">${money(totQty)}</td><td class="num">${d.lines.length}</td><td class="num">-</td><td class="num">-</td></tr></tfoot></table>
        <div class="note">※ 순중량(N.W)·총중량(G.W)은 시스템 미보유 항목으로 실측값을 별도 기입해 주세요.</div>
        <div class="sign"><div class="box">Signature (수출자)</div></div></div>`
    }))
  }

  function printDeclaration() {
    openDoc('수출신고필증', targets().map((d) => {
      const rows = d.lines.map((l, i) => {
        const amount = l.supplyAmount ?? (l.unitPrice ?? 0) * l.quantity
        return `<tr><td class="num">${i + 1}</td><td>${esc(l.itemName)}${l.itemCode ? ` (${esc(l.itemCode)})` : ''}</td><td class="num">${money(l.quantity)} ${esc(l.unit ?? '')}</td><td class="num">${money(amount)}</td></tr>`
      }).join('')
      return `<div class="doc"><h1>수출신고필증</h1><div class="sub">Export Declaration Certificate</div>
        ${metaRows(d, [['신고번호', `EXP-${esc(d.docNo)}`], ['신고구분/거래구분', 'H / 11 (일반형태 수출)'], ['결제금액', `KRW ${money(d.totalAmount)}`], ['목적국(Buyer)', d.partnerName]])}
        <table class="items"><thead><tr><th style="width:36px">란</th><th>품명·규격</th><th style="width:120px">수량</th><th style="width:140px">신고가격(FOB)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="tot"><td colspan="3">총 신고가격</td><td class="num">KRW ${money(d.supplyAmount ?? d.totalAmount)}</td></tr></tfoot></table>
        <div class="note">※ 신고번호·목적국·HS부호·운송정보 등 관세청 실제 신고 항목은 시스템 미보유로 판매전표 값 기준의 예시 서식입니다. (백엔드 미연동)</div>
        <div class="sign"><div class="box">세관장 확인</div></div></div>`
    }))
  }

  return (
    <EcListShell
      title="수출관리"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Commercial Invoice', onClick: printInvoice }, { label: 'Packing List', onClick: printPacking }, { label: '수출신고필증', onClick: printDeclaration }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b> 원
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 30, textAlign: 'center' }} data-export-skip="true">
              <input
                type="checkbox"
                checked={shown.length > 0 && shown.every((d) => selected.has(d.id))}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((d) => d.id)) : new Set())}
              />
            </th>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>Invoice No. ▼</th>
            <th style={{ width: 100 }}>일자 ▼</th>
            <th>Buyer ▼</th>
            <th style={{ width: 120 }}>출고창고</th>
            <th style={{ width: 70, textAlign: 'right' }}>품목수</th>
            <th style={{ width: 130, textAlign: 'right' }}>금액(KRW)</th>
            <th style={{ width: 90, textAlign: 'center' }}>상태 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>수출 내역이 없습니다.</td></tr>
          ) : shown.map((d, i) => {
            const status = deriveStatus(d.saleDate)
            return (
              <tr key={d.id} style={selected.has(d.id) ? { background: '#f5f8ff' } : undefined}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                </td>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
                <td style={{ fontFamily: 'monospace' }}>{d.saleDate}</td>
                <td>{d.partnerName}</td>
                <td>{d.warehouseName}</td>
                <td style={{ textAlign: 'right' }}>{d.lines.length.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{d.totalAmount.toLocaleString()}</td>
                <td style={{ textAlign: 'center', color: statusColor(status), fontWeight: 700 }}>{status}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
