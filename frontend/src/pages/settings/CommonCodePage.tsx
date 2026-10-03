import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeGroup, CommonCode } from '../../types/api'

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
      <div className="flex items-center gap-[6px] mb-[8px]">
        <button className="ec-btn ec-btn-primary" onClick={() => setShowGroupForm(true)}>+ 코드 그룹 등록</button>
        <span className="text-[12px] text-ec-hint">
          카드사·결제대행사·추가항목유형 같은 목록을 여기서 관리합니다. 전표 상태처럼 로직이 걸린 값은 코드로 다루지 않습니다.
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <div className="flex gap-[12px] items-start">
        {/* 좌: 코드 그룹 */}
        <div style={{ flex: '0 0 40%' }}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th>그룹코드</th>
                <th>그룹명</th>
                <th className="text-right w-[50px]">코드수</th>
                <th className="text-center w-[50px]"></th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : groups.map((g, i) => (
                <tr
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  style={{ cursor: 'pointer', background: selectedId === g.id ? 'var(--ec-blue-wash)' : undefined }}
                >
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td className="text-ec-blue">
                    {g.groupCode}
                    {g.system && <span className="ml-[4px] text-[10px] text-ec-hint">시스템</span>}
                  </td>
                  <td className="font-semibold">{g.name}</td>
                  <td className="text-right">{g.codes.length}</td>
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    {!g.system && (
                      <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: 'var(--ec-danger)' }} onClick={() => removeGroup(g)}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected?.description && (
            <p className="mt-[6px] text-[11.5px] text-ec-hint">{selected.description}</p>
          )}
        </div>

        {/* 우: 선택한 그룹의 코드들 */}
        <div className="flex-1">
          <div style={{ padding: '6px 8px', background: 'var(--ec-bg-page)', border: '1px solid var(--ec-border)', borderBottom: 'none', fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
            {selected ? `${selected.name} (${selected.groupCode})` : '코드 그룹을 선택하세요'}
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th className="w-[110px]">코드</th>
                <th>코드명</th>
                <th className="w-[110px]">부가값1</th>
                <th className="w-[110px]">부가값2</th>
                <th className="w-[50px] text-right">순서</th>
                <th className="w-[60px] text-center">사용</th>
                <th className="w-[50px] text-center"></th>
              </tr>
            </thead>
            <tbody>
              {!selected || selected.codes.length === 0 ? (
                <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : selected.codes.map((c, i) => (
                <tr key={c.id}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{c.code}</td>
                  <td style={{ fontWeight: 600, color: c.active ? undefined : '#b0b6bd' }}>{c.name}</td>
                  <td className="text-ec-label">{c.value1 ?? ''}</td>
                  <td className="text-ec-label">{c.value2 ?? ''}</td>
                  <td className="text-right">{c.sortOrder}</td>
                  <td className="text-center">
                    <span
                      onClick={() => toggleActive(c)}
                      style={{ cursor: 'pointer', color: c.active ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}
                    >
                      {c.active ? '사용' : '미사용'}
                    </span>
                  </td>
                  <td className="text-center">
                    <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: 'var(--ec-danger)' }} onClick={() => removeCode(c)}>×</button>
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
    <div className="flex gap-[4px] mt-[6px] items-center">
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
      <div onClick={(e) => e.stopPropagation()} className="bg-white w-[460px] border border-ec-line border-solid rounded-[4px]">
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">코드 그룹 등록</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">그룹코드<span className="text-ec-danger">*</span></th>
                <td>
                  <input className="ec-input" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} placeholder="예: SHIPPING_METHOD" style={{ width: 220 }} />
                  <div className="text-[11.5px] text-ec-hint mt-[2px]">영문 대문자로 저장됩니다.</div>
                </td>
              </tr>
              <tr>
                <th className="bg-ec-page">그룹명<span className="text-ec-danger">*</span></th>
                <td><input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 배송방법" style={{ width: 220 }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">설명</th>
                <td><input className="ec-input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} /></td>
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
