import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type { ApprovalFormType, MemberOption } from '../../api/types'

/** 전자결재 > 기안서작성 — 좌측 결재양식 목록 + 선택 시 우측 기안 편집기 (실제 상신 연동) */
const FORMS: { label: string; type: ApprovalFormType }[] = [
  { label: '휴가신청서', type: 'LEAVE' },
  { label: '국내출장신청서', type: 'BIZ_TRIP' },
  { label: '출장복명서', type: 'TRIP_REPORT' },
  { label: '국내출장신청서_타인기안', type: 'BIZ_TRIP' },
  { label: '구매요청서', type: 'PURCHASE_REQ' },
  { label: '지급결의서', type: 'EXPENSE' },
  { label: '급여 지급결의서', type: 'EXPENSE' },
  { label: '차량수리비지출품의서', type: 'EXPENSE' },
  { label: '개인경비 사용내역서', type: 'EXPENSE' },
  { label: '진료비지원신청서', type: 'EXPENSE' },
  { label: '경조금신청서', type: 'GENERAL' },
  { label: '경조화환신청서', type: 'GENERAL' },
  { label: '검수확인서', type: 'GENERAL' },
  { label: '기술문서', type: 'GENERAL' },
  { label: '공 문', type: 'GENERAL' },
  { label: '내부일반문서', type: 'GENERAL' },
  { label: '결근사유서', type: 'GENERAL' },
  { label: '인사발령공고', type: 'GENERAL' },
  { label: '사고경위서', type: 'GENERAL' },
  { label: '해외출장신청', type: 'BIZ_TRIP' },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function ApprovalDraftPage() {
  const navigate = useNavigate()
  const [members, setMembers] = useState<MemberOption[]>([])
  const [selected, setSelected] = useState<{ label: string; type: ApprovalFormType } | null>(null)
  const [draftDate, setDraftDate] = useState(today())
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [reference, setReference] = useState('')
  const [approverIds, setApproverIds] = useState<number[]>([])
  const [pick, setPick] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<MemberOption[]>('/meta/users').then((r) => setMembers(r.data)).catch(() => {})
  }, [])

  function selectForm(f: { label: string; type: ApprovalFormType }) {
    setSelected(f)
    setTitle(f.label)
    setError('')
  }

  function addApprover() {
    const id = Number(pick)
    if (!id || approverIds.includes(id)) return
    setApproverIds((a) => [...a, id])
    setPick('')
  }

  const memberName = (id: number) => members.find((m) => m.id === id)?.name ?? `#${id}`

  async function submit() {
    setError('')
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (!body.trim()) return setError('내용을 입력하세요.')
    if (approverIds.length === 0) return setError('결재자를 1명 이상 지정하세요.')
    setSaving(true)
    try {
      await api.post('/approvals', {
        formType: selected!.type,
        title,
        content: body,
        draftDate,
        reference: reference || undefined,
        approverIds,
      })
      alert('기안이 상신되었습니다.')
      navigate('/groupware/approval/my')
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
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>기안서작성</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <input className="ec-input" placeholder="양식검색" style={{ width: 140 }} />
          <button className="ec-btn ec-btn-primary">Search(F3)</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
        {/* 좌측 양식 목록 */}
        <div style={{ width: 260, border: '1px solid var(--ec-border)', background: '#fff', flexShrink: 0, overflow: 'auto' }}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 60 }}>정렬순서</th>
                <th>양식명</th>
                <th style={{ width: 44 }}>구분</th>
              </tr>
            </thead>
            <tbody>
              {FORMS.map((f, i) => (
                <tr key={f.label} onClick={() => selectForm(f)} style={{ cursor: 'pointer', background: selected?.label === f.label ? 'var(--ec-blue-light)' : undefined }}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i}</td>
                  <td>{f.label}</td>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>기본</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 우측 기안 편집기 */}
        <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--ec-border)', background: '#fff', padding: 16, overflow: 'auto' }}>
          {!selected ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa1ab', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 40 }}>📝</div>
              <div>좌측에서 결재양식을 선택하세요.</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 12 }}>기안서 | {selected.label}</div>

              <table className="w-full text-left" style={{ marginBottom: 12 }}>
                <tbody>
                  <tr>
                    <th style={{ width: 90, background: '#f5f7fa' }}>일자</th>
                    <td><input className="ec-input" type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} style={{ width: 150 }} /></td>
                    <th style={{ width: 90, background: '#f5f7fa' }}>양식구분</th>
                    <td>{selected.label}</td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>제목</th>
                    <td colSpan={3}><input className="ec-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} /></td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>결재선 *</th>
                    <td colSpan={3}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: approverIds.length ? 6 : 0 }}>
                        <select className="ec-input" value={pick} onChange={(e) => setPick(e.target.value)} style={{ width: 200 }}>
                          <option value="">결재자 선택</option>
                          {members.filter((m) => !approverIds.includes(m.id)).map((m) => (
                            <option key={m.id} value={m.id}>{m.name}{m.department ? ` (${m.department})` : ''}</option>
                          ))}
                        </select>
                        <button className="ec-btn" onClick={addApprover}>+ 추가</button>
                        <span style={{ fontSize: 11.5, color: '#9aa1ab' }}>선택 순서대로 결재 진행</span>
                      </div>
                      {approverIds.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {approverIds.map((id, idx) => (
                            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--ec-blue-light)', color: 'var(--ec-blue-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
                              {idx + 1}. {memberName(id)}
                              <span onClick={() => setApproverIds((a) => a.filter((x) => x !== id))} style={{ cursor: 'pointer', fontWeight: 700 }}>×</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f5f7fa' }}>참조자</th>
                    <td colSpan={3}><input className="ec-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="이름(콤마구분)" style={{ width: 320 }} /></td>
                  </tr>
                </tbody>
              </table>

              {/* 글꼴 툴바(시각 재현) */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--ec-border)', borderBottom: 'none', padding: '4px 8px', background: '#f5f7fa', fontSize: 12 }}>
                <select className="ec-input" style={{ height: 22 }}><option>돋움</option><option>맑은 고딕</option></select>
                <select className="ec-input" style={{ height: 22, width: 54 }}><option>10</option><option>12</option></select>
                <span style={{ fontWeight: 700, cursor: 'pointer' }}>B</span>
                <span style={{ fontStyle: 'italic', cursor: 'pointer' }}>I</span>
                <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>U</span>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="내용을 입력하세요."
                style={{ width: '100%', height: 220, border: '1px solid var(--ec-border)', padding: 10, fontSize: 13, resize: 'vertical', outline: 'none' }} />

              <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
                <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '상신 중…' : '상신(F8)'}</button>
                <button className="ec-btn" onClick={() => setSelected(null)}>닫기</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
