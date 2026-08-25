import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { ymd } from '../../components/EcPeriodPicks'
import type { Partner, SalesDoc, PurchaseDoc, Project } from '../../api/types'

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

export default function ConditionSearchPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = ymd(new Date())
  const monthStart = today.slice(0, 8) + '01'
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [basis, setBasis] = useState<Basis>('INDIVIDUAL')
  const [partnerId, setPartnerId] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [projectId, setProjectId] = useState('')
  const [ran, setRan] = useState(false)

  async function loadBase() {
    setLoading(true); setError('')
    try {
      const [p, s, pu, pr] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<SalesDoc[]>('/sales'),
        api.get<PurchaseDoc[]>('/purchases'),
        api.get<Project[]>('/projects'),
      ])
      setPartners(p.data)
      setSales(s.data); setPurchases(pu.data); setProjects(pr.data)
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
    const inProject = (id: number | null) => !projectId || String(id) === projectId
    sales.forEach((s) => {
      if (ids.has(s.partnerId) && inRange(s.saleDate) && inProject(s.projectId)) agg[s.partnerId].sale += s.supplyAmount
    })
    purchases.forEach((pu) => {
      if (ids.has(pu.partnerId) && inRange(pu.purchaseDate) && inProject(pu.projectId)) agg[pu.partnerId].purchase += pu.supplyAmount
    })
    return Object.entries(agg).map(([id, v]) => ({ id: Number(id), ...v, net: v.sale - v.purchase }))
      .sort((a, b) => (b.sale + b.purchase) - (a.sale + a.purchase))
  }, [ran, targetPartners, sales, purchases, from, to, projectId])

  const totals = rows.reduce((t, r) => ({ sale: t.sale + r.sale, purchase: t.purchase + r.purchase, net: t.net + r.net }), { sale: 0, purchase: 0, net: 0 })

  function run() {
    setError('')
    if (basis !== 'SELECTED' && !partnerId) return setError('거래처를 선택하세요.')
    if (basis === 'SELECTED' && selectedIds.length === 0) return setError('합산할 거래처를 하나 이상 고르세요.')
    setRan(true)
  }

  const preset = (days: number, mode: 'range' | 'month') => {
    const t = new Date()
    if (mode === 'month') { setFrom(ymd(t).slice(0, 8) + '01'); setTo(ymd(t)); return }
    const f = new Date(); f.setDate(f.getDate() - days)
    setFrom(ymd(f)); setTo(ymd(t))
  }

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 110 }

  function reset() {
    setFrom(monthStart); setTo(today)
    setBasis('INDIVIDUAL'); setPartnerId(''); setSelectedIds([]); setProjectId('')
    setRan(false); setError('')
  }

  return (
    <EcListShell
      title="조건별검색"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => { if (!loading) run() } },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 원본은 조건을 라벨 표로 세로로 쌓는다: 기준일자 / 거래처 / 프로젝트 / 종류 */}
      <table className="w-full text-left" style={{ marginBottom: 10 }}>
        <tbody>
          <tr>
            <th style={th}>기준일자</th>
            <td colSpan={3}>
              <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
              <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
              <span style={{ marginLeft: 8 }}>
                <button className="ec-btn ec-btn-sm" onClick={() => preset(0, 'range')}>금일</button>
                <button className="ec-btn ec-btn-sm" style={{ marginLeft: 3 }} onClick={() => preset(7, 'range')}>최근7일</button>
                <button className="ec-btn ec-btn-sm" style={{ marginLeft: 3 }} onClick={() => preset(0, 'month')}>금월</button>
              </span>
            </td>
          </tr>
          <tr>
            <th style={th}>거래처</th>
            <td>
              {basis !== 'SELECTED' ? (
                <CodePickerField label="거래처" hideLabel width={210} placeholder="선택하세요"
                                 value={partnerId} onChange={(v) => { setPartnerId(v); setRan(false) }}
                                 items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.partnerGroupName }))} />
              ) : (
                <CodePickerField label="거래처(다중)" hideLabel multiple width={230} placeholder="거래처를 고르세요"
                                 values={selectedIds.map(String)}
                                 onChangeMulti={(vals) => { setSelectedIds(vals.map(Number)); setRan(false) }}
                                 items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.partnerGroupName }))} />
              )}
            </td>
            <th style={th}>프로젝트</th>
            <td>
              <CodePickerField label="프로젝트" hideLabel width={210}
                               value={projectId} onChange={(v) => { setProjectId(v); setRan(false) }}
                               items={projects.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
            </td>
          </tr>
          <tr>
            <th style={th}>종류</th>
            <td colSpan={3}>
              {/* 원본 라벨 그대로 — 거래처관계기준 */}
              <select className={inputCls} value={basis}
                      onChange={(e) => { setBasis(e.target.value as Basis); setRan(false) }} style={{ width: 170 }}>
                <option value="INDIVIDUAL">개별거래처기준</option>
                <option value="GROUP">연결거래처합산</option>
                <option value="SELECTED">선택거래처합산</option>
              </select>
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ec-label)' }}>거래처관계기준</span>
            </td>
          </tr>
        </tbody>
      </table>

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
