import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcHistoryButton from '../../components/EcHistory'
import BulkChangeModal from '../../components/BulkChangeModal'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { Project } from '../../types/api'
import { EcCond } from '../../components/EcStatusPanel'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

/** 원본 리스트 버튼이 고른 줄 없이 눌렸을 때의 알림(부서 · 창고 · 거래처 리스트와 같은 글). */
const NO_PICK = '리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.'

/** 원본 번호 칸(form-checkbox-numbered) — 번호가 곧 체크 칸이다. 고르면 파랑. */
function NumCheck({ no, on, onChange, label }: { no: number | ''; on: boolean; onChange: () => void; label: string }) {
  return (
    <label className="relative inline-block align-middle cursor-pointer">
      <input type="checkbox" aria-label={label} checked={on} onChange={onChange}
             className="absolute inset-0 m-0 opacity-0 cursor-pointer" />
      <span className={`inline-block w-[18px] h-[17px] leading-[17px] text-center rounded-[6px] ${
        on ? 'bg-ec-blue text-ec-panel' : 'bg-ec-panel text-ec-icon hover:bg-ec-row-hover'}`}>{no}</span>
    </label>
  )
}

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
 * 2026-10-13 재고 I › 기초등록 › 프로젝트등록 다시 실측: 빈 프로젝트명은 글 없이 빨간 테두리(탭 기본 · 프로젝트정보에 '!') ·
 * [사용중단/재사용] 은 고른 줄 없이도 펼치고 항목에서 '리스트에 선택된 자료가 없습니다.' · 리스트 삭제 확인은 '삭제하겠습니까?' ·
 * 사용중단하면 말 없이 기본 목록에서 사라진다 — Search(F3) 조건 프로젝트코드 · 프로젝트명 · 프로젝트그룹1 · 2 · 적요 ·
 * 사용구분(전체 · <b>사용</b> · 사용중단). 하단 [사용중단포함] 단추는 원본에 없다.
 * 프로젝트그룹1 · 2, 부가정보(추가문자 · 숫자형식), 미사용코드조회 · 웹자료올리기는 아직 없다.
 * 진척률 · PM · 기간은 그룹웨어 '프로젝트 관리' 화면이 다룬다(같은 프로젝트다).
 */
export default function ProjectListPage() {
  const [rows, setRows] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [cond, setCond] = useState<{ code: string; name: string; remark: string; use: 'ALL' | 'Y' | 'N' }>({ code: '', name: '', remark: '', use: 'Y' })
  /** 마지막 [저장] 이 프로젝트명이 비어 막혔는가 — 원본은 글 없이 그 칸만 빨갛다. */
  const [invalid, setInvalid] = useState(false)
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
    setEditId(null); setFormError(''); setInvalid(false); setName(''); setRemark(''); setEditMenu(false)
    // 원본처럼 다음 번호를 미리 채운다 — 숫자로만 된 코드 중 가장 큰 것 + 1, 다섯 자리
    const max = rows.map((r) => (/^[0-9]+$/.test(r.code) ? Number(r.code) : 0)).reduce((a, b) => Math.max(a, b), 0)
    setCode(String(max + 1).padStart(5, '0'))
    setFormOpen(true)
  }

  function openEdit(p: Project) {
    setEditId(p.id); setFormError(''); setInvalid(false); setCode(p.code); setName(p.name); setRemark(p.remark ?? ''); setEditMenu(false)
    setFormOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!name.trim()) { setInvalid(true); return }
    setInvalid(false)
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
    if (ids.length === 0) { void ecAlert(NO_PICK); return }
    // 원본 글: 리스트에서는 '삭제하겠습니까?', 수정 창에서는 '삭제하시겠습니까?'
    if (op === '삭제' && !(await ecConfirm(formOpen ? '삭제하시겠습니까?' : '삭제하겠습니까?'))) return
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
    .filter((p) => cond.use === 'ALL' || (cond.use === 'Y') === p.active)
    .filter((p) => !quick || p.code.includes(quick) || p.name.includes(quick))
    .filter((p) => p.code.includes(cond.code.trim()) && p.name.includes(cond.name.trim())
      && (p.remark ?? '').includes(cond.remark.trim()))
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
      collapseConditions
      onNew={openNew}
      actions={[
        { label: '변경', onClick: () => {
          if (checked.size === 0) { setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
          setError(''); setBulkOpen(true)
        } },
        /* 원본은 고른 줄이 없어도 펼친다 — 항목을 누르면 '리스트에 선택된 자료가 없습니다.' */
        { label: '사용중단/재사용 ▲', onClick: () => setMenuOpen((v) => !v) },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond">
        <EcCond label="프로젝트코드"><input className="ec-input w-full" placeholder="프로젝트코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="프로젝트명"><input className="ec-input w-full" placeholder="프로젝트명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="적요"><input className="ec-input w-full" placeholder="적요" value={cond.remark} onChange={(e) => setCond({ ...cond, remark: e.target.value })} /></EcCond>
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="project-use" checked={cond.use === v} onChange={() => setCond({ ...cond, use: v })} /> {l}</label>
          ))}
        </EcCond>
      </ul>
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
              <NumCheck no="" label="전체 선택" on={allChecked}
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
          ) : shown.map((p, i) => (
            <tr key={p.id} className={p.active ? undefined : 'text-ec-hint'}>
              <td className="text-center">
                <NumCheck no={i + 1} label="선택" on={checked.has(p.id)}
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
                <input className={`ec-input w-full ${invalid && !name.trim() ? 'border-[color:var(--ec-text-danger)]' : ''}`}
                       aria-invalid={invalid && !name.trim()} value={name} placeholder="프로젝트명" autoFocus onChange={(e) => setName(e.target.value)} />
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
            <EcHistoryButton target="PROJECT" id={editId} last />
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
