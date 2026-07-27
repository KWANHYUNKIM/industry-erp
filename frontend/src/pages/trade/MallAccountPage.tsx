import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { MallAccount, MallAccountType, Partner } from '../../api/types'

/**
 * 재고 I > 쇼핑몰관리 > 쇼핑몰등록 (이카운트 C000664)
 * 우리가 판매하는 쇼핑몰/통합관리솔루션 계정 마스터. 주문 수집·품목코드연결의 '쇼핑몰' 선택지가 되고,
 * 판매전환 시 기본 거래처를 제공한다. (외부 오픈API 인증·자동수집 연동은 별개 트랙.)
 * 백엔드 신규: mall_accounts + /api/mall-accounts.
 */
const TYPE_LABEL: Record<MallAccountType, string> = { MALL: '쇼핑몰', SOLUTION: '통합관리솔루션' }
const empty = { name: '', type: 'MALL' as MallAccountType, partnerId: '', sellerId: '', memo: '' }

export default function MallAccountPage() {
  const [rows, setRows] = useState<MallAccount[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(empty)

  async function load() {
    setLoading(true); setError('')
    try {
      const [a, p] = await Promise.all([
        api.get<MallAccount[]>('/mall-accounts'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(a.data); setPartners(p.data.filter((x) => x.type !== 'SUPPLIER'))
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function openNew() { setEditId(null); setForm(empty); setShowForm(true) }
  function openEdit(a: MallAccount) {
    setEditId(a.id)
    setForm({ name: a.name, type: a.type, partnerId: a.partnerId ? String(a.partnerId) : '', sellerId: a.sellerId ?? '', memo: a.memo ?? '' })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (!form.name.trim()) return setError('쇼핑몰명을 입력하세요.')
    const body = {
      name: form.name, type: form.type,
      partnerId: form.partnerId ? Number(form.partnerId) : undefined,
      sellerId: form.sellerId || undefined, memo: form.memo || undefined,
    }
    try {
      if (editId) { await api.put(`/mall-accounts/${editId}`, body); setOk('쇼핑몰을 수정했습니다.') }
      else { await api.post('/mall-accounts', body); setOk('쇼핑몰을 등록했습니다.') }
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleActive(a: MallAccount) {
    setError('')
    try { await api.put(`/mall-accounts/${a.id}`, { name: a.name, type: a.type, partnerId: a.partnerId ?? undefined, sellerId: a.sellerId ?? undefined, memo: a.memo ?? undefined, active: !a.active }); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!confirm('이 쇼핑몰을 삭제할까요?')) return
    setError('')
    try { await api.delete(`/mall-accounts/${id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const inputCls = 'ec-input'

  return (
    <EcListShell
      title="쇼핑몰등록"
      onNew={openNew}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p className="mb-2 text-xs text-slate-500">우리가 판매하는 쇼핑몰/통합관리솔루션 계정. 주문 수집·품목코드연결의 쇼핑몰 선택지가 되고, 판매전환 시 기본 거래처를 제공합니다. (오픈API 자동수집 연동은 별개.)</p>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <Modal open={showForm} title={editId ? '쇼핑몰 수정' : '쇼핑몰 등록'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>쇼핑몰명 *</div>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 180 }} placeholder="예: 스마트스토어" /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>구분 *</div>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)} style={{ width: 150 }}>
                <option value="MALL">쇼핑몰</option><option value="SOLUTION">통합관리솔루션</option>
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>판매전환 거래처</div>
              <select className={inputCls} value={form.partnerId} onChange={(e) => set('partnerId', e.target.value)} style={{ width: 200 }}>
                <option value="">(미지정)</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>판매자 ID</div>
              <input className={inputCls} value={form.sellerId} onChange={(e) => set('sellerId', e.target.value)} style={{ width: 150 }} /></label>
            <label style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>비고</div>
              <input className={inputCls} value={form.memo} onChange={(e) => set('memo', e.target.value)} style={{ width: '100%' }} /></label>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '저장'}</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 90 }}>코드</th>
          <th>쇼핑몰명</th>
          <th style={{ width: 130 }}>구분</th>
          <th>판매전환 거래처</th>
          <th style={{ width: 120 }}>판매자 ID</th>
          <th style={{ textAlign: 'center', width: 80 }}>사용</th>
          <th style={{ textAlign: 'center', width: 90 }}>관리</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 쇼핑몰이 없습니다. 우측 상단에서 등록하세요.</td></tr>
          ) : rows.map((a, i) => (
            <tr key={a.id} style={{ opacity: a.active ? 1 : 0.5 }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{a.code}</td>
              <td>{a.name}</td>
              <td>{TYPE_LABEL[a.type]}</td>
              <td style={{ color: a.partnerName ? undefined : '#c07a00' }}>{a.partnerName ?? '미지정'}</td>
              <td style={{ color: '#6b7280' }}>{a.sellerId ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => toggleActive(a)} style={{ border: '1px solid var(--ec-border)', background: a.active ? '#eaf6ec' : '#f2f3f5', color: a.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>{a.active ? '사용' : '중단'}</button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => openEdit(a)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>수정</button>
                <button className="no-ec" onClick={() => remove(a.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
