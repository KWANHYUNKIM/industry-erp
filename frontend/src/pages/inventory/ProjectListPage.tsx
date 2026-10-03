import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import BulkChangeModal from '../../components/BulkChangeModal'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { Project } from '../../types/api'

/**
 * 관리 &gt; 급여관리 &gt; 기본사항등록 &gt; <b>프로젝트등록</b> (원본 E010112, 화면 제목 '프로젝트리스트').
 *
 * <p>2026-10-03 loginaa 에서 등록 · 삭제해 본 그대로:
 * <ul>
 *   <li>격자: 프로젝트코드 · 프로젝트명 · 사용(Yes). 코드는 글자 순으로 선다(00022 다음에 10).
 *       버튼 신규(F2) · 변경 · 사용중단/재사용 ▲(사용중단 · 삭제 · 미사용코드조회 · 재사용) · Excel · 웹자료올리기.</li>
 *   <li>[신규(F2)] '프로젝트등록' 창(탭 기본 · 프로젝트정보 · 부가정보): 프로젝트코드(다음 번호 00023 꼴, 고칠 수 있음) ·
 *       프로젝트명 · 프로젝트그룹1 · 프로젝트그룹2 · 적요. 저장하면 안내 없이 목록에 붙는다.</li>
 *   <li>이름을 누르면 '프로젝트수정' 창 — 코드가 잠기고 [사용중단/재사용 ▲](사용중단 · 삭제)이 붙는다. 삭제는 '삭제하시겠습니까?'.</li>
 * </ul>
 * 프로젝트그룹1 · 2, 부가정보(추가문자 · 숫자형식), 변경 · 미사용코드조회 · 웹자료올리기는 아직 없다.
 * 진척률 · PM · 기간은 그룹웨어 '프로젝트 관리' 화면이 다룬다(같은 프로젝트다).
 */
export default function ProjectListPage() {
  const [rows, setRows] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  /** 원본 [변경](2026-10-04 실측: 항목검색 프로젝트명 · 프로젝트그룹1 · 2 · 적요 · 부가정보 · 사용구분) — 담을 칸이 있는 것만. */
  const [bulkOpen, setBulkOpen] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [remark, setRemark] = useState('')
  const [editMenu, setEditMenu] = useState(false)

  function load() {
    setError('')
    api.get<Project[]>('/projects').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditId(null); setFormError(''); setName(''); setRemark(''); setEditMenu(false)
    // 원본처럼 다음 번호를 미리 채운다 — 숫자로만 된 코드 중 가장 큰 것 + 1, 다섯 자리
    const max = rows.map((r) => (/^[0-9]+$/.test(r.code) ? Number(r.code) : 0)).reduce((a, b) => Math.max(a, b), 0)
    setCode(String(max + 1).padStart(5, '0'))
    setFormOpen(true)
  }

  function openEdit(p: Project) {
    setEditId(p.id); setFormError(''); setCode(p.code); setName(p.name); setRemark(p.remark ?? ''); setEditMenu(false)
    setFormOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!name.trim()) { setFormError('프로젝트명을 입력 바랍니다.'); return }
    try {
      if (editId) await api.patch(`/projects/${editId}`, { name: name.trim(), remark: remark.trim() })
      else await api.post('/projects', { code: code.trim() || null, name: name.trim(), remark: remark.trim() || null })
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function apply(ids: number[], op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false); setEditMenu(false)
    if (op === '삭제' && !window.confirm('삭제하시겠습니까?')) return
    try {
      for (const id of ids) {
        if (op === '삭제') await api.delete(`/projects/${id}`)
        else await api.patch(`/projects/${id}`, { active: op === '재사용' })
      }
      setFormOpen(false)
    } catch (e) {
      if (formOpen) setFormError(extractErrorMessage(e)); else setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const [menuOpen, setMenuOpen] = useState(false)

  const shownRows = rows
    .filter((p) => includeInactive || p.active)
    .filter((p) => !quick || p.code.includes(quick) || p.name.includes(quick))
    .sort((a, b) => a.code.localeCompare(b.code))
  const sort = useTableSort(shownRows, {
    프로젝트코드: (p) => p.code,
    프로젝트명: (p) => p.name,
    사용: (p) => (p.active ? 'Yes' : 'No'),
  })
  const shown = sort.sorted
  useTableColumnCheck(tableRef, '프로젝트리스트', [shown.length])
  const allChecked = shown.length > 0 && shown.every((p) => checked.has(p.id))

  return (
    <EcListShell
      title="프로젝트리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={openNew}
      actions={[
        { label: '변경', onClick: () => {
          if (checked.size === 0) { setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
          setError(''); setBulkOpen(true)
        } },
        { label: '사용중단/재사용 ▲', onClick: () => setMenuOpen((v) => !v), disabled: checked.size === 0 },
        { label: includeInactive ? '사용중단제외' : '사용중단포함', onClick: () => setIncludeInactive((v) => !v) },
        { label: 'Excel' },
      ]}
    >
      {bulkOpen && (
        <BulkChangeModal rows={rows.filter((r) => checked.has(r.id))} codeLabel="프로젝트코드"
                         fields={[
                           { key: 'name', label: '프로젝트명', kind: 'text' },
                           { key: 'remark', label: '적요', kind: 'text' },
                           { key: 'active', label: '사용구분', kind: 'select', options: [['true', 'Yes'], ['false', 'No']] },
                         ]}
                         initial={(p) => ({ name: p.name, remark: p.remark ?? '', active: String(p.active) })}
                         saveRow={async (p, d) => {
                           if (!d.name.trim()) throw new Error('프로젝트명을 입력 바랍니다.')
                           await api.patch(`/projects/${p.id}`, { name: d.name.trim(), remark: d.remark.trim(), active: d.active !== 'false' })
                         }}
                         onClose={() => setBulkOpen(false)}
                         onSaved={() => { setBulkOpen(false); setChecked(new Set()); load() }} />
      )}
      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => (
              <button key={op} type="button" onClick={() => apply([...checked], op)}>{op}</button>
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
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((p) => p.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('프로젝트코드')}>프로젝트코드 {sort.mark('프로젝트코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('프로젝트명')}>프로젝트명 {sort.mark('프로젝트명')}</th>
            <th className="w-[160px] text-center cursor-pointer" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((p) => (
            <tr key={p.id} className={p.active ? undefined : 'text-ec-hint'}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(p.id)}
                       onChange={() => {
                         const next = new Set(checked)
                         if (next.has(p.id)) next.delete(p.id); else next.add(p.id)
                         setChecked(next)
                       }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(p) }}>{p.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(p) }}>{p.name}</a></td>
              <td className="text-center">{p.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title={editId ? '프로젝트수정' : '프로젝트등록'} width={720} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">프로젝트코드</span>
              <div className="form">
                {editId ? <span>{code}</span> : <input className="ec-input w-full" value={code} onChange={(e) => setCode(e.target.value)} />}
              </div>
            </li>
            <li className="wide">
              <span className="title">프로젝트명</span>
              <div className="form">
                <input className="ec-input w-full" value={name} placeholder="프로젝트명" autoFocus onChange={(e) => setName(e.target.value)} />
              </div>
            </li>
            <li className="wide">
              <span className="title">적요</span>
              <div className="form">
                <textarea className="ec-input w-full" rows={2} value={remark} placeholder="적요" onChange={(e) => setRemark(e.target.value)} />
              </div>
            </li>
          </ul>
          <div className="relative flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn"
                    onClick={() => { const p = rows.find((x) => x.id === editId); if (p) openEdit(p); else { setName(''); setRemark('') } }}>
              다시 작성
            </button>
            {editId && (
              <span className="relative inline-flex">
                <button type="button" className="ec-btn" onClick={() => setEditMenu((v) => !v)}>사용중단/재사용 ▲</button>
                {editMenu && (
                  <div className="ec-menu top-auto bottom-[calc(100%+4px)] left-0 right-auto">
                    {(rows.find((x) => x.id === editId)?.active ? ['사용중단', '삭제'] as const : ['재사용', '삭제'] as const)
                      .map((op) => <button key={op} type="button" onClick={() => apply([editId], op)}>{op}</button>)}
                  </div>
                )}
              </span>
            )}
            <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
