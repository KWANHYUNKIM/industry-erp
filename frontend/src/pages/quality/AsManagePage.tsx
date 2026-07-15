import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

type AsStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
const LABEL: Record<AsStatus, string> = { RECEIVED: '접수', IN_PROGRESS: '처리중', COMPLETED: '완료', CANCELED: '취소' }
const COLOR: Record<AsStatus, string> = { RECEIVED: '#c07a00', IN_PROGRESS: 'var(--ec-blue)', COMPLETED: '#1c7c3c', CANCELED: '#8a929c' }
const NEXT: Record<AsStatus, AsStatus | null> = { RECEIVED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: null, CANCELED: null }

interface AsRow {
  id: number; asNo: string; partnerId: number; partnerName: string; itemId: number; itemName: string
  receiptDate: string; symptom: string | null; charge: string | null
  status: AsStatus; statusName: string; doneDate: string | null; repairNote: string | null
}

const today = () => new Date().toISOString().slice(0, 10)

export default function AsManagePage() {
  const [rows, setRows] = useState<AsRow[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
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
      const [a, p, i] = await Promise.all([
        api.get<AsRow[]>('/as-requests'),
        api.get<Partner[]>('/partners'),
        api.get<Item[]>('/items'),
      ])
      setRows(a.data); setPartners(p.data); setItems(i.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

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

  const shown = rows
    .filter((r) => statusFilter === 'ALL' || r.status === statusFilter)
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.itemName.includes(keyword) || r.asNo.includes(keyword))
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
                  <select className={inputCls} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ minWidth: 200 }}>
                    <option value="">선택하세요</option>
                    {customers.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                  </select>
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
            <th>접수번호 ▼</th><th>접수일 ▼</th><th>거래처 ▼</th><th>품목</th><th>증상</th>
            <th>담당</th><th style={{ textAlign: 'center' }}>상태</th><th>완료일</th><th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>A/S 접수 내역이 없습니다.</td></tr>
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
                {r.status !== 'COMPLETED' && r.status !== 'CANCELED' && <button className="no-ec" onClick={() => cancel(r)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>취소</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
