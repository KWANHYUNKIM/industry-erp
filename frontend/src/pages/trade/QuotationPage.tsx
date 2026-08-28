import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { Item, Partner, Quotation, QuotationStatus } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())

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
  const [itemCond, setItemCond] = useState('')
  const [company, setCompany] = useState<DocParty | null>(null)

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

  /** 원본은 일자와 번호를 '2026/08/03 -1' 로 한 칸에 적는다(판매조회와 같은 규칙). */
  const dateNo = (q: { quoteDate: string; quoteNo: string }) => {
    const seq = q.quoteNo.split('-').pop() ?? ''
    return `${q.quoteDate.replace(/-/g, '/')} -${Number(seq) || seq}`
  }

  /*
   * 원본 견적서 조건 차례: 기준일자 · 견적No. · 내.외자구분 · 창고 · 프로젝트 ·
   * 관리항목 · 거래처 · <b>품목</b> · 발송여부.
   *
   * <p>품목은 목록에 <b>[품목명(요약)]</b> 으로 찍히는데 그것으로 거를 수가 없었다 —
   * 그 품목이 든 견적을 찾으려면 한 줄씩 펼쳐 봐야 했다. 요약에는 첫 줄만 보이므로
   * <b>모든 줄</b>을 훑는다(요약만 보고 거르면 둘째 줄부터가 안 걸린다).
   */
  const shown = useMemo(() => rows
    .filter((r) => tab === '전체' || r.status === TAB_STATUS[tab])
    .filter((r) => !itemCond || r.lines.some((l) => l.itemName.includes(itemCond))),
    [rows, tab, itemCond])
  const tabCount = (t: Tab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length

  async function send(q: Quotation) {
    try { await api.post(`/quotations/${q.id}/send`); flash(`${q.quoteNo} 발송`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  useEffect(() => { loadSupplierParty().then(setCompany) }, [])

  /** 견적서 서식 인쇄 — 거래명세서와 같은 템플릿을 쓴다(제목·유효기간만 다르다). */
  async function printQuote(q: Quotation) {
    const p = partners.find((x) => x.id === q.partnerId)
    await printDocuments([{
      title: '견 적 서',
      docNo: q.quoteNo,
      docDate: q.quoteDate,
      supplier: company ?? { label: '공급자', name: '(회사정보 미등록)' },
      customer: {
        label: '수신처', name: q.partnerName,
        bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem,
        tel: p?.phone, address: p?.address,
      },
      extra: [{ label: '유효기간', value: q.validUntil }, { label: '담당', value: q.createdBy }],
      remark: q.remark,
      lines: q.lines.map((l) => ({
        itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount,
      })),
      footNote: '아래와 같이 견적합니다.',
    }])
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

  // 취소는 문서를 남긴 채 상태만 바꾼다. 잘못 만든 견적서는 지우는 게 맞다 —
  // 취소로 덮어 두면 목록이 죽은 문서로 계속 불어난다.
  async function remove(q: Quotation) {
    if (!window.confirm(`${q.quoteNo}을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await api.delete(`/quotations/${q.id}`); load() }
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

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      {/* 원본 조건 차례: … 거래처 · <b>품목</b> · 발송여부 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={190} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
      </ul>

      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            {/*
              원본 견적서조회(E040202) 열과 순서 그대로다(실측 74·295·297·236·533·236·277·106·106·106).
              일자와 번호는 원본처럼 한 칸에 적는다('2026/08/03 -1').
            */}
            <th style={{ width: 34 }}></th>
            <th>일자-No.</th>
            <th>거래처명</th>
            <th>사원(담당)명</th>
            <th>품목명(요약)</th>
            <th>유효기간</th>
            <th style={{ textAlign: 'right' }}>견적금액합계</th>
            <th style={{ textAlign: 'center' }}>진행상태</th>
            <th style={{ textAlign: 'center' }}>생성한전표</th>
            <th style={{ textAlign: 'center' }}>인쇄</th>
            {/* 아래는 원본에 없지만 우리가 더 보여 주는 열이다. 원본 열을 밀어내지 않도록 뒤에 둔다. */}
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th>
            <th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((q, i) => (
            <Fragment key={q.id}>
              <tr onClick={() => setOpenId(openId === q.id ? null : q.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>
                  {openId === q.id ? '▾ ' : '▸ '}{dateNo(q)}
                </td>
                <td>{q.partnerName}</td>
                <td>{q.createdBy ?? ''}</td>
                <td style={{ color: '#5a626e' }}>
                  {q.lines[0]?.itemName ?? ''}{q.lines.length > 1 ? ` 외 ${q.lines.length - 1}건` : ''}
                </td>
                <td>{q.validUntil ?? ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(q.totalAmount)}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(q.status) }}>{q.statusName}</span></td>
                <td style={{ textAlign: 'center', color: '#1c7c3c', fontSize: 11.5 }}>
                  {/* 원본 '생성한전표' — 이 견적서에서 만들어진 전표. 우리는 수주만 만든다. */}
                  {q.convertedOrderId ? `수주 #${q.convertedOrderId}` : ''}
                </td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button className="ec-btn ec-btn-sm" onClick={() => printQuote(q)}>인쇄</button>
                </td>
                <td style={{ textAlign: 'right' }}>{won(q.supplyAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(q.vatAmount)}</td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    {q.status === 'DRAFT' && <button className="ec-btn ec-btn-sm" onClick={() => send(q)}>발송</button>}
                    {(q.status === 'DRAFT' || q.status === 'SENT') && <button className="ec-btn ec-btn-sm ec-btn-primary" onClick={() => convert(q)}>수주전환</button>}
                    {q.status !== 'CONVERTED' && q.status !== 'CANCELLED' && <button className="ec-btn ec-btn-sm" style={{ color: '#c60a2e' }} onClick={() => cancel(q)}>취소</button>}
                    <button className="ec-btn ec-btn-sm" style={{ color: '#c60a2e' }} onClick={() => remove(q)}>삭제</button>
                  </div>
                </td>
              </tr>
              {openId === q.id && (
                <tr className="no-ec">
                  <td colSpan={13} style={{ padding: 0, background: '#fafbfc' }}>
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

      {showForm && <QuotationForm items={items} partners={partners} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('견적서를 작성했습니다.'); load() }} />}
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
                    <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                                     value={l.itemId} onChange={(v) => pickItem(i, v)}
                                     items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
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
