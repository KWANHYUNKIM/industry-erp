import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { BusinessCard, Partner, User } from '../../api/types'

/** 그룹웨어 > 고객관리 > 명함관리 — 거래처 담당자 연락처를 회사 자산으로 남긴다 */
export default function BusinessCardPage() {
  const [cards, setCards] = useState<BusinessCard[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [keyword, setKeyword] = useState('')
  const [tag, setTag] = useState('')
  const [editing, setEditing] = useState<BusinessCard | 'new' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  async function load() {
    setError('')
    try {
      const [c, p, u] = await Promise.all([
        api.get<BusinessCard[]>('/business-cards'),
        api.get<Partner[]>('/partners'),
        api.get<User[]>('/users').catch(() => ({ data: [] as User[] })),
      ])
      setCards(c.data)
      setPartners(p.data)
      setUsers(u.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  const allTags = useMemo(
    () => [...new Set(cards.flatMap((c) => c.tags))].sort(),
    [cards],
  )

  const shown = cards.filter((c) => {
    if (tag && !c.tags.includes(tag)) return false
    if (!keyword) return true
    const k = keyword.toLowerCase()
    return [c.name, c.companyName, c.department, c.jobTitle, c.email, c.mobile, c.phone, c.memo]
      .some((v) => v?.toLowerCase().includes(k))
  })

  async function remove(c: BusinessCard) {
    if (!window.confirm(`${c.name} (${c.companyName ?? ''}) 명함을 삭제할까요?`)) return
    try {
      await api.delete(`/business-cards/${c.id}`)
      flash('명함을 삭제했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell
      title="명함관리"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setEditing('new')}>+ 명함 등록(F2)</button>
        <span style={{ fontSize: 12, color: '#9aa1ab', marginRight: 6 }}>
          이름·회사·연락처·메모로 검색됩니다. 거래처를 연결하면 상호가 자동으로 따라옵니다.
        </span>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#5a626e' }}>태그</span>
            <button className="ec-btn" style={{ height: 20, padding: '0 8px', fontWeight: tag === '' ? 700 : 400 }} onClick={() => setTag('')}>전체</button>
            {allTags.map((t) => (
              <button
                key={t}
                className="ec-btn"
                style={{ height: 20, padding: '0 8px', color: tag === t ? 'var(--ec-blue)' : undefined, fontWeight: tag === t ? 700 : 400 }}
                onClick={() => setTag(tag === t ? '' : t)}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>이름</th>
            <th>회사</th>
            <th>부서 / 직위</th>
            <th>휴대폰</th>
            <th>전화</th>
            <th>이메일</th>
            <th>태그</th>
            <th>보유자</th>
            <th style={{ textAlign: 'center', width: 90 }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              {cards.length === 0 ? '등록된 명함이 없습니다.' : '검색 결과가 없습니다.'}
            </td></tr>
          ) : shown.map((c, i) => (
            <tr key={c.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontWeight: 700 }}>{c.name}</td>
              <td>
                {c.companyName ?? '-'}
                {c.partnerId && <span style={{ marginLeft: 4, fontSize: 10.5, color: '#1c7c3c' }}>거래처</span>}
              </td>
              <td style={{ color: '#5a626e' }}>
                {[c.department, c.jobTitle].filter(Boolean).join(' / ') || '-'}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{c.mobile ?? '-'}</td>
              <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>{c.phone ?? '-'}</td>
              <td>{c.email ? <a href={`mailto:${c.email}`} style={{ color: 'var(--ec-blue)' }}>{c.email}</a> : '-'}</td>
              <td>
                {c.tags.map((t) => (
                  <span key={t} style={{ marginRight: 3, fontSize: 11, padding: '1px 5px', background: '#eef5ff', border: '1px solid #cfe0f5', borderRadius: 8, color: '#2b5b91' }}>#{t}</span>
                ))}
              </td>
              <td style={{ color: '#8a929c' }}>{c.ownerName ?? '-'}</td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', gap: 3 }}>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditing(c)}>수정</button>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => remove(c)}>삭제</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <CardForm
          card={editing === 'new' ? null : editing}
          partners={partners}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); flash(msg); load() }}
        />
      )}
    </EcListShell>
  )
}

function CardForm({ card, partners, users, onClose, onSaved }: {
  card: BusinessCard | null
  partners: Partner[]
  users: User[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [name, setName] = useState(card?.name ?? '')
  const [partnerId, setPartnerId] = useState(card?.partnerId != null ? String(card.partnerId) : '')
  const [companyName, setCompanyName] = useState(card?.partnerId == null ? (card?.companyName ?? '') : '')
  const [department, setDepartment] = useState(card?.department ?? '')
  const [jobTitle, setJobTitle] = useState(card?.jobTitle ?? '')
  const [phone, setPhone] = useState(card?.phone ?? '')
  const [mobile, setMobile] = useState(card?.mobile ?? '')
  const [email, setEmail] = useState(card?.email ?? '')
  const [address, setAddress] = useState(card?.address ?? '')
  const [ownerUserId, setOwnerUserId] = useState(card?.ownerUserId != null ? String(card.ownerUserId) : '')
  const [tags, setTags] = useState(card?.tags.join(', ') ?? '')
  const [memo, setMemo] = useState(card?.memo ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!name.trim()) return setError('이름을 입력하세요.')
    if (!partnerId && !companyName.trim()) return setError('거래처를 선택하거나 회사명을 입력하세요.')
    setSaving(true)
    const body = {
      name: name.trim(),
      partnerId: partnerId ? Number(partnerId) : null,
      companyName: partnerId ? null : companyName.trim() || null,
      department: department.trim() || null,
      jobTitle: jobTitle.trim() || null,
      phone: phone.trim() || null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      ownerUserId: ownerUserId ? Number(ownerUserId) : null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      memo: memo.trim() || null,
    }
    try {
      if (card) {
        await api.put(`/business-cards/${card.id}`, body)
        onSaved('명함을 수정했습니다.')
      } else {
        await api.post('/business-cards', body)
        onSaved('명함을 등록했습니다.')
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 600, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>{card ? '명함 수정' : '명함 등록'}</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>이름<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ width: 70, background: '#f5f7fa' }}>보유자</th>
                <td>
                  <select className="ec-input" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} style={{ width: 150 }}>
                    <option value="">(미지정)</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>거래처</th>
                <td colSpan={3}>
                  <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 240 }}>
                    <option value="">(등록된 거래처 아님 — 회사명 직접 입력)</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
              </tr>
              {!partnerId && (
                <tr>
                  <th style={{ background: '#f5f7fa' }}>회사명<span style={{ color: '#c60a2e' }}>*</span></th>
                  <td colSpan={3}>
                    <input className="ec-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="아직 거래 전인 잠재 고객 등" style={{ width: 240 }} />
                  </td>
                </tr>
              )}
              <tr>
                <th style={{ background: '#f5f7fa' }}>부서</th>
                <td><input className="ec-input" value={department} onChange={(e) => setDepartment(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ background: '#f5f7fa' }}>직위</th>
                <td><input className="ec-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>휴대폰</th>
                <td><input className="ec-input" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="010-0000-0000" style={{ width: 150 }} /></td>
                <th style={{ background: '#f5f7fa' }}>전화</th>
                <td><input className="ec-input" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>이메일</th>
                <td colSpan={3}><input className="ec-input" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: 240 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>주소</th>
                <td colSpan={3}><input className="ec-input" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>태그</th>
                <td colSpan={3}>
                  <input className="ec-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="쉼표로 구분 (예: 핵심, 구매팀)" style={{ width: '100%' }} />
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>메모</th>
                <td colSpan={3}>
                  <textarea className="ec-input" value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} style={{ width: '100%', resize: 'vertical' }} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
