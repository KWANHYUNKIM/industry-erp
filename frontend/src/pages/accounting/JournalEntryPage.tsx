import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

interface Account { id: number; code: string; name: string; division: string }
interface Row { accountId: string; debit: string; credit: string; description: string }

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => new Date().toISOString().slice(0, 10)
const emptyRow = (): Row => ({ accountId: '', debit: '', credit: '', description: '' })

/** 일반전표 입력 — 차변/대변 라인을 직접 입력해 회계전표를 만든다. 차변합=대변합이어야 저장된다. */
export default function JournalEntryPage() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entryDate, setEntryDate] = useState(today())
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Account[]>('/accounts').then((r) => setAccounts(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [])

  const totalDebit = useMemo(() => rows.reduce((a, r) => a + (Number(r.debit) || 0), 0), [rows])
  const totalCredit = useMemo(() => rows.reduce((a, r) => a + (Number(r.credit) || 0), 0), [rows])
  const balanced = totalDebit === totalCredit && totalDebit > 0

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function save() {
    setError('')
    if (!description.trim()) return setError('적요를 입력하세요.')
    const lines = rows
      .filter((r) => r.accountId && (Number(r.debit) > 0 || Number(r.credit) > 0))
      .map((r) => ({
        accountId: Number(r.accountId),
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
        description: r.description || undefined,
      }))
    if (lines.length < 2) return setError('차변·대변 최소 2줄을 입력하세요.')
    if (!balanced) return setError(`차변합(${won(totalDebit)})과 대변합(${won(totalCredit)})이 일치해야 합니다.`)
    setSaving(true)
    try {
      await api.post('/journals', { entryDate, description, lines })
      navigate('/accounting/journals')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <EcListShell title="일반전표입력" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>전표일자</span>
        <input type="date" className="ec-input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={{ width: 150 }} />
        <span style={{ marginLeft: 8 }}>적요</span>
        <input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 자본금 납입" style={{ width: 300 }} />
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left" style={{ maxWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ width: 34 }}></th><th>계정과목</th>
            <th style={{ textAlign: 'right', width: 160 }}>차변</th><th style={{ textAlign: 'right', width: 160 }}>대변</th>
            <th>적요</th><th style={{ width: 44 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>
                <select className="ec-input" value={r.accountId} onChange={(e) => setRow(i, { accountId: e.target.value })} style={{ width: '100%' }}>
                  <option value="">계정 선택</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </td>
              <td><input className="ec-input" type="number" value={r.debit} onChange={(e) => setRow(i, { debit: e.target.value, credit: '' })} style={{ width: '100%', textAlign: 'right' }} /></td>
              <td><input className="ec-input" type="number" value={r.credit} onChange={(e) => setRow(i, { credit: e.target.value, debit: '' })} style={{ width: '100%', textAlign: 'right' }} /></td>
              <td><input className="ec-input" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} style={{ width: '100%' }} /></td>
              <td style={{ textAlign: 'center' }}>
                {rows.length > 2 && <button className="ec-btn" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} title="행 삭제">×</button>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
            <td style={{ textAlign: 'right', color: '#1a4d8f' }}>{won(totalDebit)}</td>
            <td style={{ textAlign: 'right', color: '#a5561b' }}>{won(totalCredit)}</td>
            <td colSpan={2} style={{ color: balanced ? '#1c7c3c' : '#c60a2e', fontSize: 12 }}>
              {totalDebit === 0 ? '' : balanced ? '대차평형 ✓' : `차액 ${won(Math.abs(totalDebit - totalCredit))}`}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button className="ec-btn" onClick={() => setRows((rs) => [...rs, emptyRow()])}>+ 행 추가</button>
        <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving || !balanced}>{saving ? '저장 중…' : '저장(F8)'}</button>
        <button className="ec-btn" onClick={() => navigate('/accounting/journals')}>전표조회로</button>
      </div>
    </EcListShell>
  )
}
