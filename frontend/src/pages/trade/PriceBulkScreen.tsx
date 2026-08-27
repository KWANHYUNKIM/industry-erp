import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/periods'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Partner, Item, Warehouse } from '../../api/types'
import { partnerCodeItems } from '../../utils/codeItems'

/**
 * 판매·구매 단가일괄변경.
 *
 * <p>원본이 하는 일은 <b>이미 입력한 전표의 단가를 고치는 것</b>이다. 기준일자·거래처·품목·
 * 창고·진행상태로 전표 라인을 뽑아 그리드에서 단가를 고치고 [저장(F8)] 하면 공급가액·부가세가
 * 다시 계산된다. 우리 화면은 오랫동안 <b>품목 표준단가</b>만 바꿨다 — 이름은 같은데 하는 일이
 * 달라서, "지난달 판매단가를 고쳐 달라"는 요청에는 전표를 하나씩 열어 고치는 수밖에 없었다.
 *
 * <p>표준단가 조정도 쓸모가 있어 버리지 않고 [구분]의 두 번째 선택지로 남겼다.
 *
 * <p>판매·구매 두 화면이 거의 같은 코드였고 실제로 한 번 갈라져서(구매 화면이 판매단가를
 * 보여주던 시절) 한 컴포넌트로 합쳤다.
 */
interface SlipLineRow {
  lineId: number
  slipId: number
  docNo: string
  slipDate: string
  partnerName: string
  employeeName: string | null
  warehouseName: string
  taxTypeName: string
  itemCode: string
  itemName: string
  spec: string | null
  unit: string
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
  editable: boolean
  lockReason: string | null
}

interface PriceBulkItem {
  id: number
  code: string
  name: string
  spec: string | null
  unit: string
  unitPrice: number
  purchasePrice: number
  avgSalePrice: number | null
  avgPurchasePrice: number | null
}

const MODES = ['전표단가', '품목 표준단가'] as const
type Mode = typeof MODES[number]

const won = (n: number) => n.toLocaleString('ko-KR')

export default function PriceBulkScreen({ trade }: { trade: 'SALES' | 'PURCHASE' }) {
  const sale = trade === 'SALES'
  const title = sale ? '판매단가일괄변경' : '구매단가일괄변경'

  const [mode, setMode] = useState<Mode>('전표단가')
  // 원본 기본값은 금월(~오늘)이다.
  const init = periodOf('금월(~오늘)') ?? { from: ymd(new Date()), to: ymd(new Date()) }
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partnerId, setPartnerId] = useState('')
  const [itemId, setItemId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [status, setStatus] = useState<'ALL' | 'UNCONFIRMED' | 'CONFIRMED'>('ALL')

  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  const [rows, setRows] = useState<SlipLineRow[]>([])
  /** 원본 [거래유형] — 과세 · 면세. 전표에 저장된 과세 여부를 본다. */
  const [taxType, setTaxType] = useState('')
  /** 원본 [구매구분]·[거래구분] — 전체 · 일반 · 반품. */
  const [tradeKind, setTradeKind] = useState('')
  /** 라인 id → 사용자가 고쳐 넣은 단가(문자열). 저장 전까지 여기에만 있다. */
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    Promise.all([
      api.get<Partner[]>('/partners'),
      api.get<Item[]>('/items'),
      api.get<Warehouse[]>('/warehouses'),
    ]).then(([p, i, w]) => { setPartners(p.data); setItems(i.data); setWarehouses(w.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  async function loadLines() {
    setLoading(true); setError(''); setMessage('')
    try {
      const res = await api.get<SlipLineRow[]>('/price-bulk/lines', {
        params: {
          tradeType: trade, from, to, status,
          ...(partnerId ? { partnerId } : {}),
          ...(itemId ? { itemId } : {}),
          ...(warehouseId ? { warehouseId } : {}),
          ...(taxType ? { taxType } : {}),
          ...(tradeKind ? { tradeKind } : {}),
        },
      })
      setRows(res.data)
      setEdits({})
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (mode === '전표단가') loadLines() }, [mode])

  const changed = useMemo(
    () => rows.filter((r) => {
      const v = edits[r.lineId]
      return v != null && v !== '' && Number(v) !== r.unitPrice && !Number.isNaN(Number(v))
    }),
    [rows, edits],
  )

  async function save() {
    setError(''); setMessage('')
    if (changed.length === 0) return setError('바꾼 단가가 없습니다.')
    const locked = changed.filter((r) => !r.editable)
    if (locked.length > 0) {
      return setError(`고칠 수 없는 전표가 있습니다: ${locked.map((r) => r.docNo).join(', ')}`)
    }
    setSaving(true)
    try {
      const res = await api.put<{ changedLines: number; changedSlips: number }>('/price-bulk/lines', {
        tradeType: trade,
        changes: changed.map((r) => ({ lineId: r.lineId, unitPrice: Number(edits[r.lineId]) })),
      })
      setMessage(`${res.data.changedSlips}개 전표 ${res.data.changedLines}줄의 단가를 바꿨습니다. 공급가액·부가세도 다시 계산했습니다.`)
      await loadLines()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const total = useMemo(() => rows.reduce((a, r) => ({
    qty: a.qty + r.quantity, supply: a.supply + r.supplyAmount, vat: a.vat + r.vatAmount,
  }), { qty: 0, supply: 0, vat: 0 }), [rows])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [rows.length, mode])

  return (
    <EcListShell
      title={title}
      actions={mode === '전표단가'
        ? [
          { label: loading ? '조회 중…' : '검색(F8)', onClick: loadLines },
          { label: saving ? '저장 중…' : `저장(F8)${changed.length ? ` (${changed.length})` : ''}`, onClick: save, primary: true },
          { label: 'Excel' },
        ]
        : [{ label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {message && <p style={{ background: '#e9f6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{message}</p>}

      <EcStatusPanel
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        from={from} to={to} onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_PICKS}
      >
        {mode === '전표단가' && (
          <>
            <EcCond label="거래처" pick>
              <CodePickerField
                label="거래처" hideLabel width={220} emptyLabel="전체"
                value={partnerId} onChange={setPartnerId}
                items={partnerCodeItems(partners)}
              />
            </EcCond>
            <EcCond label="품목" pick>
              <CodePickerField
                label="품목" hideLabel width={220} emptyLabel="전체"
                value={itemId} onChange={setItemId}
                items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, alias: i.searchKeyword, sub: i.spec ?? undefined }))}
              />
            </EcCond>
            <EcCond label="창고" pick>
              <CodePickerField
                label="창고" hideLabel width={180} emptyLabel="전체"
                value={warehouseId} onChange={setWarehouseId}
                items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))}
              />
            </EcCond>
            {/*
              원본 조건의 [거래유형]. 예전에는 만들지 않았다 — 전표가 과세 여부를 안 들고
              있어서 부가세가 0 인지로 되짚어야 했고, 반올림으로 0 이 된 과세 전표가 면세로
              섞였기 때문이다. 이제 전표가 그 값을 저장하므로 걸 수 있다.
            */}
            <EcCond label="거래유형">
              <div className="ec-pills">
                {['', '과세', '면세'].map((v) => (
                  <button key={v || 'all'} type="button"
                          className={`ec-pill no-ec${taxType === v ? ' active' : ''}`}
                          onClick={() => setTaxType(v)}>{v || '전체'}</button>
                ))}
              </div>
            </EcCond>
            {/*
              원본 [구매구분](구매) · [거래구분](판매) — 전체 · 일반 · 반품.
              반품 전표는 수량·금액이 음수라, 단가를 고칠 대상에서 갈라 볼 수 있어야 한다.
            */}
            <EcCond label={sale ? '거래구분' : '구매구분'}>
              <div className="ec-pills">
                {['', '일반', '반품'].map((v) => (
                  <button key={v || 'all'} type="button"
                          className={`ec-pill no-ec${tradeKind === v ? ' active' : ''}`}
                          onClick={() => setTradeKind(v)}>{v || '전체'}</button>
                ))}
              </div>
            </EcCond>
            {/* 구매전표에는 확인(진행상태) 개념이 없다 — 그래서 판매에서만 그린다. */}
            {sale && (
              <EcCond label="진행상태">
                <select className="ec-input" style={{ width: 130 }} value={status}
                        onChange={(e) => setStatus(e.target.value as typeof status)}>
                  <option value="ALL">전체</option>
                  <option value="UNCONFIRMED">미확인</option>
                  <option value="CONFIRMED">확인</option>
                </select>
              </EcCond>
            )}
          </>
        )}
      </EcStatusPanel>

      {mode === '전표단가'
        ? <SlipGrid rows={rows} edits={edits} setEdits={setEdits} loading={loading} total={total} tableRef={tableRef} />
        : <ItemPriceGrid sale={sale} />}
    </EcListShell>
  )
}

function SlipGrid({ rows, edits, setEdits, loading, total, tableRef }: {
  rows: SlipLineRow[]
  edits: Record<number, string>
  setEdits: (f: (prev: Record<number, string>) => Record<number, string>) => void
  loading: boolean
  total: { qty: number; supply: number; vat: number }
  tableRef: React.RefObject<HTMLTableElement | null>
}) {
  return (
    <table className="ec-grid w-full text-left" ref={tableRef}>
      <thead>
        <tr>
          <th style={{ textAlign: 'center' }}>일자-No.</th>
          <th>거래처명</th>
          <th>담당자명</th>
          <th>창고명</th>
          <th>거래유형</th>
          <th>품목코드</th>
          <th>품목명</th>
          <th>규격명</th>
          <th style={{ textAlign: 'right' }}>수량</th>
          <th style={{ textAlign: 'right' }}>단가</th>
          <th style={{ textAlign: 'right' }}>공급가액</th>
          <th style={{ textAlign: 'right' }}>부가세</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
        ) : rows.map((r) => {
          const v = edits[r.lineId]
          const next = v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : r.unitPrice
          const dirty = next !== r.unitPrice
          return (
            <tr key={r.lineId} style={dirty ? { background: '#fffbe6' } : undefined}>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.slipDate.replace(/-/g, '/')} {r.docNo}</td>
              <td>{r.partnerName}</td>
              <td>{r.employeeName ?? ''}</td>
              <td>{r.warehouseName}</td>
              <td>{r.taxTypeName}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}</td>
              <td>{r.spec ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{won(r.quantity)}</td>
              <td style={{ textAlign: 'right' }}>
                {r.editable ? (
                  <input
                    className="ec-input" type="number" style={{ width: 100, textAlign: 'right' }}
                    value={v ?? String(r.unitPrice)}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [r.lineId]: e.target.value }))}
                  />
                ) : (
                  <span title={r.lockReason ?? undefined} style={{ color: '#8a929c' }}>{won(r.unitPrice)} 🔒</span>
                )}
              </td>
              {/* 저장 전 미리보기 — 서버가 부가세를 다시 배분하므로 부가세 열은 저장 뒤에 맞는다. */}
              <td style={{ textAlign: 'right' }}>{won(Math.round(r.quantity * next))}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.vatAmount)}</td>
            </tr>
          )
        })}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr>
            <td colSpan={8} style={{ textAlign: 'center', fontWeight: 700 }}>합계 ({rows.length}줄)</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(total.qty)}</td>
            <td></td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(total.supply)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(total.vat)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

/** [구분] 두 번째 — 품목 표준단가를 증감율/증감액으로 조정한다. 원본에는 없는 우리 확장. */
function ItemPriceGrid({ sale }: { sale: boolean }) {
  const [rows, setRows] = useState<PriceBulkItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [calc, setCalc] = useState<'rate' | 'amount'>('rate')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const priceOf = (r: PriceBulkItem) => (sale ? r.unitPrice : r.purchasePrice)
  const avgOf = (r: PriceBulkItem) => (sale ? r.avgSalePrice : r.avgPurchasePrice)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<PriceBulkItem[]>('/price-bulk/items')
      setRows(res.data)
      setSelected(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const num = Number(value)
  function previewPrice(current: number, checked: boolean): number {
    if (!checked || !value || Number.isNaN(num)) return current
    return Math.max(0, Math.round((calc === 'rate' ? current * (1 + num / 100) : current + num) * 100) / 100)
  }

  const selectedCount = rows.filter((r) => selected.has(r.id)).length

  async function apply() {
    setMessage(''); setError('')
    if (selected.size === 0) return setError('변경할 품목을 선택하세요.')
    if (!value || Number.isNaN(num) || num === 0) return setError(calc === 'rate' ? '증감율(%)을 입력하세요.' : '증감액을 입력하세요.')
    setApplying(true)
    try {
      const res = await api.post<{ updatedCount: number }>('/price-bulk/apply', {
        itemIds: [...selected], field: sale ? 'sale' : 'purchase', mode: calc, value: num,
      })
      setMessage(`${res.data.updatedCount}개 품목의 ${sale ? '판매' : '구매'}단가가 변경되었습니다.`)
      setValue('')
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {message && <p style={{ background: '#e9f6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{message}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5a626e' }}>변경방식</span>
        <select className="ec-input" style={{ width: 110 }} value={calc} onChange={(e) => setCalc(e.target.value as 'rate' | 'amount')}>
          <option value="rate">증감율(%)</option>
          <option value="amount">증감액</option>
        </select>
        <input type="number" className="ec-input" style={{ width: 110, textAlign: 'right' }}
               placeholder={calc === 'rate' ? '예: 10, -5' : '예: 1000, -500'}
               value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="ec-btn ec-btn-primary" onClick={apply} disabled={applying}>{applying ? '적용 중…' : '일괄적용'}</button>
        <span style={{ fontSize: 12.5, color: '#8a929c' }}>선택 {selectedCount}건 · 앞으로 입력할 전표에 채워질 기준값입니다</span>
      </div>
      <table className="ec-grid w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: 'center' }}>
              <input type="checkbox" checked={rows.length > 0 && selectedCount === rows.length}
                     onChange={() => setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))} />
            </th>
            <th>품목코드</th><th>품목명</th>
            <th style={{ textAlign: 'right' }}>{sale ? '판매' : '구매'}평균단가</th>
            <th style={{ textAlign: 'right' }}>현재{sale ? '판매' : '구매'}단가</th>
            <th style={{ textAlign: 'right' }}>변경단가</th>
            <th style={{ textAlign: 'right' }}>증감</th>
            <th style={{ textAlign: 'right' }}>증감율(%)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => {
            const checked = selected.has(r.id)
            const cur = priceOf(r)
            const newPrice = previewPrice(cur, checked)
            const diff = newPrice - cur
            const rate = cur ? Math.round(diff / cur * 100) : 0
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={checked} onChange={() => setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                    return next
                  })} />
                </td>
                <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
                <td>{r.name}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{avgOf(r) != null ? avgOf(r)!.toLocaleString('ko-KR') : '-'}</td>
                <td style={{ textAlign: 'right', color: cur > 0 ? undefined : '#c9ced6' }}>{cur.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', fontWeight: checked ? 600 : 400 }}>{newPrice.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', color: diff > 0 ? '#c60a2e' : diff < 0 ? '#1c7c3c' : '#9aa1ab' }}>{diff.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{rate.toLocaleString('ko-KR')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
