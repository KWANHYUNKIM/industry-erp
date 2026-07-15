import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner, Quotation, QuotationStatus } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)

const TABS = ['전체', '작성', '발송', '수주전환', '취소'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, QuotationStatus> = {
  작성: 'DRAFT', 발송: 'SENT', 수주전환: 'CONVERTED', 취소: 'CANCELLED',
}
const statusColor = (s: QuotationStatus) =>
  s === 'CONVERTED' ? '#1c7c3c' : s === 'CANCELLED' ? '#8a929c' : s === 'SENT' ? 'var(--ec-blue)' : '#5a626e'

interface LineForm { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unitPrice: '' })

/** 견적서 — 영업 흐름의 시작점. 작성→발송→수주전환. 부가세 10% 자동. */
export default function QuotationPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Quotation[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<Quotation[]>('/quotations').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => {
    load()
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'SUPPLIER'))).catch(() => {})
  }, [])

  const shown = useMemo(() => rows.filter((r) => tab === '전체' || r.status === TAB_STATUS[tab]), [rows, tab])
  const tabCount = (t: Tab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length

  async function send(q: Quotation) {
    try { await api.post(`/quotations/${q.id}/send`); flash(`${q.quoteNo} 발송`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function convert(q: Quotation) {
    if (!window.confirm(`${q.quoteNo}을(를) 수주로 전환할까요?`)) return
    try {
      const r = await api.post(`/quotations/${q.id}/convert`)
      flash(`수주 ${r.data.orderNo} 생성됨`)
      load()
      if (window.confirm('생성된 수주 화면으로 이동할까요?')) navigate('/sales/orders')
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function cancel(q: Quotation) {
    if (!window.confirm(`${q.quoteNo}을(를) 취소할까요?`)) return
    try { await api.post(`/quotations/${q.id}/cancel`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="견적서" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowForm(true)}>+ 신규 견적(F2)</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>견적 → 발송 → 수주전환. 부가세 10% 자동.</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

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
            <th>견적번호</th><th>견적일</th><th>유효기한</th><th>거래처</th>
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th><th style={{ textAlign: 'right' }}>합계</th>
            <th style={{ textAlign: 'center' }}>상태</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>견적서가 없습니다.</td></tr>
          ) : shown.map((q, i) => (
            <Fragment key={q.id}>
              <tr onClick={() => setOpenId(openId === q.id ? null : q.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{openId === q.id ? '▾ ' : '▸ '}{q.quoteNo}</td>
                <td>{q.quoteDate}</td>
                <td>{q.validUntil ?? ''}</td>
                <td>{q.partnerName}</td>
                <td style={{ textAlign: 'right' }}>{won(q.supplyAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(q.vatAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(q.totalAmount)}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(q.status) }}>{q.statusName}</span></td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    {q.status === 'DRAFT' && <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => send(q)}>발송</button>}
                    {(q.status === 'DRAFT' || q.status === 'SENT') && <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => convert(q)}>수주전환</button>}
                    {q.status !== 'CONVERTED' && q.status !== 'CANCELLED' && <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => cancel(q)}>취소</button>}
                    {q.status === 'CONVERTED' && <span style={{ fontSize: 11, color: '#1c7c3c' }}>수주 #{q.convertedOrderId}</span>}
                  </div>
                </td>
              </tr>
              {openId === q.id && (
                <tr className="no-ec">
                  <td colSpan={10} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead><tr><th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th></tr></thead>
                      <tbody>
                        {q.lines.map((l) => (
                          <tr key={l.id}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{l.lineNo}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.supplyAmount)}</td>
                            <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(l.vatAmount)}</td>
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

      <Modal open={showForm} title="견적서 등록" onClose={() => setShowForm(false)}>{<QuotationForm items={items} partners={partners} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('견적서를 작성했습니다.'); load() }} />}</Modal>
    </EcListShell>
  )
}

function QuotationForm({ items, partners, onClose, onSaved }: {
  items: Item[]; partners: Partner[]; onClose: () => void; onSaved: () => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [quoteDate, setQuoteDate] = useState(today())
  const [validUntil, setValidUntil] = useState('')
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function pickItem(i: number, itemId: string) {
    const it = items.find((x) => String(x.id) === itemId)
    setLine(i, { itemId, unitPrice: it ? String(it.unitPrice) : '' })
  }

  const calc = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))
  const supply = calc.reduce((a, b) => a + b, 0)
  const vat = Math.round(supply * 0.1)

  async function save() {
    setError('')
    if (!partnerId) return setError('거래처를 선택하세요.')
    const payload = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    if (payload.length === 0) return setError('품목을 1개 이상 입력하세요.')
    setSaving(true)
    try {
      await api.post('/quotations', { partnerId: Number(partnerId), quoteDate, validUntil: validUntil || undefined, taxable: true, lines: payload })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 720, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>견적서 작성</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>거래처<span style={{ color: '#c60a2e' }}>*</span></th>
                <td>
                  <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 240 }}>
                    <option value="">매출처 선택</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <th style={{ width: 70, background: '#f5f7fa' }}>견적일</th>
                <td><input type="date" className="ec-input" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>유효기한</th>
                <td><input type="date" className="ec-input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={{ width: 150 }} /></td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-left">
            <thead><tr><th style={{ width: 34 }}></th><th>품목</th><th style={{ width: 90, textAlign: 'right' }}>수량</th><th style={{ width: 110, textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>
                    <select className="ec-input" value={l.itemId} onChange={(e) => pickItem(i, e.target.value)} style={{ width: '100%' }}>
                      <option value="">품목 선택</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.code} {it.name}</option>)}
                    </select>
                  </td>
                  <td><input className="ec-input" type="number" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td><input className="ec-input" type="number" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right' }}>{won(calc[i])}</td>
                  <td style={{ textAlign: 'center' }}>{lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>공급가액 / 부가세 / 합계</td>
                <td style={{ textAlign: 'right' }} colSpan={2}>{won(supply)} / {won(vat)} / <span style={{ color: 'var(--ec-blue-dark)' }}>{won(supply + vat)}</span></td>
              </tr>
            </tfoot>
          </table>
          <button className="ec-btn" style={{ marginTop: 8 }} onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ 행 추가</button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
