import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

interface Account { id: number; code: string; name: string; division: string }
interface Partner { id: number; name: string }

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)

/** 현금거래 — 입금/출금 간편입력. 입금은 차)현금·대)상대계정, 출금은 차)상대계정·대)현금 분개가 자동 생성된다. */
export default function CashTxnPage({ mode }: { mode: 'deposit' | 'withdraw' }) {
  const navigate = useNavigate()
  const deposit = mode === 'deposit'
  const title = deposit ? '현금예금입금' : '현금예금출금'
  const [accounts, setAccounts] = useState<Account[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [entryDate, setEntryDate] = useState(today())
  const [counterAccountId, setCounterAccountId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Account[]>('/accounts').then((r) => setAccounts(r.data.filter((a) => a.code !== '101'))).catch((e) => setError(extractErrorMessage(e)))
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
  }, [])

  const amountNum = Number(amount) || 0

  async function save() {
    setError('')
    if (!counterAccountId) return setError('상대 계정을 선택하세요.')
    if (amountNum <= 0) return setError('금액을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/journals/cash', {
        entryDate,
        deposit,
        counterAccountId: Number(counterAccountId),
        amount: amountNum,
        partnerId: partnerId ? Number(partnerId) : undefined,
        description: description || undefined,
      })
      navigate('/accounting/journals')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const counterName = accounts.find((a) => String(a.id) === counterAccountId)?.name ?? '상대계정'
  const accent = deposit ? '#1a4d8f' : '#a5561b'

  return (
    <EcListShell title={title} actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <p style={{ marginBottom: 10, fontSize: 12, color: '#8a929c' }}>
        {deposit ? '현금이 들어옵니다. 차변 현금 / 대변 상대계정으로 분개됩니다.' : '현금이 나갑니다. 차변 상대계정 / 대변 현금으로 분개됩니다.'}
      </p>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left" style={{ maxWidth: 560, marginBottom: 12 }}>
        <tbody>
          <tr>
            <th style={{ width: 120, background: '#f5f7fa' }}>전표일자</th>
            <td><input type="date" className="ec-input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={{ width: 160 }} /></td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>상대 계정<span style={{ color: '#c60a2e' }}>*</span></th>
            <td>
              <select className="ec-input" value={counterAccountId} onChange={(e) => setCounterAccountId(e.target.value)} style={{ width: 280 }}>
                <option value="">{deposit ? '입금 원인 계정(매출·차입 등)' : '지출 원인 계정(비용 등)'}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>거래처</th>
            <td>
              <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 280 }}>
                <option value="">선택(선택사항)</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>금액<span style={{ color: '#c60a2e' }}>*</span></th>
            <td><input className="ec-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 200, textAlign: 'right' }} /></td>
          </tr>
          <tr>
            <th style={{ background: '#f5f7fa' }}>적요</th>
            <td><input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={title} style={{ width: '100%' }} /></td>
          </tr>
        </tbody>
      </table>

      {amountNum > 0 && counterAccountId && (
        <div style={{ maxWidth: 560, marginBottom: 12, padding: '10px 14px', border: '1px solid var(--ec-border)', background: '#fafbfc', fontSize: 12.5 }}>
          <div style={{ fontWeight: 700, color: accent, marginBottom: 4 }}>분개 미리보기</div>
          {deposit ? (
            <>
              <div>차) 현금 {won(amountNum)}</div>
              <div style={{ marginLeft: 16 }}>대) {counterName} {won(amountNum)}</div>
            </>
          ) : (
            <>
              <div>차) {counterName} {won(amountNum)}</div>
              <div style={{ marginLeft: 16 }}>대) 현금 {won(amountNum)}</div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        <button className="ec-btn" onClick={() => navigate('/accounting/journals')}>전표조회로</button>
      </div>
    </EcListShell>
  )
}
