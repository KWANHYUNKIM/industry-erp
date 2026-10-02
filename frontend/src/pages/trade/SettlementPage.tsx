import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import type { Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

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
const today = () => ymd(new Date())
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
  /**
   * 귀속 프로젝트. 수금현황·지급현황의 [프로젝트] 조건이 이 값을 본다 —
   * 조건만 있고 정할 자리가 없으면 그 조건은 늘 빈칸만 거른다.
   */
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])

  // 수금=매출처, 지급=매입처
  const usablePartners = useMemo(
    () => partners.filter((p) => (type === 'RECEIPT' ? p.type === 'CUSTOMER' || p.type === 'BOTH' : p.type === 'SUPPLIER' || p.type === 'BOTH')),
    [partners, type],
  )

  async function load() {
    try {
      const [p, s, pj] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<Settlement[]>('/settlements'),
        api.get<{ id: number; code: string; name: string }[]>('/projects'),
      ])
      setProjects(pj.data)
      setPartners(p.data)
      setRows(s.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  /*
   * 고른 거래처의 지금 채권·채무 잔액. 넘게 받거나 넘게 줘도 막지는 않는다(선수금·선급금일 수 있다).
   * 다만 알려 준다 — 0 하나를 더 쳐서 300,000 을 3,000,000 으로 받아도 아무 말 없이 저장되고
   * 채권이 음수가 됐다(2026-10-01, 수금을 넣어 보다 발견).
   */
  const [balances, setBalances] = useState<Record<string, { receivable: number; payable: number }>>({})
  useEffect(() => {
    api.get<{ partnerId: number; receivable: number; payable: number }[]>('/ledger/partner-balances', { params: { asOf: date } })
      .then((r) => setBalances(Object.fromEntries(r.data.map((b) => [String(b.partnerId), { receivable: Number(b.receivable), payable: Number(b.payable) }]))))
      .catch(() => setBalances({}))
  }, [date, ok])
  const balance = partnerId ? balances[partnerId] : undefined
  const open = balance ? (type === 'RECEIPT' ? balance.receivable : balance.payable) : undefined
  const over = open != null && Number(amount) > 0 && Number(amount) > Math.max(open, 0)
  useEffect(() => { setPartnerId('') }, [type])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!partnerId) return setError('거래처를 선택하세요.')
    // 음수는 되돌린 돈(수금 − = 매출처에 환불). 반품 뒤 돌려줄 돈을 넣을 길이 없었다(27회차).
    if (!Number(amount)) return setError('금액을 입력하세요. 돌려준 돈(환불)은 음수로 적습니다.')
    try {
      const res = await api.post<Settlement>('/settlements', {
        type, partnerId: Number(partnerId), amount: Number(amount), method, settleDate: date,
        projectId: projectId ? Number(projectId) : null,
        note: note || undefined,
      })
      setOk(`${res.data.docNo} 저장 완료 · ${res.data.typeName} ${won(res.data.amount)}원`)
      setAmount(''); setNote(''); setProjectId('')
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const inputCls = 'ec-input'

  /**
   * 정산 전표 삭제. 잘못 넣은 수금·지급을 지울 방법이 아예 없었고, 정산은 거래처 채권·채무
   * 잔액에 그대로 반영되므로 오타 하나가 잔액을 영구히 틀리게 만든다.
   */
  async function remove(r: Settlement) {
    if (!window.confirm(`${r.docNo} (${r.typeName} ${won(r.amount)}원) 전표를 삭제할까요?
거래처 잔액에서 이 금액이 빠집니다.`)) return
    try { await api.delete(`/settlements/${r.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(rows, {
    일자: (r) => r.settleDate,
  })

  return (
    <EcListShell
      title="수금/지급 입력"
      onNew={() => setShowForm(true)}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">수금 → 거래처 채권(미수금) 감소 · 지급 → 거래처 채무(미지급) 감소</p>

      <Modal open={showForm} title="수금/지급 입력" onClose={() => setShowForm(false)}>{(
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
              {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측 525칸, 예외 없음) — 드롭다운은 항목이 늘면 못 찾는다. */}
              <CodePickerField label="거래처 *" hideLabel fill placeholder="거래처"
                               emptyLabel="선택하세요"
                               value={partnerId} onChange={(v) => setPartnerId(v)}
                               items={usablePartners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">일자</label>
              <input type="date" className={inputCls} style={{ width: '100%' }} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">금액 *</label>
              <input type="number" className={`${inputCls} text-right`} style={{ width: '100%' }} value={amount} onChange={(e) => setAmount(e.target.value)} />
              {open != null && (
                <div style={{ marginTop: 3, fontSize: 11.5, color: over ? '#b45309' : '#8a929c' }}>
                  {type === 'RECEIPT' ? '받을 돈(채권)' : '줄 돈(채무)'} {won(open)}원
                  {over && ` — ${won(Number(amount) - Math.max(open, 0))}원 넘습니다(${type === 'RECEIPT' ? '선수금' : '선급금'}으로 남음)`}
                  {open < 0 && ` — ${type === 'RECEIPT' ? '받을 돈이 음수 = 돌려줄 돈입니다. 환불은 금액을 음수로' : '줄 돈이 음수 = 돌려받을 돈입니다. 환급은 금액을 음수로'}`}
                  {Number(amount) < 0 && ` · ${type === 'RECEIPT' ? '환불' : '환급'} ${won(-Number(amount))}원`}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">결제수단</label>
              <select className={inputCls} style={{ width: '100%' }} value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">프로젝트</label>
              {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측 525칸, 예외 없음) — 드롭다운은 항목이 늘면 못 찾는다. */}
              <CodePickerField label="프로젝트" hideLabel fill placeholder="프로젝트"
                               emptyLabel="선택 안 함"
                               value={projectId} onChange={(v) => setProjectId(v)}
                               items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
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
      )}</Modal>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>전표번호</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('일자')}>일자 {sort.mark('일자')}</th>
              <th>유형</th>
              <th>거래처</th>
              <th>결제수단</th>
              <th style={{ textAlign: 'right' }}>금액</th>
              <th>비고</th>
              <th style={{ width: 70, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : sort.sorted.map((r, idx) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
                <td>{dateText(r.settleDate)}</td>
                <td><span style={{ color: r.type === 'RECEIPT' ? 'var(--ec-blue)' : '#2f8401', fontWeight: 700 }}>{r.typeName}</span></td>
                <td>{r.partnerName}</td>
                <td>{r.method ?? ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: r.type === 'RECEIPT' ? 'var(--ec-blue)' : '#2f8401' }}>{won(r.amount)}</td>
                <td>{r.note ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="ec-btn ec-btn-sm" style={{ color: '#c60a2e' }} onClick={() => remove(r)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EcListShell>
  )
}
