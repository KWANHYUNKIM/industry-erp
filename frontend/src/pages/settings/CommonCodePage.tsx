import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeGroup, CommonCode } from '../../api/types'

/**
 * Self-Customizing > 기타관리 > 공통코드 — 카드사·결제대행사·추가항목유형·결제수단처럼
 * "그냥 목록"인 값들을 한 곳에서 관리한다.
 *
 * 전표 상태·소득구분처럼 코드가 분기 조건으로 쓰는 값은 여기 담지 않는다
 * (테이블로 빼면 로직이 데이터 속에 숨는다).
 */
export default function CommonCodePage() {
  const [groups, setGroups] = useState<CodeGroup[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }
  const selected = groups.find((g) => g.id === selectedId) ?? null

  async function load(keep = true) {
    setError('')
    try {
      const r = await api.get<CodeGroup[]>('/codes')
      setGroups(r.data)
      if (!keep || !r.data.some((g) => g.id === selectedId)) {
        setSelectedId(r.data[0]?.id ?? null)
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  useEffect(() => { load(false) }, [])

  async function removeGroup(g: CodeGroup) {
    if (!window.confirm(`코드 그룹 「${g.name}」을(를) 삭제할까요? 하위 코드도 함께 지워집니다.`)) return
    try {
      await api.delete(`/codes/groups/${g.id}`)
      flash('코드 그룹을 삭제했습니다.')
      load(false)
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function removeCode(c: CommonCode) {
    if (!window.confirm(`코드 「${c.name}」을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/codes/codes/${c.id}`)
      flash('코드를 삭제했습니다.')
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function toggleActive(c: CommonCode) {
    try {
      await api.put(`/codes/codes/${c.id}`, {
        name: c.name, value1: c.value1, value2: c.value2,
        sortOrder: c.sortOrder, active: !c.active, remark: c.remark,
      })
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="공통코드" actions={[{ label: '새로고침', onClick: () => load() }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" onClick={() => setShowGroupForm(true)}>+ 코드 그룹 등록</button>
        <span style={{ fontSize: 12, color: '#9aa1ab' }}>
          카드사·결제대행사·추가항목유형 같은 목록을 여기서 관리합니다. 전표 상태처럼 로직이 걸린 값은 코드로 다루지 않습니다.
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* 좌: 코드 그룹 */}
        <div style={{ flex: '0 0 40%' }}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>그룹코드</th>
                <th>그룹명</th>
                <th style={{ textAlign: 'right', width: 50 }}>코드수</th>
                <th style={{ textAlign: 'center', width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>코드 그룹이 없습니다.</td></tr>
              ) : groups.map((g, i) => (
                <tr
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  style={{ cursor: 'pointer', background: selectedId === g.id ? '#eef5ff' : undefined }}
                >
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>
                    {g.groupCode}
                    {g.system && <span style={{ marginLeft: 4, fontSize: 10, color: '#8a929c' }}>시스템</span>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{g.name}</td>
                  <td style={{ textAlign: 'right' }}>{g.codes.length}</td>
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    {!g.system && (
                      <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: '#c60a2e' }} onClick={() => removeGroup(g)}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected?.description && (
            <p style={{ marginTop: 6, fontSize: 11.5, color: '#9aa1ab' }}>{selected.description}</p>
          )}
        </div>

        {/* 우: 선택한 그룹의 코드들 */}
        <div style={{ flex: 1 }}>
          <div style={{ padding: '6px 8px', background: '#f5f7fa', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            {selected ? `${selected.name} (${selected.groupCode})` : '코드 그룹을 선택하세요'}
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th style={{ width: 110 }}>코드</th>
                <th>코드명</th>
                <th style={{ width: 110 }}>부가값1</th>
                <th style={{ width: 110 }}>부가값2</th>
                <th style={{ width: 50, textAlign: 'right' }}>순서</th>
                <th style={{ width: 60, textAlign: 'center' }}>사용</th>
                <th style={{ width: 50, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {!selected || selected.codes.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>코드가 없습니다.</td></tr>
              ) : selected.codes.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{c.code}</td>
                  <td style={{ fontWeight: 600, color: c.active ? undefined : '#b0b6bd' }}>{c.name}</td>
                  <td style={{ color: '#5a626e' }}>{c.value1 ?? '-'}</td>
                  <td style={{ color: '#5a626e' }}>{c.value2 ?? '-'}</td>
                  <td style={{ textAlign: 'right' }}>{c.sortOrder}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      onClick={() => toggleActive(c)}
                      style={{ cursor: 'pointer', color: c.active ? '#1c7c3c' : '#8a929c' }}
                    >
                      {c.active ? '사용' : '미사용'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: '#c60a2e' }} onClick={() => removeCode(c)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected && <CodeForm groupId={selected.id} onSaved={() => { flash('코드를 추가했습니다.'); load() }} />}
        </div>
      </div>

      {showGroupForm && (
        <GroupForm onClose={() => setShowGroupForm(false)} onSaved={() => { setShowGroupForm(false); flash('코드 그룹을 등록했습니다.'); load(false) }} />
      )}
    </EcListShell>
  )
}

function CodeForm({ groupId, onSaved }: { groupId: number; onSaved: () => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [value1, setValue1] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!code.trim() || !name.trim()) {
      alert('코드와 코드명을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      await api.post(`/codes/groups/${groupId}/codes`, {
        code: code.trim(), name: name.trim(),
        value1: value1.trim() || null,
        sortOrder: Number(sortOrder) || 0,
      })
      setCode('')
      setName('')
      setValue1('')
      onSaved()
    } catch (err) {
      alert(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
      <input className="ec-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="코드 (예: LOTTE)" style={{ width: 130 }} />
      <input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="코드명 (예: 롯데카드)" style={{ flex: 1 }} />
      <input className="ec-input" value={value1} onChange={(e) => setValue1(e.target.value)} placeholder="부가값(선택)" style={{ width: 130 }} />
      <input className="ec-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ width: 60, textAlign: 'right' }} />
      <button className="ec-btn ec-btn-primary" onClick={add} disabled={saving}>+ 추가</button>
    </div>
  )
}

function GroupForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [groupCode, setGroupCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!groupCode.trim() || !name.trim()) return setError('그룹코드와 그룹명을 입력하세요.')
    setSaving(true)
    try {
      await api.post('/codes/groups', {
        groupCode: groupCode.trim(), name: name.trim(), description: description.trim() || null,
      })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 460, border: '1px solid var(--ec-border)', borderRadius: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>코드 그룹 등록</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>그룹코드<span style={{ color: '#c60a2e' }}>*</span></th>
                <td>
                  <input className="ec-input" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} placeholder="예: SHIPPING_METHOD" style={{ width: 220 }} />
                  <div style={{ fontSize: 11.5, color: '#9aa1ab', marginTop: 2 }}>영문 대문자로 저장됩니다.</div>
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>그룹명<span style={{ color: '#c60a2e' }}>*</span></th>
                <td><input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 배송방법" style={{ width: 220 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>설명</th>
                <td><input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} /></td>
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
