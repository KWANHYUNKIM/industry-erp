import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, SalesDoc, PurchaseDoc } from '../../api/types'

/**
 * 그룹웨어 > 공유정보 > 조건별검색 (이카운트 E070203)
 * 기준일자·거래처 조건으로 매출·매입을 집계하되, 거래처관계기준을 셋 중에 고른다:
 *  - 개별거래처기준: 선택한 거래처 하나
 *  - 연결거래처합산: 선택 거래처가 속한 거래처그룹 전체 합산
 *  - 선택거래처합산: 직접 고른 여러 거래처 합산
 * 프론트 전용(/sales·/purchases·/partners 집계). 기존 거래이력(TradeHistoryPage)과 달리 관계 합산이 핵심.
 */
type Basis = 'INDIVIDUAL' | 'GROUP' | 'SELECTED'
const BASIS_LABEL: Record<Basis, string> = {
  INDIVIDUAL: '개별거래처기준', GROUP: '연결거래처합산', SELECTED: '선택거래처합산',
}
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const iso = (d: Date) => d.toISOString().slice(0, 10)

export default function ConditionSearchPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = iso(new Date())
  const monthStart = today.slice(0, 8) + '01'
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [basis, setBasis] = useState<Basis>('INDIVIDUAL')
  const [partnerId, setPartnerId] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [ran, setRan] = useState(false)

  async function loadBase() {
    setLoading(true); setError('')
    try {
      const [p, s, pu] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
      ])
      setPartners(p.data)
      setSales(s.data); setPurchases(pu.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadBase() }, [])

  // 대상 거래처 집합(관계기준별)
  const targetPartners = useMemo<Partner[]>(() => {
    if (basis === 'SELECTED') return partners.filter((p) => selectedIds.includes(p.id))
    const sel = partners.find((p) => String(p.id) === partnerId)
    if (!sel) return []
    if (basis === 'INDIVIDUAL') return [sel]
    // GROUP: 같은 거래처그룹 전체(그룹 없으면 자기 자신)
    if (sel.partnerGroupId == null) return [sel]
    return partners.filter((p) => p.partnerGroupId === sel.partnerGroupId)
  }, [basis, partners, partnerId, selectedIds])

  const rows = useMemo(() => {
    if (!ran) return []
    const ids = new Set(targetPartners.map((p) => p.id))
    const inRange = (d: string) => d >= from && d <= to
    const agg: Record<number, { name: string; sale: number; purchase: number }> = {}
    targetPartners.forEach((p) => { agg[p.id] = { name: p.name, sale: 0, purchase: 0 } })
    sales.forEach((s) => { if (ids.has(s.partnerId) && inRange(s.saleDate)) agg[s.partnerId].sale += s.supplyAmount })
    purchases.forEach((pu) => { if (ids.has(pu.partnerId) && inRange(pu.purchaseDate)) agg[pu.partnerId].purchase += pu.supplyAmount })
    return Object.entries(agg).map(([id, v]) => ({ id: Number(id), ...v, net: v.sale - v.purchase }))
      .sort((a, b) => (b.sale + b.purchase) - (a.sale + a.purchase))
  }, [ran, targetPartners, sales, purchases, from, to])

  const totals = rows.reduce((t, r) => ({ sale: t.sale + r.sale, purchase: t.purchase + r.purchase, net: t.net + r.net }), { sale: 0, purchase: 0, net: 0 })

  function run() {
    setError('')
    if (basis !== 'SELECTED' && !partnerId) return setError('거래처를 선택하세요.')
    if (basis === 'SELECTED' && selectedIds.length === 0) return setError('합산할 거래처를 하나 이상 고르세요.')
    setRan(true)
  }

  const preset = (days: number, mode: 'range' | 'month') => {
    const t = new Date()
    if (mode === 'month') { setFrom(iso(t).slice(0, 8) + '01'); setTo(iso(t)); return }
    const f = new Date(); f.setDate(f.getDate() - days)
    setFrom(iso(f)); setTo(iso(t))
  }

  const inputCls = 'ec-input'

  return (
    <EcListShell title="조건별검색" actions={[{ label: '새로고침', onClick: loadBase }, { label: 'Excel' }, { label: '인쇄' }]}>
      <p className="mb-2 text-xs text-slate-500">거래처 관계기준(개별/연결그룹합산/선택합산)으로 기간 매출·매입을 집계합니다. 연결거래처합산은 거래처그룹 전체를 묶습니다.</p>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>기준일자</div>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        </label>
        <div style={{ display: 'flex', gap: 3 }}>
          <button className="ec-btn" onClick={() => preset(0, 'range')}>금일</button>
          <button className="ec-btn" onClick={() => preset(7, 'range')}>최근7일</button>
          <button className="ec-btn" onClick={() => preset(0, 'month')}>금월</button>
        </div>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>거래처관계기준</div>
          <select className={inputCls} value={basis} onChange={(e) => { setBasis(e.target.value as Basis); setRan(false) }} style={{ width: 150 }}>
            <option value="INDIVIDUAL">개별거래처기준</option>
            <option value="GROUP">연결거래처합산</option>
            <option value="SELECTED">선택거래처합산</option>
          </select></label>
        {basis !== 'SELECTED' ? (
          <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>거래처</div>
            <select className={inputCls} value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setRan(false) }} style={{ width: 200 }}>
              <option value="">선택하세요</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.partnerGroupName ? ` [${p.partnerGroupName}]` : ''}</option>)}
            </select></label>
        ) : (
          <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>거래처(다중 · Ctrl)</div>
            <select multiple className={inputCls} value={selectedIds.map(String)} onChange={(e) => { setSelectedIds(Array.from(e.target.selectedOptions).map((o) => Number(o.value))); setRan(false) }} style={{ width: 220, height: 90 }}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
        )}
        <button className="ec-btn ec-btn-primary" onClick={run} disabled={loading}>검색(F8)</button>
      </div>

      {ran && basis === 'GROUP' && (
        <p style={{ fontSize: 12, color: '#5a626e', marginBottom: 6 }}>
          연결거래처합산 대상: <b>{targetPartners.length}</b>개 거래처
          {targetPartners.length > 0 && ` (${targetPartners.map((p) => p.name).join(', ')})`}
        </p>
      )}

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th>거래처</th>
          <th style={{ textAlign: 'right' }}>매출(공급가)</th>
          <th style={{ textAlign: 'right' }}>매입(공급가)</th>
          <th style={{ textAlign: 'right' }}>순액</th>
        </tr></thead>
        <tbody>
          {!ran ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조건을 정하고 검색하세요.</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>대상 거래처가 없거나 기간 내 거래가 없습니다.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.name}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(r.sale)}</td>
              <td style={{ textAlign: 'right', color: '#c07a00' }}>{won(r.purchase)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.net >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(r.net)}</td>
            </tr>
          ))}
        </tbody>
        {ran && rows.length > 0 && (
          <tfoot><tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={2} style={{ textAlign: 'right' }}>합계 ({BASIS_LABEL[basis]})</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.sale)}</td>
            <td style={{ textAlign: 'right', color: '#c07a00' }}>{won(totals.purchase)}</td>
            <td style={{ textAlign: 'right', color: totals.net >= 0 ? '#1c7c3c' : '#c60a2e' }}>{won(totals.net)}</td>
          </tr></tfoot>
        )}
      </table>
    </EcListShell>
  )
}
