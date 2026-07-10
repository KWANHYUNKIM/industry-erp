import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'

/** 판매/구매 > 회계반영 — 미반영 전표 목록 + 일괄 회계반영 (백엔드 /accounting-reflection 연동) */
type Kind = 'sales' | 'purchase'

interface Slip {
  id: number
  kind: 'SALES' | 'PURCHASE'
  docNo: string
  slipDate: string
  partnerId: number
  partnerName: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  reflected: boolean
}

export default function AccountingReflectionPage() {
  const [slips, setSlips] = useState<Slip[]>([])
  const [kind, setKind] = useState<Kind>('sales')
  const [onlyUnreflected, setOnlyUnreflected] = useState(true)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function load(k: Kind) {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Slip[]>(`/accounting-reflection?kind=${k.toUpperCase()}`)
      setSlips(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
      setSlips([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(kind)
    setChecked(new Set())
    setOk('')
  }, [kind])

  const shown = slips.filter((s) => !onlyUnreflected || !s.reflected)
  const unreflectedCount = slips.filter((s) => !s.reflected).length
  const selectedTotal = useMemo(
    () => slips.filter((s) => checked.has(s.id)).reduce((sum, s) => sum + s.totalAmount, 0),
    [slips, checked],
  )

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function reflectSelected() {
    if (checked.size === 0) return setError('반영할 전표를 선택하세요.')
    setError('')
    setOk('')
    try {
      const res = await api.post<{ reflectedCount: number }>('/accounting-reflection/reflect', {
        kind: kind.toUpperCase(),
        ids: [...checked],
      })
      setOk(`${res.data.reflectedCount}건 회계반영 완료`)
      setChecked(new Set())
      load(kind)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const kindBtn = (k: Kind, label: string) => (
    <button className={`ec-btn${kind === k ? ' ec-btn-primary' : ''}`} onClick={() => setKind(k)} style={{ minWidth: 84 }}>
      {label}
    </button>
  )

  return (
    <EcListShell
      title="회계반영 / 미반영현황"
      onNew={reflectSelected}
      newLabel={`선택 일괄반영(${checked.size})`}
      actions={[{ label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {kindBtn('sales', '판매')}
        {kindBtn('purchase', '구매')}
        <label style={{ marginLeft: 8, fontSize: 12.5, color: '#5a626e', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={onlyUnreflected} onChange={(e) => setOnlyUnreflected(e.target.checked)} />
          미반영만 보기
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          미반영 <b style={{ color: '#c60a2e', fontSize: 14 }}>{unreflectedCount}</b>건
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          선택합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{selectedTotal.toLocaleString()}</b>원
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>전표일 ▼</th>
            <th style={{ width: 150 }}>전표번호 ▼</th>
            <th>거래처 ▼</th>
            <th style={{ width: 120, textAlign: 'right' }}>공급가액</th>
            <th style={{ width: 110, textAlign: 'right' }}>부가세</th>
            <th style={{ width: 90, textAlign: 'center' }}>회계반영 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>대상 전표가 없습니다.</td></tr>
          ) : shown.map((s, i) => (
            <tr key={s.id}>
              <td style={{ textAlign: 'center' }}>
                {s.reflected ? <span style={{ color: '#9aa1ab' }}>{i + 1}</span> : <input type="checkbox" checked={checked.has(s.id)} onChange={() => toggle(s.id)} />}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{s.slipDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{s.docNo}</td>
              <td>{s.partnerName}</td>
              <td style={{ textAlign: 'right' }}>{s.supplyAmount.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{s.vatAmount.toLocaleString()}</td>
              <td style={{ textAlign: 'center', color: s.reflected ? '#1c7c3c' : '#c60a2e', fontWeight: 700 }}>{s.reflected ? '반영' : '미반영'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
