import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { PriceOrderLine } from '../../api/types'

type Cat = 'SALES' | 'PURCHASE'
const CAT_LABEL: Record<Cat, string> = { SALES: '영업관리', PURCHASE: '구매관리' }

/** 재고 기초등록 > 단가적용순서설정 — 영업/구매 단가 적용 우선순위(실제 저장) */
export default function PriceOrderPage() {
  const [cat, setCat] = useState<Cat>('SALES')
  const [lines, setLines] = useState<PriceOrderLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load(c: Cat) {
    setLoading(true)
    try {
      const r = await api.get<PriceOrderLine[]>('/price-order-settings', { params: { category: c } })
      setLines(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(cat) }, [cat])

  function setActive(idx: number, v: boolean) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, active: v } : l)))
  }

  function move(idx: number, dir: -1 | 1) {
    setLines((ls) => {
      const j = idx + dir
      if (j < 0 || j >= ls.length) return ls
      const next = [...ls]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next.map((l, i) => ({ ...l, applyOrder: i + 1 }))
    })
  }

  async function save() {
    setError('')
    setSaving(true)
    try {
      const payload = { category: cat, settings: lines.map((l, i) => ({ ...l, applyOrder: i + 1 })) }
      const r = await api.put<PriceOrderLine[]>('/price-order-settings', payload)
      setLines(r.data)
      alert(`[${CAT_LABEL[cat]}] 단가적용순서를 저장했습니다.`)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>단가적용순서설정</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="ec-btn" onClick={() => load(cat)}>새로고침</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {(['SALES', 'PURCHASE'] as const).map((t) => (
          <button key={t} onClick={() => setCat(t)} className="no-ec" style={{
            padding: '6px 16px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: cat === t ? '#fff' : 'transparent', color: cat === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: cat === t ? 700 : 400, borderBottom: cat === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{CAT_LABEL[t]}</button>
        ))}
      </div>

      <div style={{ maxWidth: 760 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 90, textAlign: 'center' }}>적용순서</th>
              <th>기능</th>
              <th style={{ width: 150, textAlign: 'center' }}>사용구분</th>
              <th style={{ width: 110, textAlign: 'center' }}>순서변경</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : lines.map((l, i) => (
              <tr key={l.functionName}>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{i + 1}</td>
                <td>{l.functionName}</td>
                <td style={{ textAlign: 'center' }}>
                  <label style={{ marginRight: 10, fontSize: 12 }}>
                    <input type="radio" name={`u${i}`} checked={l.active} onChange={() => setActive(i, true)} /> 사용
                  </label>
                  <label style={{ fontSize: 12 }}>
                    <input type="radio" name={`u${i}`} checked={!l.active} onChange={() => setActive(i, false)} /> 사용안함
                  </label>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px' }} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px', marginLeft: 3 }} disabled={i === lines.length - 1} onClick={() => move(i, 1)}>▼</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        </div>
      </div>
    </div>
  )
}
