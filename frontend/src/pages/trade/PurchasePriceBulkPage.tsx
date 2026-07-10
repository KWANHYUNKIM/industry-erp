import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'

/** 구매 > 구매단가일괄변경 — 품목 표준단가(구매) 일괄 조정 (/api/price-bulk 연동) */
interface PriceBulkItem {
  id: number
  code: string
  name: string
  spec: string | null
  unit: string
  unitPrice: number
  avgSalePrice: number | null
  avgPurchasePrice: number | null
}

export default function PurchasePriceBulkPage() {
  const [rows, setRows] = useState<PriceBulkItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [mode, setMode] = useState<'rate' | 'amount'>('rate')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
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

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword))
  const num = Number(value)

  function previewPrice(current: number, checked: boolean): number {
    if (!checked || !value || Number.isNaN(num)) return current
    const next = mode === 'rate' ? current * (1 + num / 100) : current + num
    return Math.max(0, Math.round(next * 100) / 100)
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === shown.length ? new Set() : new Set(shown.map((r) => r.id))))
  }

  const selectedCount = useMemo(() => shown.filter((r) => selected.has(r.id)).length, [shown, selected])

  async function apply() {
    setMessage('')
    setError('')
    if (selected.size === 0) { setError('변경할 품목을 선택하세요.'); return }
    if (!value || Number.isNaN(num) || num === 0) { setError(mode === 'rate' ? '증감율(%)을 입력하세요.' : '증감액을 입력하세요.'); return }
    setApplying(true)
    try {
      const res = await api.post<{ updatedCount: number }>('/price-bulk/apply', {
        itemIds: [...selected],
        field: 'purchase',
        mode,
        value: num,
      })
      setMessage(`${res.data.updatedCount}개 품목의 매입단가가 변경되었습니다.`)
      setValue('')
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <EcListShell
      title="구매단가일괄변경"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: applying ? '적용 중…' : '일괄적용', onClick: apply, primary: true },
        { label: '새로고침', onClick: load },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {message && <p style={{ background: '#e9f6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{message}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5a626e' }}>변경방식</span>
        <select className="ec-input" style={{ width: 110 }} value={mode} onChange={(e) => setMode(e.target.value as 'rate' | 'amount')}>
          <option value="rate">증감율(%)</option>
          <option value="amount">증감액</option>
        </select>
        <input
          type="number"
          className="ec-input"
          style={{ width: 110, textAlign: 'right' }}
          placeholder={mode === 'rate' ? '예: 10, -5' : '예: 1000, -500'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span style={{ fontSize: 12.5, color: '#8a929c' }}>선택 {selectedCount}건 · 표준단가 기준 적용</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: 'center' }}>
              <input type="checkbox" checked={shown.length > 0 && selectedCount === shown.length} onChange={toggleAll} />
            </th>
            <th>품목코드</th><th>품목명</th>
            <th style={{ textAlign: 'right' }}>구매평균단가</th>
            <th style={{ textAlign: 'right' }}>현재매입가</th><th style={{ textAlign: 'right' }}>변경매입가</th>
            <th style={{ textAlign: 'right' }}>증감</th><th style={{ textAlign: 'right' }}>증감율(%)</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>품목이 없습니다.</td></tr>
          ) : shown.map((r) => {
            const checked = selected.has(r.id)
            const newPrice = previewPrice(r.unitPrice, checked)
            const diff = newPrice - r.unitPrice
            const rate = r.unitPrice ? Math.round(diff / r.unitPrice * 100) : 0
            return (
              <tr key={r.id}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} />
                </td>
                <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
                <td>{r.name}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.avgPurchasePrice != null ? r.avgPurchasePrice.toLocaleString() : '-'}</td>
                <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: checked ? 600 : 400 }}>{newPrice.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: diff > 0 ? '#c60a2e' : diff < 0 ? '#1c7c3c' : '#9aa1ab' }}>{diff.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{rate.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}
