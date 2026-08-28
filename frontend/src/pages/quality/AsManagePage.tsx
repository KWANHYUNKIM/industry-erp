import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import type { Item, Partner, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'

interface AsPart {
  id: number; itemId: number; itemName: string; warehouseId: number; warehouseName: string
  quantity: number; unitPrice: number | null; amount: number | null; remark: string | null
}
const won = (n: number) => n.toLocaleString('ko-KR')

type AsStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
const LABEL: Record<AsStatus, string> = { RECEIVED: '접수', IN_PROGRESS: '처리중', COMPLETED: '완료', CANCELED: '취소' }
const COLOR: Record<AsStatus, string> = { RECEIVED: '#c07a00', IN_PROGRESS: 'var(--ec-blue)', COMPLETED: '#1c7c3c', CANCELED: '#8a929c' }
const NEXT: Record<AsStatus, AsStatus | null> = { RECEIVED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: null, CANCELED: null }

interface AsRow {
  id: number; asNo: string; partnerId: number; partnerName: string; itemId: number; itemName: string
  receiptDate: string; symptom: string | null; charge: string | null
  status: AsStatus; statusName: string; doneDate: string | null; repairNote: string | null
}

const today = () => ymd(new Date())

export default function AsManagePage() {
  const [rows, setRows] = useState<AsRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [error, setError] = useState('')

  // 소모부품 관리
  const [partsFor, setPartsFor] = useState<AsRow | null>(null)
  const [parts, setParts] = useState<AsPart[]>([])
  const [partForm, setPartForm] = useState({ itemId: '', warehouseId: '', quantity: '', unitPrice: '' })
  const [partError, setPartError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | AsStatus>('ALL')

  const [partnerId, setPartnerId] = useState('')
  const [itemId, setItemId] = useState('')
  const [receiptDate, setReceiptDate] = useState(today())
  const [symptom, setSymptom] = useState('')
  const [charge, setCharge] = useState('')

  const customers = useMemo(() => partners.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH'), [partners])

  async function load() {
    try {
      const [a, p, i, w] = await Promise.all([
        api.get<AsRow[]>('/as-requests'),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
        api.get<Warehouse[]>('/warehouses'),
      ])
      setRows(a.data); setPartners(p.data); setItems(i.data); setWarehouses(w.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function openParts(r: AsRow) {
    setPartsFor(r); setPartError(''); setPartForm({ itemId: '', warehouseId: '', quantity: '', unitPrice: '' })
    try { setParts((await api.get<AsPart[]>(`/as-requests/${r.id}/parts`)).data) }
    catch (err) { setPartError(extractErrorMessage(err)) }
  }
  async function addPart() {
    if (!partsFor) return
    setPartError('')
    if (!partForm.itemId) return setPartError('품목을 선택하세요.')
    if (!partForm.warehouseId) return setPartError('창고를 선택하세요.')
    if (!(Number(partForm.quantity) > 0)) return setPartError('수량은 0보다 커야 합니다.')
    try {
      await api.post(`/as-requests/${partsFor.id}/parts`, {
        itemId: Number(partForm.itemId), warehouseId: Number(partForm.warehouseId),
        quantity: Number(partForm.quantity), unitPrice: partForm.unitPrice ? Number(partForm.unitPrice) : undefined,
      })
      setPartForm({ itemId: '', warehouseId: '', quantity: '', unitPrice: '' })
      setParts((await api.get<AsPart[]>(`/as-requests/${partsFor.id}/parts`)).data)
    } catch (err) { setPartError(extractErrorMessage(err)) }
  }
  async function delPart(p: AsPart) {
    if (!partsFor) return
    if (!confirm(`${p.itemName} ${won(p.quantity)}개 소모를 삭제할까요? (재고 복원)`)) return
    try {
      await api.delete(`/as-requests/parts/${p.id}`)
      setParts((await api.get<AsPart[]>(`/as-requests/${partsFor.id}/parts`)).data)
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (!itemId) return setError('품목을 선택하세요.')
    try {
      const res = await api.post<AsRow>('/as-requests', {
        partnerId: Number(partnerId), itemId: Number(itemId), receiptDate,
        symptom: symptom || undefined, charge: charge || undefined,
      })
      setOk(`${res.data.asNo} A/S 접수 완료`)
      setSymptom(''); setCharge('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function advance(r: AsRow) {
    const next = NEXT[r.status]
    if (!next) return
    let repairNote: string | undefined
    if (next === 'COMPLETED') {
      const v = prompt('수리내역을 입력하세요.', r.repairNote ?? '')
      if (v === null) return
      repairNote = v
    }
    try { await api.patch(`/as-requests/${r.id}`, { status: next, repairNote }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }
  async function cancel(r: AsRow) {
    if (!confirm(`${r.asNo} A/S를 취소할까요?`)) return
    try { await api.patch(`/as-requests/${r.id}`, { status: 'CANCELED' }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shownRows = rows
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.itemName.includes(keyword) || r.asNo.includes(keyword))

  /* 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(shownRows, {
    접수번호: (r) => r.asNo,
    접수일: (r) => r.receiptDate,
    거래처: (r) => r.partnerName,
  })
  const shown = sort.sorted
  const openCount = rows.filter((r) => r.status === 'RECEIVED' || r.status === 'IN_PROGRESS').length

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 74 }

  return (
    <EcListShell
      title="A/S 접수·수리 관리"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : 'A/S접수(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">고객 제품의 A/S 접수·수리 관리 · 접수 → 처리중 → 완료 · 미완료 {openCount}건</p>

      <Modal open={showForm} title="A/S 접수·수리 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>거래처 *</th>
                <td>
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다. */}
                <CodePickerField label="거래처 *" hideLabel fill
                                 emptyLabel="선택하세요"
                                 value={partnerId} onChange={setPartnerId}
                                 items={customers.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
                <th style={th}>접수일</th>
                <td><input type="date" className={inputCls} value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>품목 *</th>
                <td>
                  <select className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ minWidth: 200 }}>
                    <option value="">선택하세요</option>
                    {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
                  </select>
                </td>
                <th style={th}>담당</th>
                <td><input className={inputCls} value={charge} onChange={(e) => setCharge(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>증상</th>
                <td colSpan={3}><input className={inputCls} value={symptom} onChange={(e) => setSymptom(e.target.value)} style={{ width: '100%' }} placeholder="고장 증상을 입력하세요" /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">접수(F8)</button></div>
        </form>
      )}</Modal>

      <Modal open={!!partsFor} title={`소모부품 · ${partsFor?.asNo ?? ''}`} onClose={() => setPartsFor(null)}>{(
        <div style={{ padding: 4, minWidth: 560 }}>
          <p className="mb-2 text-xs text-slate-500">A/S 수리에 사용한 부품. 등록 시 창고 재고가 차감되고, 삭제 시 복원됩니다.</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
            <select className="ec-input" value={partForm.itemId} onChange={(e) => setPartForm((f) => ({ ...f, itemId: e.target.value }))} style={{ minWidth: 180 }}>
              <option value="">부품(품목) 선택</option>
              {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
            </select>
            <select className="ec-input" value={partForm.warehouseId} onChange={(e) => setPartForm((f) => ({ ...f, warehouseId: e.target.value }))} style={{ minWidth: 130 }}>
              <option value="">창고</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
            </select>
            <input className="ec-input text-right" type="number" placeholder="수량" value={partForm.quantity} onChange={(e) => setPartForm((f) => ({ ...f, quantity: e.target.value }))} style={{ width: 80 }} />
            <input className="ec-input text-right" type="number" placeholder="단가" value={partForm.unitPrice} onChange={(e) => setPartForm((f) => ({ ...f, unitPrice: e.target.value }))} style={{ width: 100 }} />
            <button className="ec-btn ec-btn-primary" onClick={addPart}>추가(재고차감)</button>
          </div>
          {partError && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{partError}</p>}
          <table className="w-full text-left">
            <thead>
              <tr><th style={{ width: 34 }}></th><th>부품</th><th>창고</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>금액</th><th style={{ textAlign: 'center' }}></th></tr>
            </thead>
            <tbody>
              {parts.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 14 }}>소모부품 없음</td></tr>
              ) : parts.map((p, i) => (
                <tr key={p.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>{p.itemName}</td>
                  <td>{p.warehouseName}</td>
                  <td style={{ textAlign: 'right' }}>{won(p.quantity)}</td>
                  <td style={{ textAlign: 'right' }}>{p.unitPrice != null ? won(p.unitPrice) : '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.amount != null ? won(p.amount) : '-'}</td>
                  <td style={{ textAlign: 'center' }}><button className="no-ec" onClick={() => delPart(p)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}</Modal>

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {(['ALL', 'RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: statusFilter === s ? 'var(--ec-blue)' : '#fff', color: statusFilter === s ? '#fff' : '#3a4453', fontWeight: statusFilter === s ? 700 : 400,
          }}>{s === 'ALL' ? '전체' : LABEL[s]} ({s === 'ALL' ? rows.length : rows.filter((r) => r.status === s).length})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('접수번호')}>접수번호 {sort.mark('접수번호')}</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('접수일')}>접수일 {sort.mark('접수일')}</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처')}>거래처 {sort.mark('거래처')}</th><th>품목</th><th>증상</th>
            <th>담당</th><th style={{ textAlign: 'center' }}>상태</th><th>완료일</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.asNo}</td>
              <td>{r.receiptDate}</td>
              <td>{r.partnerName}</td>
              <td>{r.itemName}</td>
              <td>{r.symptom ?? ''}</td>
              <td>{r.charge ?? ''}</td>
              <td style={{ textAlign: 'center', color: COLOR[r.status], fontWeight: 700 }}>{r.statusName}</td>
              <td>{r.doneDate ?? ''}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {NEXT[r.status] && <button className="no-ec" onClick={() => advance(r)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>→ {LABEL[NEXT[r.status]!]}</button>}
                <button className="no-ec" onClick={() => openParts(r)} style={{ border: 'none', background: 'none', color: '#5a626e', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>부품</button>
                {r.status !== 'COMPLETED' && r.status !== 'CANCELED' && <button className="no-ec" onClick={() => cancel(r)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>취소</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
