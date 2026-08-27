import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'

const SALES_GROUPS = ['일반가', '대리점가', '특판가']
const PURCHASE_GROUPS = ['표준매입가', '계약단가']

/** 재고 기초등록 > 거래처특별단가그룹 — 거래처별 영업/구매 단가그룹 지정(실제 저장) */
export default function SpecialPriceGroupPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [groups, setGroups] = useState<Record<number, { sales: string; purchase: string }>>({})
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<Partner[]>('/partners')
      setPartners(r.data)
      const init: Record<number, { sales: string; purchase: string }> = {}
      r.data.forEach((p) => { init[p.id] = { sales: p.salesPriceGroup ?? '', purchase: p.purchasePriceGroup ?? '' } })
      setGroups(init)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function setGroup(id: number, field: 'sales' | 'purchase', v: string) {
    setGroups((g) => ({ ...g, [id]: { ...(g[id] ?? { sales: '', purchase: '' }), [field]: v } }))
  }

  async function save() {
    setError('')
    setSaving(true)
    try {
      // 변경된 거래처만 PATCH
      const changed = partners.filter((p) => {
        const g = groups[p.id] ?? { sales: '', purchase: '' }
        return g.sales !== (p.salesPriceGroup ?? '') || g.purchase !== (p.purchasePriceGroup ?? '')
      })
      await Promise.all(changed.map((p) => api.patch(`/partners/${p.id}/price-group`, {
        salesPriceGroup: groups[p.id]?.sales || null,
        purchasePriceGroup: groups[p.id]?.purchase || null,
      })))
      alert(changed.length ? `${changed.length}개 거래처 단가그룹을 저장했습니다.` : '변경된 내용이 없습니다.')
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const shown = partners.filter((p) => !keyword || p.code.includes(keyword) || p.name.includes(keyword))

  return (
    <EcListShell
      title="거래처특별단가그룹"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={undefined}
      actions={[
        { label: saving ? '저장 중…' : '저장(F8)', primary: true, onClick: save },
        { label: '새로고침', onClick: load },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>거래처코드 ▼</th>
            <th>거래처명 ▼</th>
            <th style={{ textAlign: 'right', width: 200 }}>영업단가그룹명</th>
            <th style={{ textAlign: 'center', width: 200 }}>구매단가그룹명</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((p, i) => (
            <tr key={p.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              {/*
                원본은 코드·이름을 눌러 그 거래처를 연다(사본 실측). 이 화면은 단가그룹만
                고치는 자리라 거래처등록으로 보낸다 — 이름으로 찾아 들어가면 된다.
              */}
              <td style={{ fontFamily: 'monospace' }}>
                <Link to={`/sales/partners?q=${encodeURIComponent(p.code)}`} style={{ color: 'var(--ec-blue)' }}>{p.code}</Link>
              </td>
              <td>
                <Link to={`/sales/partners?q=${encodeURIComponent(p.name)}`} style={{ color: 'var(--ec-blue)' }}>{p.name}</Link>
              </td>
              <td style={{ textAlign: 'right' }}>
                <select className="ec-input" value={groups[p.id]?.sales ?? ''} onChange={(e) => setGroup(p.id, 'sales', e.target.value)} style={{ width: '100%' }}>
                  <option value="">(미지정)</option>
                  {SALES_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </td>
              <td style={{ textAlign: 'center' }}>
                <select className="ec-input" value={groups[p.id]?.purchase ?? ''} onChange={(e) => setGroup(p.id, 'purchase', e.target.value)} style={{ width: '100%' }}>
                  <option value="">(미지정)</option>
                  {PURCHASE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
