import { Fragment, useEffect, useRef, useState } from 'react'
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
import NumCheck from '../../components/NumCheck'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import UnusedCodeModal from '../../features/unusedcode/UnusedCodeModal'

/** 원본 리스트 버튼이 고른 줄 없이 눌렸을 때의 알림(부서 · 창고 · 거래처 리스트와 같은 글). */
const NO_PICK = '리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.'


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
 * 2026-10-28: [기본] · [프로젝트정보] 는 같은 칸(코드 · 명 · 그룹1 · 2 · 적요), 그룹1 · 2 는 돋보기 코드도움(프로젝트그룹 마스터),
 * [부가정보] 는 추가문자 · 숫자 · 장문 형식 1~3 + 날짜 3칸. 웹자료올리기는 아직 없다.
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
  const [group1, setGroup1] = useState('')
  const [group2, setGroup2] = useState('')
  /** 원본 [부가정보] 탭 — 추가문자형식1~3 · 추가숫자형식1~3 · 추가장문형식1~3 · 날짜 3칸 */
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [groups, setGroups] = useState<{ id: number; code: string; name: string }[]>([])
  const [groupNew, setGroupNew] = useState(false)
  const [gCode, setGCode] = useState('')
  const [gName, setGName] = useState('')
  const [gError, setGError] = useState('')
  const [formTab, setFormTab] = useState<'기본' | '프로젝트정보' | '부가정보'>('기본')
  const [editMenu, setEditMenu] = useState(false)

  function load() {
    setError('')
    api.get<Project[]>('/projects').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  function loadGroups() { api.get<{ id: number; code: string; name: string }[]>('/project-groups').then((r) => setGroups(r.data)).catch(() => undefined) }
  useEffect(() => { load(); loadGroups() }, [])
  const groupItems: CodeItem[] = groups.map((g) => ({ value: g.code, code: g.code, name: g.name }))
  const EXTRA_KEYS = [1, 2, 3].flatMap((i) => [`extraText${i}`, `extraNum${i}`, `extraLong${i}`, `extraDate${i}`])
  function extraOf(p: Project | null): Record<string, string> {
    const o: Record<string, string> = {}
    for (const k of EXTRA_KEYS) o[k] = p ? String((p as unknown as Record<string, unknown>)[k] ?? '') : ''
    return o
  }
  function extraBody(): Record<string, string | number | null> {
    const o: Record<string, string | number | null> = {}
    for (const k of EXTRA_KEYS) {
      const v = (extra[k] ?? '').trim()
      o[k] = k.startsWith('extraNum') ? (v === '' ? null : Number(v)) : (v === '' ? null : v)
    }
    return o
  }
  async function saveGroup() {
    if (!gCode.trim() || !gName.trim()) { setGError('그룹코드와 그룹명을 입력하세요.'); return }
    try {
      await api.post('/project-groups', { code: gCode.trim(), name: gName.trim() })
      setGroupNew(false); setGCode(''); setGName(''); setGError(''); loadGroups()
    } catch (e) { setGError(extractErrorMessage(e)) }
  }

  function openNew() {
    setEditId(null); setFormError(''); setInvalid(false); setName(''); setRemark(''); setEditMenu(false)
    // 원본처럼 다음 번호를 미리 채운다 — 숫자로만 된 코드 중 가장 큰 것 + 1, 다섯 자리
    // 원본 2026-10-28 실측: 다섯 자리 숫자 코드(00022)만 센다 — 100 · 200 같은 짧은 코드와 20210801A 같은 긴 코드는 무시(00022 → 00023)
    const nums = rows.map((r) => r.code).filter((c) => /^\d{5}$/.test(c)).map(Number)
    setCode(String((nums.length ? Math.max(...nums) : 0) + 1).padStart(5, '0'))
    setGroup1(''); setGroup2(''); setExtra(extraOf(null)); setFormTab('기본')
    setFormOpen(true)
  }

  function openEdit(p: Project) {
    setEditId(p.id); setFormError(''); setInvalid(false); setCode(p.code); setName(p.name); setRemark(p.remark ?? ''); setGroup1(p.group1 ?? ''); setGroup2(p.group2 ?? ''); setExtra(extraOf(p)); setFormTab('기본'); setEditMenu(false)
    setFormOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!name.trim()) { setInvalid(true); return }
    setInvalid(false)
    try {
      if (editId) await api.patch(`/projects/${editId}`, { name: name.trim(), remark: remark.trim(), group1: group1.trim(), group2: group2.trim(), ...extraBody() })
      else await api.post('/projects', { code: code.trim() || null, name: name.trim(), remark: remark.trim() || null, group1: group1.trim() || null, group2: group2.trim() || null, ...extraBody() })
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
  const [unusedOpen, setUnusedOpen] = useState(false) // 미사용코드조회 창

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
            {(['사용중단', '삭제', '미사용코드조회', '재사용'] as const).map((op) => (
              <button key={op} type="button"
                      onClick={() => (op === '미사용코드조회' ? (setMenuOpen(false), setUnusedOpen(true)) : apply([...checked], op))}>{op}</button>
            ))}
          </div>
        </>
      )}
      <UnusedCodeModal open={unusedOpen} title="미사용코드조회" codeLabel="프로젝트코드" nameLabel="프로젝트명" endpoint="/projects/unused"
                       rows={rows}
                       columns={[
                         { head: '프로젝트코드', cell: (p) => p.code }, { head: '프로젝트명', cell: (p) => p.name },
                         { head: '사용', cell: (p) => (p.active ? 'Yes' : 'No') },
                       ]}
                       onStop={async (targets) => {
                         for (const p of targets) await api.patch(`/projects/${p.id}`, { active: false })
                         load()
                       }}
                       onClose={() => setUnusedOpen(false)} />
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <NumCheck tone="plain" no="" label="전체 선택" on={allChecked}
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
                <NumCheck tone="plain" no={i + 1} label="선택" on={checked.has(p.id)}
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
          <ul className="ec-tabs mb-[10px]">
            {(['기본', '프로젝트정보', '부가정보'] as const).map((t) => (
              <li key={t} className={`ec-tab relative cursor-pointer${formTab === t ? ' active' : ''}`} onClick={() => setFormTab(t)}>{t}</li>
            ))}
          </ul>
          <ul className="ec-form">
            {(['기본', '프로젝트정보'] as const).map((tab) => (
              <Fragment key={tab}>
                <li className={`wide${formTab === tab ? '' : ' hidden'}`}>
                  <span className="title">프로젝트코드</span>
                  <div className="form">
                    {editId ? <span>{code}</span> : <input className="ec-input w-full" value={code} onChange={(e) => setCode(e.target.value)} />}
                  </div>
                </li>
                <li className={`wide${formTab === tab ? '' : ' hidden'}`}>
                  <span className="title">프로젝트명</span>
                  <div className="form">
                    <input className={`ec-input w-full ${invalid && !name.trim() ? 'border-[color:var(--ec-text-danger)]' : ''}`}
                           aria-invalid={invalid && !name.trim()} value={name} placeholder="프로젝트명" autoFocus={tab === '기본'} onChange={(e) => setName(e.target.value)} />
                  </div>
                </li>
                <li className={`wide${formTab === tab ? '' : ' hidden'}`}>
                  <span className="title">프로젝트그룹1</span>
                  <div className="form">
                    <CodePickerField label="프로젝트그룹1" hideLabel fill items={groupItems} value={group1} showCode
                                     onChange={(v) => setGroup1(v)} onNew={() => setGroupNew(true)} />
                  </div>
                </li>
                <li className={`wide${formTab === tab ? '' : ' hidden'}`}>
                  <span className="title">프로젝트그룹2</span>
                  <div className="form">
                    <CodePickerField label="프로젝트그룹2" hideLabel fill items={groupItems} value={group2} showCode
                                     onChange={(v) => setGroup2(v)} onNew={() => setGroupNew(true)} />
                  </div>
                </li>
                <li className={`wide${formTab === tab ? '' : ' hidden'}`}>
                  <span className="title">적요</span>
                  <div className="form">
                    <textarea className="ec-input w-full" rows={2} value={remark} placeholder="적요" onChange={(e) => setRemark(e.target.value)} />
                  </div>
                </li>
              </Fragment>
            ))}
            {([1, 2, 3].flatMap((i) => [
              ['extraText' + i, '추가문자형식' + i, 'text'], ['extraNum' + i, '추가숫자형식' + i, 'number'],
              ['extraLong' + i, '추가장문형식' + i, 'long'], ['extraDate' + i, '날짜' + i, 'date'],
            ]) as [string, string, 'text' | 'number' | 'long' | 'date'][]).map(([k, label, kind]) => (
              <li key={k} className={`wide${formTab === '부가정보' ? '' : ' hidden'}`}>
                <span className="title">{label}</span>
                <div className="form">
                  {kind === 'long'
                    ? <textarea className="ec-input w-full" rows={2} maxLength={2000} value={extra[k] ?? ''} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} />
                    : <input className="ec-input w-full" type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'} maxLength={200}
                             name={k} value={extra[k] ?? ''} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} />}
                </div>
              </li>
            ))}
          </ul>
          <div className="relative flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn"
                    onClick={() => { const p = rows.find((x) => x.id === editId); if (p) openEdit(p); else { setName(''); setRemark(''); setGroup1(''); setGroup2(''); setExtra(extraOf(null)) } }}>
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
      <Modal error={gError} open={groupNew} title="프로젝트그룹등록" width={420} onClose={() => setGroupNew(false)}>{(
        <div>
          <ul className="ec-form">
            <li className="wide"><span className="title">그룹코드</span><div className="form"><input className="ec-input w-full" maxLength={50} value={gCode} placeholder="그룹코드" onChange={(e) => setGCode(e.target.value)} /></div></li>
            <li className="wide"><span className="title">그룹명</span><div className="form"><input className="ec-input w-full" maxLength={100} value={gName} placeholder="그룹명" onChange={(e) => setGName(e.target.value)} /></div></li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={saveGroup}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setGroupNew(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>
    </EcListShell>
  )
}
