import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'

type SettlementType = 'RECEIPT' | 'PAYMENT'

interface Settlement {
  id: number
  docNo: string
  type: SettlementType
  typeName: string
  partnerId: number
  partnerName: string
  settleDate: string
  amount: number
  method: string | null
  note: string | null
  createdBy: string | null
}

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)
const METHODS = ['현금', '계좌이체', '어음', '카드']

export default function SettlementPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [rows, setRows] = useState<Settlement[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(true)

  const [type, setType] = useState<SettlementType>('RECEIPT')
  const [partnerId, setPartnerId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('현금')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')

  // 수금=매출처, 지급=매입처
  const usablePartners = useMemo(
    () => partners.filter((p) => (type === 'RECEIPT' ? p.type === 'CUSTOMER' || p.type === 'BOTH' : p.type === 'SUPPLIER' || p.type === 'BOTH')),
    [partners, type],
  )

  async function load() {
    try {
      const [p, s] = await Promise.all([api.get<Partner[]>('/partners'), api.get<Settlement[]>('/settlements')])
      setPartners(p.data)
      setRows(s.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setPartnerId('') }, [type])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!partnerId) return setError('거래처를 선택하세요.')
    if (!(Number(amount) > 0)) return setError('금액을 입력하세요.')
    try {
      const res = await api.post<Settlement>('/settlements', {
        type, partnerId: Number(partnerId), amount: Number(amount), method, settleDate: date, note: note || undefined,
      })
      setOk(`${res.data.docNo} 저장 완료 · ${res.data.typeName} ${won(res.data.amount)}원`)
      setAmount(''); setNote('')
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const inputCls = 'ec-input'

  return (
    <EcListShell
      title="수금/지급 입력"
      newLabel={showForm ? '입력닫기' : '신규(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">수금 → 거래처 채권(미수금) 감소 · 지급 → 거래처 채무(미지급) 감소</p>

      {showForm && (
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', borderRadius: 3, padding: 12, marginBottom: 10, background: '#fff', maxWidth: 760 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div>
              <label className="mb-1 block text-xs text-slate-600">유형 *</label>
              <select className={inputCls} style={{ width: '100%' }} value={type} onChange={(e) => setType(e.target.value as SettlementType)}>
                <option value="RECEIPT">수금 (매출처)</option>
                <option value="PAYMENT">지급 (매입처)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">거래처 *</label>
              <select className={inputCls} style={{ width: '100%' }} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">선택하세요</option>
                {usablePartners.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">일자</label>
              <input type="date" className={inputCls} style={{ width: '100%' }} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">금액 *</label>
              <input type="number" className={`${inputCls} text-right`} style={{ width: '100%' }} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">결제수단</label>
              <select className={inputCls} style={{ width: '100%' }} value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">비고</label>
              <input className={inputCls} style={{ width: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}>
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>전표번호</th>
              <th>일자 ▼</th>
              <th>유형</th>
              <th>거래처</th>
              <th>결제수단</th>
              <th style={{ textAlign: 'right' }}>금액</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>수금/지급 내역이 없습니다.</td></tr>
            ) : rows.map((r, idx) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
                <td>{r.settleDate}</td>
                <td><span style={{ color: r.type === 'RECEIPT' ? 'var(--ec-blue)' : '#2f8401', fontWeight: 700 }}>{r.typeName}</span></td>
                <td>{r.partnerName}</td>
                <td>{r.method ?? ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: r.type === 'RECEIPT' ? 'var(--ec-blue)' : '#2f8401' }}>{won(r.amount)}</td>
                <td>{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
