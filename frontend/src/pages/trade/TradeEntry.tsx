import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner, PurchaseDoc, SalesDoc, Warehouse } from '../../api/types'
import { exportTableToXlsx } from '../../utils/excel'
import { printTable } from '../../utils/print'
import { findDataTable } from '../../utils/tableExport'

type Mode = 'sales' | 'purchase'

interface LineInput {
  itemId: string
  quantity: string
  unitPrice: string
}

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)
const emptyLine = (): LineInput => ({ itemId: '', quantity: '', unitPrice: '' })

const CFG = {
  sales: {
    endpoint: '/sales',
    title: '판매입력',
    desc: '매출처로 출고 · 재고 감소 + 채권(외상매출금) 증가',
    partnerLabel: '매출처',
    canUse: (p: Partner) => p.type === 'CUSTOMER' || p.type === 'BOTH',
    accent: 'var(--ec-blue)',
  },
  purchase: {
    endpoint: '/purchases',
    title: '구매입력',
    desc: '매입처에서 입고 · 재고 증가 + 채무(외상매입금) 증가',
    partnerLabel: '매입처',
    canUse: (p: Partner) => p.type === 'SUPPLIER' || p.type === 'BOTH',
    accent: '#2f8401',
  },
} as const

export default function TradeEntry({ mode }: { mode: Mode }) {
  const cfg = CFG[mode]
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [docs, setDocs] = useState<(SalesDoc | PurchaseDoc)[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [notice, setNotice] = useState('')  // Excel/인쇄 안내 문구
  const [helpOpen, setHelpOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)  // 명세 그리드 표만 내보내기 대상으로 잡는다

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2500)
  }

  // 편집형 명세 그리드를 .xlsx/인쇄로 내보낸다. tableToMatrix가 input/select 현재값을 읽는다.
  async function doExcel() {
    const table = findDataTable(gridRef.current)
    if (!table) return flash('내보낼 표가 없습니다.')
    const okExport = await exportTableToXlsx(table, cfg.title)
    if (!okExport) flash('내보낼 품목이 없습니다.')
  }
  function doPrint() {
    const table = findDataTable(gridRef.current)
    if (!table) return flash('인쇄할 표가 없습니다.')
    if (!printTable(table, cfg.title)) flash('인쇄할 품목이 없습니다.')
  }

  const [partnerId, setPartnerId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [date, setDate] = useState(today())
  const [taxable, setTaxable] = useState(true)
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState<LineInput[]>([emptyLine()])

  const usablePartners = useMemo(() => partners.filter(cfg.canUse), [partners, cfg])
  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])

  async function loadRefs() {
    const [p, w, i] = await Promise.all([
      api.get<Partner[]>('/partners'),
      api.get<Warehouse[]>('/warehouses'),
      api.get<Item[]>('/items'),
    ])
    setPartners(p.data)
    setWarehouses(w.data)
    setItems(i.data)
    setWarehouseId((prev) => prev || (w.data[0] ? String(w.data[0].id) : ''))
  }

  async function loadDocs() {
    const res = await api.get<(SalesDoc | PurchaseDoc)[]>(cfg.endpoint)
    setDocs(res.data)
  }

  useEffect(() => {
    loadRefs()
    loadDocs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  /** 셀 변경. 품목을 고르면 단가 자동입력(비어있을 때) + 마지막 행이면 새 행 자동 추가 */
  function updateLine(idx: number, field: keyof LineInput, value: string) {
    setLines((ls) => {
      const next = ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
      if (field === 'itemId' && value) {
        const it = itemById.get(value)
        if (it && !next[idx].unitPrice) next[idx] = { ...next[idx], unitPrice: String(it.unitPrice) }
        if (!next[idx].quantity) next[idx] = { ...next[idx], quantity: '1' }
        if (idx === ls.length - 1) next.push(emptyLine())
      }
      return next
    })
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length === 1 ? [emptyLine()] : ls.filter((_, i) => i !== idx)))
  }

  const computed = lines.map((l) => {
    const qty = Number(l.quantity) || 0
    const price = Number(l.unitPrice) || 0
    const supply = qty * price
    const vat = taxable ? Math.round(supply * 0.1) : 0
    return { supply, vat, total: supply + vat }
  })
  const totals = computed.reduce(
    (a, c) => ({ supply: a.supply + c.supply, vat: a.vat + c.vat, total: a.total + c.total }),
    { supply: 0, vat: 0, total: 0 },
  )
  const lineCount = lines.filter((l) => l.itemId).length

  function dateOf(d: SalesDoc | PurchaseDoc) {
    return (d as SalesDoc).saleDate ?? (d as PurchaseDoc).purchaseDate
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setOk('')
    const validLines = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (validLines.length === 0) return setError('품목·수량·단가를 1줄 이상 입력하세요.')

    const dateKey = mode === 'sales' ? 'saleDate' : 'purchaseDate'
    try {
      const res = await api.post<SalesDoc | PurchaseDoc>(cfg.endpoint, {
        partnerId: Number(partnerId),
        warehouseId: Number(warehouseId),
        [dateKey]: date,
        taxable,
        remark: remark || undefined,
        lines: validLines,
      })
      setOk(`${res.data.docNo} 저장 완료 (합계 ${won(res.data.totalAmount)}원)`)
      setLines([emptyLine()])
      setRemark('')
      loadDocs()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }
  const cellInput = 'ec-input'

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* ☆ 제목 + 하단이 아닌 상단 툴바 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>{cfg.title}</span>
        <span style={{ marginLeft: 10, fontSize: 11.5, color: '#8a929c' }}>{cfg.desc}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => { setLines([emptyLine()]); setRemark(''); setOk(''); setError('') }}>초기화</button>
          <button type="button" className="ec-btn" onClick={() => setHelpOpen(true)}>도움말</button>
        </div>
      </div>

      {/* 헤더 정보 */}
      <table className="w-full text-left" style={{ marginBottom: 8, maxWidth: 900 }}>
        <tbody>
          <tr>
            <th style={th}>{cfg.partnerLabel} *</th>
            <td>
              <select className={cellInput} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ minWidth: 220 }}>
                <option value="">선택하세요</option>
                {usablePartners.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
              </select>
            </td>
            <th style={th}>창고 *</th>
            <td>
              <select className={cellInput} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ minWidth: 160 }}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th style={th}>일자</th>
            <td><input type="date" className={cellInput} value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} /></td>
            <th style={th}>부가세</th>
            <td>
              <select className={cellInput} value={taxable ? 'Y' : 'N'} onChange={(e) => setTaxable(e.target.value === 'Y')} style={{ width: 130 }}>
                <option value="Y">과세 (10%)</option>
                <option value="N">면세</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 엑셀형 명세 그리드 (ref로 감싸 내보내기 대상으로 지정) */}
      <div ref={gridRef}>
      <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목 *</th>
            <th style={{ width: 60 }}>단위</th>
            <th style={{ width: 110, textAlign: 'right' }}>수량</th>
            <th style={{ width: 130, textAlign: 'right' }}>단가</th>
            <th style={{ width: 130, textAlign: 'right' }}>공급가액</th>
            <th style={{ width: 110, textAlign: 'right' }}>부가세</th>
            <th style={{ width: 130, textAlign: 'right' }}>합계</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const it = itemById.get(l.itemId)
            return (
              // 빈 입력행은 내보내기/인쇄에서 제외
              <tr key={idx} data-export-skip={l.itemId ? undefined : 'true'}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{l.itemId ? idx + 1 : ''}</td>
                <td>
                  <select className={cellInput} value={l.itemId} onChange={(e) => updateLine(idx, 'itemId', e.target.value)} style={{ width: '100%' }}>
                    <option value="">선택</option>
                    {items.map((i) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: 'center', color: '#5a626e' }}>{it?.unit ?? ''}</td>
                <td><input type="number" step="any" className={cellInput} value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></td>
                <td><input type="number" step="any" className={cellInput} value={l.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)} style={{ width: '100%', textAlign: 'right' }} /></td>
                <td style={{ textAlign: 'right', color: '#3a4453' }}>{won(computed[idx].supply)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(computed[idx].vat)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(computed[idx].total)}</td>
                <td style={{ textAlign: 'center' }}>
                  {l.itemId && <button type="button" onClick={() => removeLine(idx)} className="no-ec" style={{ border: 'none', background: 'none', color: '#c0c5cc', cursor: 'pointer' }}>✕</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={5} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계 ({lineCount}건)</td>
            <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right' }}>{won(totals.supply)}</td>
            <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right' }}>{won(totals.vat)}</td>
            <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: cfg.accent }}>{won(totals.total)}</td>
            <td style={{ border: '1px solid var(--ec-border)' }}></td>
          </tr>
        </tfoot>
      </table>
      </div>

      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5a626e', fontWeight: 600, width: 40 }}>비고</span>
        <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ maxWidth: 500, flex: 1 }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#9aa1ab' }}>※ 품목을 선택하면 단가가 자동 입력되고 다음 행이 추가됩니다.</div>

      {notice && <p style={{ marginTop: 10, background: '#eef5ff', color: '#2b5b91', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, border: '1px solid #cfe0f5' }}>{notice}</p>}
      {error && <p style={{ marginTop: 10, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {ok && <p style={{ marginTop: 10, background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{ok}</p>}

      {/* 하단 저장 툴바 */}
      <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
        <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
        <button type="button" className="ec-btn" onClick={doPrint}>인쇄</button>
        <button type="button" className="ec-btn" onClick={doExcel}>Excel</button>
      </div>

      {/* 최근 전표 */}
      <div style={{ marginTop: 20, marginBottom: 6, fontSize: 13, fontWeight: 800, color: 'var(--ec-text)' }}>
        최근 {mode === 'sales' ? '판매' : '구매'} 전표
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>전표번호</th>
            <th>일자</th>
            <th>{cfg.partnerLabel}</th>
            <th>품목</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
            <th style={{ textAlign: 'right' }}>합계</th>
          </tr>
        </thead>
        <tbody>
          {docs.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>전표가 없습니다.</td></tr>
          ) : docs.map((d) => (
            <tr key={d.id}>
              <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
              <td>{dateOf(d)}</td>
              <td>{d.partnerName}</td>
              <td>{d.lines[0]?.itemName}{d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}</td>
              <td style={{ textAlign: 'right' }}>{won(d.supplyAmount)}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(d.vatAmount)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: cfg.accent }}>{won(d.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 도움말 모달 (EcListShell과 동일 패턴) */}
      {helpOpen && (
        <div
          onClick={() => setHelpOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 4, width: 440, maxWidth: '90vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>{cfg.title} · 도움말</span>
              <button type="button" className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setHelpOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                <li>{cfg.partnerLabel}·창고·일자를 고르고, 아래 그리드에 품목·수량·단가를 입력합니다.</li>
                <li>품목을 선택하면 단가가 자동으로 채워지고 다음 입력행이 추가됩니다.</li>
                <li><b>저장(F8)</b>으로 전표를 저장하면 재고와 {mode === 'sales' ? '채권' : '채무'}에 반영됩니다.</li>
                <li><b>Excel·인쇄</b>는 지금 입력한 명세 그리드를 그대로 내보냅니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
