import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcHistoryButton from '../../components/EcHistory'
import { useTableSort } from '../../utils/useTableSort'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { ManagementItem } from '../../types/api'
import { EcCond } from '../../components/EcStatusPanel'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

/** 원본 리스트 버튼이 고른 줄 없이 눌렸을 때의 알림(부서 · 창고 · 프로젝트 리스트와 같은 글). */
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
 * 재고 I › 기초등록 › <b>관리항목등록</b> (원본 E040104, 화면 제목 '관리항목리스트').
 *
 * <p>2026-10-14 loginaa 에서 등록 · 수정 · 삭제해 본 그대로:
 * <ul>
 *   <li>격자: 번호 · 관리항목코드 · 관리항목명 · 사용(Yes). 코드 글자 순(*01 다음 00001). 머리 400 · 34.7, 본문 29.7.
 *       버튼 신규(F2) · 사용중단/재사용 ▲(사용중단 · 삭제 · 미사용코드조회 · 재사용) · Excel · 웹자료올리기.</li>
 *   <li>Search(F3) 조건: 관리항목코드 · 관리항목명 · 사용구분(전체 · <b>사용</b> · 사용중단) · 기타 수정일자순(정렬).</li>
 *   <li>[신규(F2)] '관리항목등록' 창: 관리항목코드(다음 번호 00001 꼴 — 다섯 자리 숫자 코드 중 가장 큰 것 + 1) · 관리항목명.
 *       버튼 저장(F8) · 다시 작성 · 닫기. 빈 관리항목명은 글 없이 빨간 테두리. 있는 코드면 '이미 관리항목등록에 존재하는 코드입니다.'
 *       저장하면 말 없이 닫히고 목록에 붙는다.</li>
 *   <li>코드 · 이름을 누르면 '관리항목수정' 창 — 코드가 글자로 잠기고 저장(F8) · 다시 작성 · 사용중단/재사용 ▲(사용중단 · 삭제) · 닫기 · H.
 *       H 는 마지막으로 고친 때 한 줄(창고 · 부서 · 프로젝트와 같다).</li>
 *   <li>리스트 삭제 확인 '삭제하겠습니까?'.</li>
 * </ul>
 * 원본에 없는 [설명] 은 칸 · 열에서 뺐다(서버 값은 그대로 둔다). 미사용코드조회 · 웹자료올리기 · 수정일자순은 아직 없다.
 */
export default function ManageItemsPage() {
  const [rows, setRows] = useState<ManagementItem[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [cond, setCond] = useState<{ code: string; name: string; use: 'ALL' | 'Y' | 'N' }>({ code: '', name: '', use: 'Y' })
  /** 마지막 [저장] 이 관리항목명이 비어 막혔는가 — 원본은 글 없이 그 칸만 빨갛다. */
  const [invalid, setInvalid] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [editMenu, setEditMenu] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  function load() {
    setError('')
    api.get<ManagementItem[]>('/management-items').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditId(null); setFormError(''); setInvalid(false); setName(''); setEditMenu(false)
    // 원본 다음 번호: 다섯 자리 숫자 코드 중 가장 큰 것 + 1(20150101 같은 여덟 자리가 있어도 00001 부터)
    const max = rows.map((r) => (/^[0-9]{5}$/.test(r.code) ? Number(r.code) : 0)).reduce((a, b) => Math.max(a, b), 0)
    setCode(String(max + 1).padStart(5, '0'))
    setFormOpen(true)
  }

  function openEdit(m: ManagementItem) {
    setEditId(m.id); setFormError(''); setInvalid(false); setCode(m.code); setName(m.name); setEditMenu(false)
    setFormOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!name.trim()) { setInvalid(true); return }
    setInvalid(false)
    try {
      if (editId) {
        const cur = rows.find((r) => r.id === editId)
        await api.put(`/management-items/${editId}`, { name: name.trim(), description: cur?.description ?? undefined, active: cur?.active })
      } else {
        await api.post('/management-items', { code: code.trim() || undefined, name: name.trim() })
      }
      setFormOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function apply(ids: number[], op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false); setEditMenu(false)
    if (ids.length === 0) { void ecAlert(NO_PICK); return }
    if (op === '삭제' && !(await ecConfirm(formOpen ? '삭제하시겠습니까?' : '삭제하겠습니까?'))) return
    try {
      for (const id of ids) {
        const r = rows.find((x) => x.id === id)
        if (!r) continue
        if (op === '삭제') await api.delete(`/management-items/${id}`)
        else await api.put(`/management-items/${id}`, { name: r.name, description: r.description ?? undefined, active: op === '재사용' })
      }
      setFormOpen(false)
    } catch (e) {
      if (formOpen) setFormError(extractErrorMessage(e)); else setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const shownRows = rows
    .filter((r) => cond.use === 'ALL' || (cond.use === 'Y') === r.active)
    .filter((r) => !quick || r.code.includes(quick) || r.name.includes(quick))
    .filter((r) => r.code.includes(cond.code.trim()) && r.name.includes(cond.name.trim()))
    .sort((a, b) => a.code.localeCompare(b.code))
  const sort = useTableSort(shownRows, {
    관리항목코드: (r) => r.code,
    관리항목명: (r) => r.name,
    사용: (r) => (r.active ? 'Yes' : 'No'),
  })
  const shown = sort.sorted
  useTableColumnCheck(tableRef, '관리항목리스트', [shown.length])
  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))

  return (
    <EcListShell
      title="관리항목리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      collapseConditions
      onNew={openNew}
      actions={[
        /* 원본은 고른 줄이 없어도 펼친다 — 항목을 누르면 '리스트에 선택된 자료가 없습니다.' */
        { label: '사용중단/재사용 ▲', onClick: () => setMenuOpen((v) => !v) },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond">
        <EcCond label="관리항목코드"><input className="ec-input w-full" placeholder="관리항목코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="관리항목명"><input className="ec-input w-full" placeholder="관리항목명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="mitem-use" checked={cond.use === v} onChange={() => setCond({ ...cond, use: v })} /> {l}</label>
          ))}
        </EcCond>
      </ul>
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
                        onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th className="cursor-pointer" onClick={() => sort.toggle('관리항목코드')}>관리항목코드 {sort.mark('관리항목코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('관리항목명')}>관리항목명 {sort.mark('관리항목명')}</th>
            <th className="w-[160px] text-center cursor-pointer" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id} className={r.active ? undefined : 'text-ec-hint'}>
              <td className="text-center">
                <NumCheck no={i + 1} label="선택" on={checked.has(r.id)}
                          onChange={() => {
                            const next = new Set(checked)
                            if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                            setChecked(next)
                          }} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.name}</a></td>
              <td className="text-center">{r.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={formOpen} title={editId ? '관리항목수정' : '관리항목등록'} width={760} onClose={() => setFormOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">관리항목코드</span>
              <div className="form">
                {editId ? <span>{code}</span> : <input className="ec-input w-full" placeholder="관리항목코드" value={code} onChange={(e) => setCode(e.target.value)} />}
              </div>
            </li>
            <li className="wide">
              <span className="title">관리항목명</span>
              <div className="form">
                <input className={`ec-input w-full ${invalid && !name.trim() ? 'border-[color:var(--ec-text-danger)]' : ''}`}
                       aria-invalid={invalid && !name.trim()} value={name} placeholder="관리항목명" autoFocus onChange={(e) => setName(e.target.value)} />
              </div>
            </li>
          </ul>
          <div className="relative flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn"
                    onClick={() => { const m = rows.find((x) => x.id === editId); if (m) openEdit(m); else setName('') }}>
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
            <EcHistoryButton target="MANAGEMENT_ITEM" id={editId} last />
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
