import { useEffect, useMemo, useState, useRef} from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { BusinessCard, Partner, User } from '../../types/api'

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


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '명함관리', [])

  return (
    <EcListShell
      title="명함관리"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div className="flex items-center gap-[6px] mb-[8px] flex-wrap">
        <button className="ec-btn ec-btn-primary" onClick={() => setEditing('new')}>+ 명함 등록(F2)</button>
        <span className="text-[12px] text-ec-hint mr-[6px]">
          이름·회사·연락처·메모로 검색됩니다. 거래처를 연결하면 상호가 자동으로 따라옵니다.
        </span>
        {allTags.length > 0 && (
          <div className="flex gap-[4px] items-center">
            <span className="text-[12px] text-ec-label">태그</span>
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

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th>이름</th>
            <th>회사</th>
            <th>부서 / 직위</th>
            <th>휴대폰</th>
            <th>전화</th>
            <th>이메일</th>
            <th>태그</th>
            <th>보유자</th>
            <th className="text-center w-[90px]">처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} className="text-center text-ec-hint p-[20px]">
              {cards.length === 0 ? '등록된 명함이 없습니다.' : '검색 결과가 없습니다.'}
            </td></tr>
          ) : shown.map((c, i) => (
            <tr key={c.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="font-bold">{c.name}</td>
              <td>
                {c.companyName ?? '-'}
                {c.partnerId && <span className="ml-[4px] text-[10.5px] text-ec-success">거래처</span>}
              </td>
              <td className="text-ec-label">
                {[c.department, c.jobTitle].filter(Boolean).join(' / ') || '-'}
              </td>
              <td>{c.mobile ?? ''}</td>
              <td className="text-ec-hint">{c.phone ?? ''}</td>
              <td>{c.email ? <a href={`mailto:${c.email}`} style={{ color: 'var(--ec-blue)' }}>{c.email}</a> : ''}</td>
              <td>
                {c.tags.map((t) => (
                  <span key={t} className="mr-[3px] text-[11px] py-[1px] px-[5px] bg-ec-blue-wash border border-ec-info-line border-solid rounded-[8px] text-ec-navy">#{t}</span>
                ))}
              </td>
              <td className="text-ec-hint">{c.ownerName ?? ''}</td>
              <td className="text-center">
                <div className="inline-flex gap-[3px]">
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditing(c)}>수정</button>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => remove(c)}>삭제</button>
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
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">{card ? '명함 수정' : '명함 등록'}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">이름<span className="text-ec-danger">*</span></th>
                <td><input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 150 }} /></td>
                <th className="w-[70px] bg-ec-page">보유자</th>
                <td>
                  {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). */}
                  <CodePickerField label="보유자" hideLabel width={150} placeholder="보유자" emptyLabel="선택 안 함"
                                   value={ownerUserId} onChange={setOwnerUserId}
                                   items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name, sub: u.department }))} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">거래처</th>
                <td colSpan={3}>
                {/* 코드 마스터를 고르는 칸은 드롭다운이 아니라 <b>코드도움</b>이다 —
                    거래처가 몇백 개가 되면 이름으로도 코드로도 못 찾는다. */}
                <CodePickerField label="거래처" hideLabel width={240} emptyLabel="(등록된 거래처 아님 — 회사명 직접 입력)"
                                 value={partnerId} onChange={setPartnerId}
                                 items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
              {!partnerId && (
                <tr>
                  <th className="bg-ec-page">회사명<span className="text-ec-danger">*</span></th>
                  <td colSpan={3}>
                    <input className="ec-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="아직 거래 전인 잠재 고객 등" style={{ width: 240 }} />
                  </td>
                </tr>
              )}
              <tr>
                <th className="bg-ec-page">부서</th>
                <td><input className="ec-input" value={department} onChange={(e) => setDepartment(e.target.value)} style={{ width: 150 }} /></td>
                <th className="bg-ec-page">직위</th>
                <td><input className="ec-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">휴대폰</th>
                <td><input className="ec-input" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="010-0000-0000" style={{ width: 150 }} /></td>
                <th className="bg-ec-page">전화</th>
                <td><input className="ec-input" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">이메일</th>
                <td colSpan={3}><input className="ec-input" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: 240 }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">주소</th>
                <td colSpan={3}><input className="ec-input" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">태그</th>
                <td colSpan={3}>
                  <input className="ec-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="쉼표로 구분 (예: 핵심, 구매팀)" style={{ width: '100%' }} />
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">메모</th>
                <td colSpan={3}>
                  <textarea className="ec-input" value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} style={{ width: '100%', resize: 'vertical' }} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
