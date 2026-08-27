import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, QualityInspectionRequest, QualityInspectionType, QualityRequestStatus } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 재고 II > 품질관리 — 품질검사요청 (이카운트 C000692·E040628~E040631)
 * 검사 전 '요청'을 등록하고, 요청 → 검사완료/취소로 진행. 미검사현황 = 요청(REQUESTED) 상태.
 * 데이터는 GET/POST/PATCH/DELETE /api/quality-inspection-requests (백엔드 신설).
 */

const today = () => ymd(new Date())

const TYPES: { v: QualityInspectionType; label: string }[] = [
  { v: 'INCOMING', label: '수입검사' },
  { v: 'PROCESS', label: '공정검사' },
  { v: 'SHIPMENT', label: '출하검사' },
]

type Tab = 'ALL' | QualityRequestStatus
const TABS: { v: Tab; label: string }[] = [
  { v: 'ALL', label: '전체' },
  { v: 'REQUESTED', label: '미검사(요청)' },
  { v: 'INSPECTED', label: '검사완료' },
  { v: 'CANCELED', label: '취소' },
]
const statusColor = (s: QualityRequestStatus) => (s === 'REQUESTED' ? '#c07a00' : s === 'INSPECTED' ? '#1c7c3c' : '#8a929c')

export default function QualityRequestPage() {
  const [rows, setRows] = useState<QualityInspectionRequest[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    requestDate: today(), type: 'INCOMING', itemId: '',
    lotNo: '', requestQty: '', dueDate: '', requester: '', remark: '',
  })

  async function load() {
    setLoading(true)
    try {
      const [q, i] = await Promise.all([
        api.get<QualityInspectionRequest[]>('/quality-inspection-requests'),
        api.get<Item[]>('/items'),
      ])
      setRows(q.data); setItems(i.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.itemId) return setError('품목을 선택하세요.')
    if (form.requestQty === '' || Number(form.requestQty) <= 0) return setError('요청수량을 입력하세요.')
    try {
      await api.post('/quality-inspection-requests', {
        requestDate: form.requestDate,
        type: form.type,
        itemId: Number(form.itemId),
        lotNo: form.lotNo || undefined,
        requestQty: Number(form.requestQty),
        dueDate: form.dueDate || undefined,
        requester: form.requester || undefined,
        remark: form.remark || undefined,
      })
      setForm((f) => ({ ...f, itemId: '', lotNo: '', requestQty: '', dueDate: '', requester: '', remark: '' }))
      setShowForm(false)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function advance(r: QualityInspectionRequest, status: QualityRequestStatus) {
    try { await api.patch(`/quality-inspection-requests/${r.id}/status`, { status }); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const shown = useMemo(() => rows
    .filter((r) => tab === 'ALL' || r.status === tab)
    .filter((r) => !keyword || r.itemName.includes(keyword) || r.requestNo.includes(keyword) || (r.lotNo ?? '').includes(keyword)),
  [rows, tab, keyword])
  const count = (t: Tab) => (t === 'ALL' ? rows.length : rows.filter((r) => r.status === t).length)
  const inputCls = 'ec-input'

  return (
    <EcListShell
      title="품질검사요청"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">검사 전 요청을 등록 → 검사완료/취소 처리. 미검사현황 = 요청(대기) 상태.</p>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="품질검사요청 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>검사요청 등록</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>요청일자</div>
              <input className={inputCls} type="date" value={form.requestDate} onChange={(e) => set('requestDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사구분</div>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)} style={{ width: 110 }}>
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              <select className={inputCls} value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
                <option value="">선택하세요</option>
                {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>로트No.</div>
              <input className={inputCls} value={form.lotNo} onChange={(e) => set('lotNo', e.target.value)} style={{ width: 150 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>요청수량 *</div>
              <input className={inputCls} type="number" step="any" value={form.requestQty} onChange={(e) => set('requestQty', e.target.value)} style={{ width: 100 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사기한</div>
              <input className={inputCls} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>요청자</div>
              <input className={inputCls} value={form.requester} onChange={(e) => set('requester', e.target.value)} placeholder="미입력시 본인" style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 180 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>비고</div>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: '100%' }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
        </div>
      )}</Modal>

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: tab === t.v ? 'var(--ec-blue)' : '#fff', color: tab === t.v ? '#fff' : '#3a4453', fontWeight: tab === t.v ? 700 : 400,
          }}>{t.label} ({count(t.v)})</button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>요청번호</th>
            <th style={{ width: 100 }}>요청일자 ▼</th>
            <th style={{ width: 90 }}>검사구분</th>
            <th>품목명</th>
            <th style={{ width: 120 }}>로트No.</th>
            <th style={{ width: 80, textAlign: 'right' }}>요청수량</th>
            <th style={{ width: 100 }}>검사기한</th>
            <th style={{ width: 80, textAlign: 'center' }}>상태</th>
            <th style={{ width: 80 }}>요청자</th>
            <th style={{ width: 150, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.requestNo}</td>
              <td>{r.requestDate}</td>
              <td>{r.typeName}</td>
              <td>{r.itemName}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.lotNo ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.requestQty.toLocaleString()}</td>
              <td style={{ color: r.dueDate ? '#5a626e' : '#c5cbd3' }}>{r.dueDate ?? '-'}</td>
              <td style={{ textAlign: 'center', color: statusColor(r.status), fontWeight: 700 }}>{r.statusName}</td>
              <td>{r.requester ?? ''}</td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                {r.status === 'REQUESTED' ? (
                  <>
                    <button className="no-ec" onClick={() => advance(r, 'INSPECTED')} style={{ border: 'none', background: 'none', color: '#1c7c3c', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>→ 검사완료</button>
                    <button className="no-ec" onClick={() => advance(r, 'CANCELED')} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>취소</button>
                  </>
                ) : <span style={{ color: '#c5cbd3', fontSize: 12 }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
