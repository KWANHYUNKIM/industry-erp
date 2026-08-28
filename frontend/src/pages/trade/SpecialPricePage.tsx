import { useEffect, useMemo, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner, SpecialPrice, SpecialPriceResolve, SpecialPriceType } from '../../api/types'

/**
 * 회계/재고 기초등록 > 특별단가등록 (이카운트 E040124)
 * 표준단가(Item.unitPrice)를 덮어쓰는 예외 단가 마스터. 적용범위는 거래처별 또는 특별단가그룹별 중 하나.
 * 백엔드 신규: special_prices 테이블 + /api/special-prices (+ /resolve 유효단가 해석).
 * 그룹은 거래처특별단가그룹(E040120)에서 각 거래처에 지정한 salesPriceGroup/purchasePriceGroup 과 짝을 이룬다.
 */

// 거래처특별단가그룹 페이지와 동일한 그룹 목록(단가그룹 마스터)
const SALES_GROUPS = ['일반가', '대리점가', '특판가']
const PURCHASE_GROUPS = ['표준매입가', '계약단가']

const won = (n: number) => n.toLocaleString('ko-KR')
const typeLabel: Record<SpecialPriceType, string> = { SALES: '판매', PURCHASE: '구매' }

export default function SpecialPricePage() {
  const [useCond, setUseCond] = useState<'전체' | '사용' | '중단'>('전체')
  const [rows, setRows] = useState<SpecialPrice[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [tab, setTab] = useState<'ALL' | SpecialPriceType>('ALL')
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    tradeType: 'SALES' as SpecialPriceType,
    itemId: '',
    scope: 'partner' as 'partner' | 'group',
    partnerId: '',
    priceGroup: '',
    unitPrice: '',
    remark: '',
  })

  // 유효단가 조회(resolve) 테스터
  const [rv, setRv] = useState({ tradeType: 'SALES' as SpecialPriceType, itemId: '', partnerId: '' })
  const [rvResult, setRvResult] = useState<SpecialPriceResolve | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const [sp, it, pt] = await Promise.all([
        api.get<SpecialPrice[]>('/special-prices'),
        api.get<Item[]>('/items'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(sp.data); setItems(it.data); setPartners(pt.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  const groupOptions = form.tradeType === 'SALES' ? SALES_GROUPS : PURCHASE_GROUPS
  const rvGroupHint = useMemo(() => {
    const p = partners.find((p) => String(p.id) === rv.partnerId)
    if (!p) return ''
    return rv.tradeType === 'SALES' ? (p.salesPriceGroup ?? '') : (p.purchasePriceGroup ?? '')
  }, [partners, rv])

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (!form.itemId) return setError('품목을 선택하세요.')
    if (form.scope === 'partner' && !form.partnerId) return setError('거래처를 선택하세요.')
    if (form.scope === 'group' && !form.priceGroup) return setError('특별단가그룹을 선택하세요.')
    try {
      await api.post('/special-prices', {
        tradeType: form.tradeType,
        itemId: Number(form.itemId),
        partnerId: form.scope === 'partner' ? Number(form.partnerId) : undefined,
        priceGroup: form.scope === 'group' ? form.priceGroup : undefined,
        unitPrice: Number(form.unitPrice || 0),
        remark: form.remark || undefined,
      })
      setOk('특별단가가 등록되었습니다.')
      setForm({ tradeType: form.tradeType, itemId: '', scope: form.scope, partnerId: '', priceGroup: '', unitPrice: '', remark: '' })
      setShowForm(false)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleActive(r: SpecialPrice) {
    setError(''); setOk('')
    try { await api.patch(`/special-prices/${r.id}/active`, null, { params: { active: !r.active } }); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!confirm('이 특별단가를 삭제할까요?')) return
    setError(''); setOk('')
    try { await api.delete(`/special-prices/${id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function doResolve() {
    setError(''); setRvResult(null)
    if (!rv.itemId || !rv.partnerId) return setError('유효단가 조회: 품목과 거래처를 선택하세요.')
    try {
      const r = await api.get<SpecialPriceResolve>('/special-prices/resolve', {
        params: { tradeType: rv.tradeType, itemId: Number(rv.itemId), partnerId: Number(rv.partnerId) },
      })
      setRvResult(r.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const visible = rows.filter((r) => tab === 'ALL' || r.tradeType === tab)
    .filter((r) => useCond === '전체' || (r.active ? '사용' : '중단') === useCond)
  const inputCls = 'ec-input'

  return (
    <EcListShell
      title="특별단가등록"
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">표준단가를 덮어쓰는 예외 단가. 적용범위는 거래처별 또는 특별단가그룹별 중 하나. 유효단가는 거래처별을 먼저, 없으면 거래처의 단가그룹을 적용.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['ALL', 'SALES', 'PURCHASE'] as const).map((t) => (
          <button key={t} className={`ec-btn ${tab === t ? 'ec-btn-primary' : ''}`} onClick={() => setTab(t)}>
            {t === 'ALL' ? '전체' : typeLabel[t]}
          </button>
        ))}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      {/* 유효단가 조회(resolve) — 거래처별→그룹별 폴백 확인 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3c4553' }}>유효단가 조회</span>
        <select className={inputCls} value={rv.tradeType} onChange={(e) => setRv((s) => ({ ...s, tradeType: e.target.value as SpecialPriceType }))} style={{ width: 90 }}>
          <option value="SALES">판매</option><option value="PURCHASE">구매</option>
        </select>
        <select className={inputCls} value={rv.itemId} onChange={(e) => setRv((s) => ({ ...s, itemId: e.target.value }))} style={{ width: 200 }}>
          <option value="">품목 선택</option>
          {items.map((i) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
        </select>
        <select className={inputCls} value={rv.partnerId} onChange={(e) => setRv((s) => ({ ...s, partnerId: e.target.value }))} style={{ width: 200 }}>
          <option value="">거래처 선택</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {rv.partnerId && <span style={{ fontSize: 11.5, color: '#8a929c' }}>단가그룹: {rvGroupHint || '(미지정)'}</span>}
        <button className="ec-btn" onClick={doResolve}>조회</button>
        {rvResult && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: rvResult.found ? 'var(--ec-blue)' : '#8a929c' }}>
            {rvResult.found
              ? `특별단가 ${won(rvResult.unitPrice ?? 0)} (${rvResult.source === 'PARTNER' ? '거래처별' : `그룹별·${rvResult.priceGroup}`})`
              : '특별단가 없음 → 표준단가 적용'}
          </span>
        )}
      </div>

      <Modal open={showForm} title="특별단가 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>구분 *</div>
              <select className={inputCls} value={form.tradeType} onChange={(e) => { set('tradeType', e.target.value); set('priceGroup', '') }} style={{ width: 100 }}>
                <option value="SALES">판매</option><option value="PURCHASE">구매</option>
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              <select className={inputCls} value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
                <option value="">선택하세요</option>
                {items.map((i) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>적용범위 *</div>
              <select className={inputCls} value={form.scope} onChange={(e) => set('scope', e.target.value)} style={{ width: 120 }}>
                <option value="partner">거래처별</option><option value="group">그룹별</option>
              </select></label>
            {form.scope === 'partner' ? (
              <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>거래처 *</div>
                <select className={inputCls} value={form.partnerId} onChange={(e) => set('partnerId', e.target.value)} style={{ width: 220 }}>
                  <option value="">선택하세요</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></label>
            ) : (
              <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>특별단가그룹 *</div>
                <select className={inputCls} value={form.priceGroup} onChange={(e) => set('priceGroup', e.target.value)} style={{ width: 160 }}>
                  <option value="">선택하세요</option>
                  {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                </select></label>
            )}
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>특별단가 *</div>
              <input className={`${inputCls} text-right`} type="number" step="any" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>비고</div>
              <input className={inputCls} value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: '100%' }} /></label>
            <button type="submit" className="ec-btn ec-btn-primary">저장</button>
          </div>
        </form>
      )}</Modal>

      {/* 원본 조건 [사용구분]. 사용/중단이 표에는 찍히는데 거를 수가 없었다. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>사용구분</span>
        <select className="ec-input" value={useCond} onChange={(e) => setUseCond(e.target.value as '전체' | '사용' | '중단')} style={{ width: 100 }}>
          <option>전체</option><option>사용</option><option>중단</option>
        </select>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 60 }}>구분</th>
            <th>품목</th>
            <th>적용범위</th>
            <th style={{ textAlign: 'right' }}>특별단가</th>
            <th>비고</th>
            <th style={{ textAlign: 'center', width: 90 }}>사용여부</th>
            <th style={{ textAlign: 'center', width: 50 }}>삭제</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : visible.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 특별단가가 없습니다. 우측 상단에서 등록하세요.</td></tr>
          ) : visible.map((r, i) => (
            <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{typeLabel[r.tradeType]}</td>
              <td><span style={{ fontFamily: 'monospace', color: '#8a929c', marginRight: 5 }}>{r.itemCode}</span>{r.itemName}</td>
              <td>{r.partnerName ? `거래처·${r.partnerName}` : `그룹·${r.priceGroup}`}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.unitPrice)}</td>
              <td style={{ color: '#6b7280' }}>{r.remark ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => toggleActive(r)} style={{ border: '1px solid var(--ec-border)', background: r.active ? '#eaf6ec' : '#f2f3f5', color: r.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>
                  {r.active ? '사용' : '사용중단'}
                </button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => remove(r.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
