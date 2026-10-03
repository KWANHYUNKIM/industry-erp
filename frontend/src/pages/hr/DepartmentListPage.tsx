import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { Department } from '../../types/api'
import DepartmentHierarchy from '../../features/department/components/DepartmentHierarchy'

/**
 * 관리 &gt; 급여관리 &gt; 기본사항등록 &gt; <b>부서등록</b> (원본 E010105, 화면 제목 '부서리스트').
 * 재고 I › 기초등록 › 부서등록도 원본은 같은 화면이다.
 *
 * <p>2026-10-03 loginaa 에서 등록 · 삭제해 본 그대로:
 * <ul>
 *   <li>격자: 부서코드 · 부서명 · 사용 · 추가사업장. 버튼 신규(F2) · 계층그룹 · 사용중단/재사용 ▲ · Excel.</li>
 *   <li>[신규(F2)] '부서등록' 창: 부서코드(다음 번호 00010 꼴 미리 채움) · 부서명 · 부서계층그룹.
 *       부서명이 비면 그 칸이 빨갛게 막힌다. 저장하면 안내 없이 창이 닫히고 목록에 붙는다.</li>
 *   <li>[삭제]: '삭제하시겠습니까? 조직도에 포함된 부서인 경우에는 조직도에서도 하위부서를 포함하여 모두 삭제됩니다.'
 *       — 하위 부서는 부서로 남고 조직도 배치만 풀린다(서버 DepartmentService.delete). 사원이 든 부서는 서버가 막는다.</li>
 * </ul>
 * [부서계층그룹]은 우리 부서의 상위 부서(조직도 나무)로 고른다. [계층그룹] 단추는 그 나무를 보고 옮기는 창(DepartmentHierarchy).
 * [추가사업장]은 없다 — 사업장을 하나만 둔다.
 */
export default function DepartmentListPage() {
  const [rows, setRows] = useState<Department[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [hierOpen, setHierOpen] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')

  function load() {
    setError('')
    api.get<Department[]>('/departments').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  async function openNew() {
    setEditId(null); setFormError(''); setName(''); setParentId(''); setCode('')
    setFormOpen(true)
    try {
      const r = await api.get<{ code: string }>('/departments/next-code')
      setCode((c) => c || r.data.code)
    } catch { /* 비우면 서버가 매긴다 */ }
  }

  function openEdit(d: Department) {
    setEditId(d.id); setFormError(''); setCode(d.code); setName(d.name)
    setParentId(d.parentId ? String(d.parentId) : '')
    setFormOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!name.trim()) { setFormError('부서명을 입력 바랍니다.'); return }
    const cur = rows.find((r) => r.id === editId)
    try {
      if (editId) {
        await api.put(`/departments/${editId}`, {
          name: name.trim(), parentId: parentId ? Number(parentId) : null,
          sortOrder: cur?.sortOrder ?? 0, active: cur?.active ?? true,
        })
      } else {
        await api.post('/departments', { code: code.trim() || null, name: name.trim(), parentId: parentId ? Number(parentId) : null })
      }
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  const [menuOpen, setMenuOpen] = useState(false)
  async function applyToChecked(op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false)
    if (op === '삭제' && !window.confirm(
      '삭제하시겠습니까?\n\n조직도에 포함된 부서인 경우에는 조직도에서도 하위부서를 포함하여 모두 삭제됩니다.')) return
    try {
      for (const d of rows.filter((x) => checked.has(x.id))) {
        if (op === '삭제') await api.delete(`/departments/${d.id}`)
        else await api.put(`/departments/${d.id}`, { name: d.name, parentId: d.parentId, sortOrder: d.sortOrder, active: op === '재사용' })
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const shownRows = rows
    .filter((d) => includeInactive || d.active)
    .filter((d) => !quick || d.code.includes(quick) || d.name.includes(quick))
    .sort((a, b) => a.code.localeCompare(b.code))
  const sort = useTableSort(shownRows, {
    부서코드: (d) => d.code,
    부서명: (d) => d.name,
    사용: (d) => (d.active ? 'Yes' : 'No'),
  })
  const shown = sort.sorted
  useTableColumnCheck(tableRef, '부서리스트', [shown.length])
  const allChecked = shown.length > 0 && shown.every((d) => checked.has(d.id))

  return (
    <EcListShell
      title="부서리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={openNew}
      actions={[
        { label: '계층그룹', onClick: () => setHierOpen(true) },
        { label: '사용중단/재사용 ▲', onClick: () => setMenuOpen((v) => !v), disabled: checked.size === 0 },
        { label: includeInactive ? '사용중단제외' : '사용중단포함', onClick: () => setIncludeInactive((v) => !v) },
        { label: 'Excel' },
      ]}
    >
      {hierOpen && <DepartmentHierarchy departments={rows} onClose={() => setHierOpen(false)} onChanged={load} />}
      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => (
              <button key={op} type="button" onClick={() => applyToChecked(op)}>{op}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((d) => d.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('부서코드')}>부서코드 {sort.mark('부서코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('부서명')}>부서명 {sort.mark('부서명')}</th>
            <th className="w-[160px] text-center cursor-pointer" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
            <th>추가사업장</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((d) => (
            <tr key={d.id} className={d.active ? undefined : 'text-ec-hint'}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(d.id)}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(d.id)) next.delete(d.id); else next.add(d.id)
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(d) }}>{d.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(d) }}>{d.name}</a></td>
              <td className="text-center">{d.active ? 'Yes' : 'No'}</td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title="부서등록" width={720} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">부서코드</span>
              <div className="form">
                {editId ? <span>{code}</span> : <input className="ec-input w-full" value={code} onChange={(e) => setCode(e.target.value)} />}
              </div>
            </li>
            <li className="wide">
              <span className="title">부서명</span>
              <div className="form">
                <input className="ec-input w-full" value={name} placeholder="부서명" autoFocus onChange={(e) => setName(e.target.value)} />
              </div>
            </li>
            <li className="wide">
              <span className="title">부서계층그룹</span>
              <div className="form">
                <select className="ec-input w-full" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value=""></option>
                  {rows.filter((d) => d.id !== editId).map((d) => <option key={d.id} value={d.id}>{d.code} {d.name}</option>)}
                </select>
              </div>
            </li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn"
                    onClick={() => { const d = rows.find((x) => x.id === editId); if (d) openEdit(d); else { setName(''); setParentId('') } }}>
              다시 작성
            </button>
            <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
