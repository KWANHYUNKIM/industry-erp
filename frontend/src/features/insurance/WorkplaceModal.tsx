import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import type { InsuranceWorkplace } from './types'
import EcIcon from '../../components/ui/EcIcon'

/**
 * 사업장관리 — 원본 4대보험 입력의 사업장 🔍 [신규(F2)] · 4대보험신고 [사업장관리](2026-10-14 실측).
 * 조회 창: [No.][사업장명][사업장관리번호][사업장전화번호][사업자등록번호(회사 이름 + 번호)] · 신규(F2) · 사용중단/재사용 · 닫기.
 * 등록 창: 사업장명 · 사업장관리번호(11자리 아니면 '자릿수는 11입니다.') · 사업장전화번호 · 사업자등록번호 · 저장(F8) · 다시작성 · 닫기.
 * 수정 창: 사업장관리번호는 글자로만(못 고침) · 저장(F8) · 다시작성 · 사용중단/재사용(▴ 삭제) · 닫기.
 */
export default function WorkplaceModal({ onClose, startNew }: { onClose: () => void; startNew?: boolean }) {
  const [rows, setRows] = useState<InsuranceWorkplace[]>([])
  const [company, setCompany] = useState<{ name?: string; bizRegNo?: string } | null>(null)
  const [edit, setEdit] = useState<InsuranceWorkplace | 'new' | null>(startNew ? 'new' : null)
  const [form, setForm] = useState({ name: '', manageNo: '', phone: '' })
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [listMenu, setListMenu] = useState(false)

  const load = () => api.get<InsuranceWorkplace[]>('/hr/insurance/workplaces').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  useEffect(() => {
    load()
    api.get('/company').then((r) => setCompany(r.data)).catch(() => setCompany(null))
  }, [])

  const biz = company ? `${company.name ?? ''} ${(company.bizRegNo ?? '').replaceAll('-', '')}`.trim() : ''
  const open = (w: InsuranceWorkplace | 'new') => {
    setError(null)
    setMenu(false)
    setEdit(w)
    setForm(w === 'new' ? { name: '', manageNo: '', phone: '' } : { name: w.name, manageNo: w.manageNo, phone: w.phone ?? '' })
  }

  async function save() {
    setError(null)
    try {
      if (edit === 'new') await api.post('/hr/insurance/workplaces', form)
      else if (edit) await api.put(`/hr/insurance/workplaces/${edit.id}`, form)
      if (startNew) { onClose(); return }
      setEdit(null)
      load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function toggle() {
    if (!edit || edit === 'new') return
    try { await api.post(`/hr/insurance/workplaces/${edit.id}/toggle`); setEdit(null); load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  /** 조회 창 [사용중단/재사용 ▲] 펼침 — 고른 줄에 사용중단 · 삭제 · 재사용(원본 2026-10-14 실측) */
  async function applyToChecked(op: '사용중단' | '삭제' | '재사용') {
    setListMenu(false)
    const targets = rows.filter((w) => checked.has(w.id))
    if (targets.length === 0) {
      void ecAlert('리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.')
      return
    }
    if (op === '삭제' && !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const w of targets) {
        if (op === '삭제') await api.delete(`/hr/insurance/workplaces/${w.id}`)
        else if ((op === '사용중단') === w.active) await api.post(`/hr/insurance/workplaces/${w.id}/toggle`)
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  async function remove() {
    if (!edit || edit === 'new') return
    setMenu(false)
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try { await api.delete(`/hr/insurance/workplaces/${edit.id}`); setEdit(null); load() } catch (e) { setError(extractErrorMessage(e)) }
  }

  if (edit) {
    return (
      <Modal open title={edit === 'new' ? '사업장관리등록' : '사업장관리수정'} onClose={() => (startNew ? onClose() : setEdit(null))} width={960} error={error}>
        <ul className="ec-form mb-[8px] [&>li]:col-span-2">
          <li><span className="title">사업장명</span><div className="form">
            <input className="ec-input w-full" placeholder="사업장명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div></li>
          <li><span className="title">사업장관리번호</span><div className="form">
            {edit === 'new'
              ? <input className="ec-input w-full" placeholder="사업장관리번호" value={form.manageNo} onChange={(e) => setForm({ ...form, manageNo: e.target.value })} />
              : <span>{form.manageNo}</span>}</div></li>
          <li><span className="title">사업장전화번호</span><div className="form">
            <input className="ec-input w-full" placeholder="사업장전화번호" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div></li>
          <li><span className="title">사업자등록번호</span><div className="form">
            <select className="ec-input w-full"><option>{biz}</option></select></div></li>
        </ul>
        <div className="flex gap-[6px]">
          <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
          <button className="ec-btn" onClick={() => open(edit)}>다시작성</button>
          {edit !== 'new' && (
            <span className="ec-btn-group relative">
              <button className="ec-btn" onClick={toggle}>{edit.active ? '사용중단' : '재사용'}</button>
              <button className="ec-btn ec-btn-arrow" aria-label="펼침" onClick={() => setMenu((v) => !v)}><EcIcon name="caret-up" size={10} glyph="▴" /></button>
              {menu && <div className="ec-menu absolute bottom-[28px] left-0"><button onClick={remove}>삭제</button></div>}
            </span>
          )}
          <button className="ec-btn" onClick={() => (startNew ? onClose() : setEdit(null))}>닫기</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open title="사업장관리조회" onClose={onClose} width={960} error={error}>
      <table className="ec-list-grid mb-[8px]">
        <thead>
          <tr><th className="w-[40px]">
            <input type="checkbox" checked={rows.length > 0 && rows.every((w) => checked.has(w.id))}
                   onChange={(e) => setChecked(new Set(e.target.checked ? rows.map((w) => w.id) : []))} />
          </th><th>사업장명</th><th>사업장관리번호</th><th>사업장전화번호</th><th>사업자등록번호</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="text-center">등록된 데이터가 없습니다.</td></tr>}
          {rows.map((w, i) => (
            <tr key={w.id} className={w.active ? undefined : 'text-ec-hint'}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(w.id)}
                       onChange={(e) => setChecked((p) => { const n = new Set(p); if (e.target.checked) n.add(w.id); else n.delete(w.id); return n })} />
                <span className="ml-[4px]">{i + 1}</span>
              </td>
              <td><a className="cursor-pointer" onClick={() => open(w)}>{w.name}</a></td>
              <td><a className="cursor-pointer" onClick={() => open(w)}>{w.manageNo}</a></td>
              <td>{w.phone}</td>
              <td>{biz}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[6px]">
        <button className="ec-btn" onClick={() => open('new')}>신규(F2)</button>
        <span className="relative">
          <button className="ec-btn" onClick={() => setListMenu((v) => !v)}>사용중단/재사용 ▲</button>
          {listMenu && (
            <div className="ec-menu absolute bottom-[28px] left-0">
              {(['사용중단', '삭제', '재사용'] as const).map((op) => (
                <button key={op} type="button" onClick={() => applyToChecked(op)}>{op}</button>
              ))}
            </div>
          )}
        </span>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
