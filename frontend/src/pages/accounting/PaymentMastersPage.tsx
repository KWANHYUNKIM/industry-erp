import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { CardIssuer, PaymentAgency } from '../../api/types'

/**
 * 재고/회계 기초등록 > 카드사등록(E010109) · 결제대행사등록(E010114)
 * 카드등록의 카드사 선택지 / 온라인 PG 목록이 되는 고립 CRUD 마스터.
 * 백엔드 신규: card_issuers · payment_agencies 테이블 + /api/card-issuers · /api/payment-agencies
 * 트윈 마스터라 한 컴포넌트를 defaultTab prop 으로 두 라우트에서 재사용(PurchaseRequestStatusPage 선례).
 */
type Tab = 'card' | 'agency'

const emptyCard = { code: '', name: '', feeRate: '', remark: '' }
const emptyAgency = { code: '', name: '', ceoName: '', phone: '', email: '', remark: '' }

export default function PaymentMastersPage({ defaultTab = 'card' }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const [cards, setCards] = useState<CardIssuer[]>([])
  const [agencies, setAgencies] = useState<PaymentAgency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [cardForm, setCardForm] = useState(emptyCard)
  const [agencyForm, setAgencyForm] = useState(emptyAgency)

  useEffect(() => { setTab(defaultTab) }, [defaultTab])

  async function load() {
    setLoading(true); setError('')
    try {
      const [c, a] = await Promise.all([
        api.get<CardIssuer[]>('/card-issuers'),
        api.get<PaymentAgency[]>('/payment-agencies'),
      ])
      setCards(c.data); setAgencies(a.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditId(null); setCardForm(emptyCard); setAgencyForm(emptyAgency); setShowForm(true)
  }
  function openEditCard(c: CardIssuer) {
    setEditId(c.id); setCardForm({ code: c.code, name: c.name, feeRate: c.feeRate?.toString() ?? '', remark: c.remark ?? '' }); setShowForm(true)
  }
  function openEditAgency(a: PaymentAgency) {
    setEditId(a.id); setAgencyForm({ code: a.code, name: a.name, ceoName: a.ceoName ?? '', phone: a.phone ?? '', email: a.email ?? '', remark: a.remark ?? '' }); setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    try {
      if (tab === 'card') {
        const body = { name: cardForm.name, feeRate: cardForm.feeRate ? Number(cardForm.feeRate) : 0, remark: cardForm.remark || undefined }
        if (editId) await api.put(`/card-issuers/${editId}`, body)
        else await api.post('/card-issuers', { code: cardForm.code || undefined, ...body })
        setOk(editId ? '카드사를 수정했습니다.' : '카드사를 등록했습니다.')
      } else {
        const body = { name: agencyForm.name, ceoName: agencyForm.ceoName || undefined, phone: agencyForm.phone || undefined, email: agencyForm.email || undefined, remark: agencyForm.remark || undefined }
        if (editId) await api.put(`/payment-agencies/${editId}`, body)
        else await api.post('/payment-agencies', { code: agencyForm.code || undefined, ...body })
        setOk(editId ? '결제대행사를 수정했습니다.' : '결제대행사를 등록했습니다.')
      }
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleActive(kind: Tab, row: CardIssuer | PaymentAgency) {
    setError(''); setOk('')
    try {
      if (kind === 'card') { const c = row as CardIssuer; await api.put(`/card-issuers/${c.id}`, { name: c.name, feeRate: c.feeRate ?? 0, remark: c.remark, active: !c.active }) }
      else { const a = row as PaymentAgency; await api.put(`/payment-agencies/${a.id}`, { name: a.name, ceoName: a.ceoName, phone: a.phone, email: a.email, remark: a.remark, active: !a.active }) }
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(kind: Tab, id: number) {
    if (!confirm('삭제할까요?')) return
    setError(''); setOk('')
    try { await api.delete(`/${kind === 'card' ? 'card-issuers' : 'payment-agencies'}/${id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const inputCls = 'ec-input'
  const setCard = (k: keyof typeof cardForm, v: string) => setCardForm((f) => ({ ...f, [k]: v }))
  const setAgency = (k: keyof typeof agencyForm, v: string) => setAgencyForm((f) => ({ ...f, [k]: v }))

  return (
    <EcListShell
      title={tab === 'card' ? '카드사등록' : '결제대행사등록'}
      onNew={openNew}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className={`ec-btn ${tab === 'card' ? 'ec-btn-primary' : ''}`} onClick={() => setTab('card')}>카드사</button>
        <button className={`ec-btn ${tab === 'agency' ? 'ec-btn-primary' : ''}`} onClick={() => setTab('agency')}>결제대행사</button>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <Modal open={showForm} title={`${tab === 'card' ? '카드사' : '결제대행사'} ${editId ? '수정' : '등록'}`} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {tab === 'card' ? (
              <>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>코드</div>
                  <input className={inputCls} value={cardForm.code} disabled={!!editId} placeholder="미입력 시 자동" onChange={(e) => setCard('code', e.target.value)} style={{ width: 120 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>카드사명 *</div>
                  <input className={inputCls} value={cardForm.name} onChange={(e) => setCard('name', e.target.value)} style={{ width: 200 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>수수료율(%)</div>
                  <input className={`${inputCls} text-right`} type="number" step="any" value={cardForm.feeRate} onChange={(e) => setCard('feeRate', e.target.value)} style={{ width: 100 }} /></label>
                <label style={{ fontSize: 12.5, flex: 1, minWidth: 160 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>적요</div>
                  <input className={inputCls} value={cardForm.remark} onChange={(e) => setCard('remark', e.target.value)} style={{ width: '100%' }} /></label>
              </>
            ) : (
              <>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>코드</div>
                  <input className={inputCls} value={agencyForm.code} disabled={!!editId} placeholder="미입력 시 자동" onChange={(e) => setAgency('code', e.target.value)} style={{ width: 120 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>결제대행사명 *</div>
                  <input className={inputCls} value={agencyForm.name} onChange={(e) => setAgency('name', e.target.value)} style={{ width: 200 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>대표자명</div>
                  <input className={inputCls} value={agencyForm.ceoName} onChange={(e) => setAgency('ceoName', e.target.value)} style={{ width: 120 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>전화</div>
                  <input className={inputCls} value={agencyForm.phone} onChange={(e) => setAgency('phone', e.target.value)} style={{ width: 130 }} /></label>
                <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>Email</div>
                  <input className={inputCls} value={agencyForm.email} onChange={(e) => setAgency('email', e.target.value)} style={{ width: 180 }} /></label>
                <label style={{ fontSize: 12.5, flex: 1, minWidth: 140 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>적요</div>
                  <input className={inputCls} value={agencyForm.remark} onChange={(e) => setAgency('remark', e.target.value)} style={{ width: '100%' }} /></label>
              </>
            )}
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '저장'}</button>
          </div>
        </form>
      )}</Modal>

      {tab === 'card' ? (
        <table className="w-full text-left">
          <thead><tr>
            <th style={{ width: 34 }}></th><th style={{ width: 90 }}>코드</th><th>카드사명</th>
            <th style={{ textAlign: 'right', width: 100 }}>수수료율</th><th>적요</th>
            <th style={{ textAlign: 'center', width: 80 }}>사용</th><th style={{ textAlign: 'center', width: 90 }}>관리</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            : cards.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 카드사가 없습니다.</td></tr>
            : cards.map((c, i) => (
              <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{c.code}</td>
                <td>{c.name}</td>
                <td style={{ textAlign: 'right' }}>{c.feeRate != null ? `${c.feeRate}%` : ''}</td>
                <td style={{ color: '#6b7280' }}>{c.remark ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="no-ec" onClick={() => toggleActive('card', c)} style={{ border: '1px solid var(--ec-border)', background: c.active ? '#eaf6ec' : '#f2f3f5', color: c.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>{c.active ? '사용' : '중단'}</button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="no-ec" onClick={() => openEditCard(c)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>수정</button>
                  <button className="no-ec" onClick={() => remove('card', c.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead><tr>
            <th style={{ width: 34 }}></th><th style={{ width: 90 }}>코드</th><th>결제대행사명</th>
            <th>대표자</th><th>전화</th><th>Email</th>
            <th style={{ textAlign: 'center', width: 80 }}>사용</th><th style={{ textAlign: 'center', width: 90 }}>관리</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            : agencies.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 결제대행사가 없습니다.</td></tr>
            : agencies.map((a, i) => (
              <tr key={a.id} style={{ opacity: a.active ? 1 : 0.5 }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{a.code}</td>
                <td>{a.name}</td>
                <td>{a.ceoName ?? ''}</td>
                <td style={{ color: '#6b7280' }}>{a.phone ?? ''}</td>
                <td style={{ color: '#6b7280' }}>{a.email ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="no-ec" onClick={() => toggleActive('agency', a)} style={{ border: '1px solid var(--ec-border)', background: a.active ? '#eaf6ec' : '#f2f3f5', color: a.active ? '#1c7c3c' : '#8a929c', cursor: 'pointer', fontSize: 11.5, padding: '2px 8px', borderRadius: 3 }}>{a.active ? '사용' : '중단'}</button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="no-ec" onClick={() => openEditAgency(a)} style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>수정</button>
                  <button className="no-ec" onClick={() => remove('agency', a.id)} style={{ border: 'none', background: 'none', color: '#c60a2e', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}
