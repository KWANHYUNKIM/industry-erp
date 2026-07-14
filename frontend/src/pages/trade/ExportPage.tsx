import { Fragment, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Currency, ExportOrder, ExportStatus, ExportSummary, Item, Partner } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const fx = (n: number, symbol?: string | null) =>
  `${symbol ?? ''}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)

const TABS = ['전체', '오더', '통관진행', '선적완료', '입금완료'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, ExportStatus> = {
  오더: 'ORDER', 통관진행: 'CUSTOMS', 선적완료: 'SHIPPED', 입금완료: 'PAID',
}
const statusColor = (s: ExportStatus) =>
  s === 'PAID' ? '#1c7c3c' : s === 'SHIPPED' ? '#7a5cc0' : s === 'CUSTOMS' ? 'var(--ec-blue)' : '#c07a00'

interface LineForm { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unitPrice: '' })

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/**
 * 수출관리 — 인보이스 발행 → 통관진행 → 선적완료 → 입금완료.
 * 금액은 외화가 원본이고, 원화는 발행일 고시환율로 환산해 인보이스에 고정된다.
 */
export default function ExportPage() {
  const [summary, setSummary] = useState<ExportSummary | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<ExportSummary>('/exports').then((r) => setSummary(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => {
    load()
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'SUPPLIER'))).catch(() => {})
    api.get<Currency[]>('/currencies').then((r) => setCurrencies(r.data.filter((c) => c.code !== 'KRW'))).catch(() => {})
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
  }, [])

  const rows = summary?.exports ?? []
  const shown = useMemo(() => rows.filter((r) => tab === '전체' || r.status === TAB_STATUS[tab]), [rows, tab])
  const tabCount = (t: Tab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length

  async function customs(e: ExportOrder) {
    const declarationNo = window.prompt(`${e.invoiceNo} 수출신고번호`, '')
    if (declarationNo === null || !declarationNo.trim()) return
    try { await api.post(`/exports/${e.id}/customs`, { declarationNo }); flash('통관진행으로 넘겼습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function ship(e: ExportOrder) {
    const blNo = window.prompt(`${e.invoiceNo} B/L 번호`, '')
    if (blNo === null || !blNo.trim()) return
    try { await api.post(`/exports/${e.id}/ship`, { blNo, shippedDate: today() }); flash('선적완료 처리했습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function pay(e: ExportOrder) {
    if (!window.confirm(`${e.invoiceNo} 입금완료로 처리할까요? (원화 ${won(e.krwAmount)})`)) return
    try { await api.post(`/exports/${e.id}/pay`, { paidDate: today() }); flash('입금완료 처리했습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  /** Commercial Invoice / Packing List 인쇄. 수량·금액은 인보이스에 박힌 값 그대로 쓴다. */
  function print(e: ExportOrder, kind: 'INVOICE' | 'PACKING') {
    const win = window.open('', '_blank', 'width=1024,height=768')
    if (!win) return alert('팝업이 차단되었습니다.')
    const money = kind === 'INVOICE'
    const head = money
      ? '<th>No.</th><th>Description</th><th class="r">Q\'ty</th><th class="r">Unit Price</th><th class="r">Amount</th>'
      : '<th>No.</th><th>Description</th><th class="r">Q\'ty</th><th>Unit</th>'
    const body = e.lines.map((l) => money
      ? `<tr><td>${l.lineNo}</td><td>${esc(l.itemName)} (${esc(l.itemCode)})</td><td class="r">${l.quantity.toLocaleString('en-US')}</td><td class="r">${fx(l.unitPrice, e.currencySymbol)}</td><td class="r">${fx(l.amount, e.currencySymbol)}</td></tr>`
      : `<tr><td>${l.lineNo}</td><td>${esc(l.itemName)} (${esc(l.itemCode)})</td><td class="r">${l.quantity.toLocaleString('en-US')}</td><td>${esc(l.unit)}</td></tr>`,
    ).join('')

    win.document.write(`<!doctype html><meta charset="utf-8"><title>${money ? 'Commercial Invoice' : 'Packing List'} ${esc(e.invoiceNo)}</title>
      <style>
        body{font-family:system-ui,'Malgun Gothic',sans-serif;padding:32px;color:#222}
        h1{font-size:20px;letter-spacing:2px;text-align:center;margin:0 0 18px}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
        th,td{border:1px solid #999;padding:6px 8px;text-align:left}
        th{background:#f2f4f7}
        .r{text-align:right}
        .meta td{border:none;padding:3px 0;font-size:13px}
        .foot{margin-top:14px;font-size:13px}
      </style>
      <h1>${money ? 'COMMERCIAL INVOICE' : 'PACKING LIST'}</h1>
      <table class="meta">
        <tr><td style="width:120px"><b>Invoice No.</b></td><td>${esc(e.invoiceNo)}</td>
            <td style="width:120px"><b>Date</b></td><td>${esc(e.invoiceDate)}</td></tr>
        <tr><td><b>Buyer</b></td><td>${esc(e.buyerName)}</td>
            <td><b>Destination</b></td><td>${esc(e.destination ?? '-')}</td></tr>
        <tr><td><b>Terms</b></td><td>${esc(e.incoterms ?? '-')}</td>
            <td><b>B/L No.</b></td><td>${esc(e.blNo ?? '-')}</td></tr>
        <tr><td><b>수출신고번호</b></td><td colspan="3">${esc(e.declarationNo ?? '-')}</td></tr>
      </table>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      ${money ? `<div class="foot"><b>Total: ${esc(e.currencyCode)} ${fx(e.foreignAmount, e.currencySymbol)}</b>
        &nbsp;·&nbsp; 원화환산 ${won(e.krwAmount)} 원 (적용환율 ${e.appliedRate.toLocaleString('ko-KR')})</div>` : ''}
      <script>window.onload=()=>window.print()<\/script>`)
    win.document.close()
  }

  return (
    <EcListShell title="수출관리" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 인보이스 발행(F2)</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>
          오더 → 통관진행(신고번호) → 선적완료(B/L) → 입금완료. 원화는 발행일 고시환율로 고정됩니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {summary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Tile label="수출 총액(원화)" value={won(summary.totalKrw)} />
          <Tile label="미입금 잔액" value={won(summary.unpaidKrw)} strong />
          <Tile label="오더" value={`${summary.orderCount}건`} />
          <Tile label="통관·선적 중" value={`${summary.shippingCount}건`} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({tabCount(t)})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>Invoice No.</th><th>발행일</th><th>Buyer</th><th>도착지</th><th>조건</th>
            <th style={{ textAlign: 'right' }}>외화금액</th>
            <th style={{ textAlign: 'right' }}>적용환율</th>
            <th style={{ textAlign: 'right' }}>원화환산</th>
            <th style={{ textAlign: 'center' }}>상태</th>
            <th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>수출 인보이스가 없습니다.</td></tr>
          ) : shown.map((e, i) => (
            <Fragment key={e.id}>
              <tr onClick={() => setOpenId(openId === e.id ? null : e.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>
                  {openId === e.id ? '▾ ' : '▸ '}{e.invoiceNo}
                </td>
                <td>{e.invoiceDate}</td>
                <td>{e.buyerName}</td>
                <td>{e.destination ?? ''}</td>
                <td>{e.incoterms ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{e.currencyCode} {fx(e.foreignAmount, e.currencySymbol)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{e.appliedRate.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(e.krwAmount)}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(e.status) }}>{e.statusName}</span></td>
                <td style={{ textAlign: 'center' }} onClick={(ev) => ev.stopPropagation()}>
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    {e.status === 'ORDER' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => customs(e)}>통관진행</button>}
                    {e.status === 'CUSTOMS' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => ship(e)}>선적완료</button>}
                    {e.status === 'SHIPPED' && <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => pay(e)}>입금완료</button>}
                    {e.status === 'PAID' && <span style={{ fontSize: 11, color: '#1c7c3c' }}>{e.paidDate}</span>}
                  </div>
                </td>
              </tr>
              {openId === e.id && (
                <tr className="no-ec">
                  <td colSpan={11} style={{ padding: 0, background: '#fafbfc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12, color: '#5a626e' }}>
                      <span>수출신고번호: <b>{e.declarationNo ?? '—'}</b></span>
                      <span>· B/L: <b>{e.blNo ?? '—'}</b></span>
                      {e.shippedDate && <span>· 선적일: <b>{e.shippedDate}</b></span>}
                      <button className="ec-btn" style={{ marginLeft: 'auto', height: 20, padding: '0 8px' }} onClick={() => print(e, 'INVOICE')}>Commercial Invoice</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => print(e, 'PACKING')}>Packing List</button>
                    </div>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th>
                          <th style={{ textAlign: 'right' }}>수량</th>
                          <th style={{ textAlign: 'right' }}>외화단가</th>
                          <th style={{ textAlign: 'right' }}>외화금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.lines.map((l) => (
                          <tr key={l.id}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{l.lineNo}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{l.quantity.toLocaleString('ko-KR')} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{fx(l.unitPrice, e.currencySymbol)}</td>
                            <td style={{ textAlign: 'right' }}>{fx(l.amount, e.currencySymbol)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {showForm && (
        <ExportForm
          partners={partners}
          currencies={currencies}
          items={items}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); flash('인보이스를 발행했습니다.'); load() }}
        />
      )}
    </EcListShell>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, border: '1px solid var(--ec-border)', borderRadius: 3, padding: '8px 10px', background: strong ? '#eef5ff' : '#fff' }}>
      <div style={{ fontSize: 11.5, color: '#8a929c' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: strong ? 'var(--ec-blue-dark)' : '#2b3440' }}>{value}</div>
    </div>
  )
}

function ExportForm({ partners, currencies, items, onClose, onSaved }: {
  partners: Partner[]
  currencies: Currency[]
  items: Item[]
  onClose: () => void
  onSaved: () => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [currencyId, setCurrencyId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [incoterms, setIncoterms] = useState('FOB')
  const [destination, setDestination] = useState('')
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const symbol = currencies.find((c) => String(c.id) === currencyId)?.symbol ?? ''
  const calc = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))
  const total = calc.reduce((a, b) => a + b, 0)

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function save() {
    setError('')
    if (!partnerId) return setError('수입자(Buyer)를 선택하세요.')
    if (!currencyId) return setError('통화를 선택하세요. (통화·고시환율은 기초등록 > 외화에서 등록합니다)')
    const payload = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    if (payload.length === 0) return setError('품목을 1개 이상 입력하세요.')
    setSaving(true)
    try {
      await api.post('/exports', {
        partnerId: Number(partnerId), currencyId: Number(currencyId), invoiceDate,
        incoterms: incoterms || undefined, destination: destination || undefined, lines: payload,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 760, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>Commercial Invoice 발행</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>Buyer<span style={{ color: '#c60a2e' }}>*</span></th>
                <td>
                  <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 220 }}>
                    <option value="">수입자 선택</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <th style={{ width: 70, background: '#f5f7fa' }}>발행일</th>
                <td><input type="date" className="ec-input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>통화<span style={{ color: '#c60a2e' }}>*</span></th>
                <td>
                  <select className="ec-input" value={currencyId} onChange={(e) => setCurrencyId(e.target.value)} style={{ width: 220 }}>
                    <option value="">통화 선택</option>
                    {currencies.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                  </select>
                </td>
                <th style={{ background: '#f5f7fa' }}>가격조건</th>
                <td>
                  <select className="ec-input" value={incoterms} onChange={(e) => setIncoterms(e.target.value)} style={{ width: 100 }}>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="EXW">EXW</option>
                    <option value="DDP">DDP</option>
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>도착지</th>
                <td colSpan={3}>
                  <input className="ec-input" value={destination} onChange={(e) => setDestination(e.target.value)}
                    style={{ width: 300 }} placeholder="예: Los Angeles, USA" />
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th><th>품목</th>
                <th style={{ width: 90, textAlign: 'right' }}>수량</th>
                <th style={{ width: 110, textAlign: 'right' }}>외화단가</th>
                <th style={{ textAlign: 'right' }}>외화금액</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>
                    <select className="ec-input" value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value })} style={{ width: '100%' }}>
                      <option value="">품목 선택</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.code} {it.name}</option>)}
                    </select>
                  </td>
                  <td><input className="ec-input" type="number" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td><input className="ec-input" type="number" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right' }}>{fx(calc[i], symbol)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>Total</td>
                <td colSpan={2} style={{ textAlign: 'right' }}>{fx(total, symbol)}</td>
              </tr>
            </tfoot>
          </table>
          <button className="ec-btn" style={{ marginTop: 8 }} onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ 행 추가</button>
          <div style={{ marginTop: 10, fontSize: 12, color: '#8a929c' }}>
            원화 환산액은 저장 시 발행일 고시환율로 계산돼 인보이스에 고정됩니다(그날 고시가 없으면 직전 고시 적용).
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '발행 중…' : '발행(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
