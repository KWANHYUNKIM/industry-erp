import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { useShortcut } from '../../../utils/useShortcut'
import { ecConfirm } from '../../../components/EcDialog'

export interface ScheduleCategory { id: number; code: string; name: string; active: boolean }

/** 수정 창의 [사용중단/재사용 ▲] — 펴면 사용중단(또는 재사용) · 삭제(원본 차례). */
function StopMenu({ active, onPick }: { active: boolean; onPick: (a: 'stop' | 'delete' | 'reuse') => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <button type="button" className="ec-btn" onClick={() => setOpen((v) => !v)}>사용중단/재사용 ▴</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[120px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
            {([[active ? 'stop' : 'reuse', active ? '사용중단' : '재사용'], ['delete', '삭제']] as const).map(([k, l]) => (
              <button key={k} type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                      onClick={() => { setOpen(false); onPick(k) }}>{l}</button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

/**
 * 원본 일정관리등록 [일정구분] 🔍 (E070201, 2026-10-13 loginaa 실측) — 세 겹 창이다.
 * <ol>
 *   <li>'일정구분검색': 격자 [일정구분코드▼][일정구분명▼], 코드를 누르면 고른다(입력 칸에 코드 · 이름이 찬다).
 *       하단 [신규 및 수정][닫기]. 사용중단한 구분은 나오지 않는다.</li>
 *   <li>[신규 및 수정] → '일정구분리스트': 같은 격자 + 줄번호, 코드를 누르면 '일정구분수정'. 하단 [신규(F2)][이전][닫기].</li>
 *   <li>'일정구분등록': 일정구분코드(다음 번호 012 가 미리 찬다) · 일정구분명, [저장(F8)][다시 작성][닫기].
 *       이름을 비우고 저장하면 '일정구분명을 입력 바랍니다.'. 저장하면 리스트로 돌아온다.
 *       '일정구분수정' 은 코드가 막히고 [저장(F8)][사용중단/재사용 ▲(사용중단 · 삭제)][닫기], 삭제는 '삭제하겠습니까?' 를 묻는다.</li>
 * </ol>
 */
export default function ScheduleCategoryModal({ onPick, onClose }: { onPick: (c: ScheduleCategory) => void; onClose: () => void }) {
  const [rows, setRows] = useState<ScheduleCategory[]>([])
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState('')
  const [error, setError] = useState('')
  /** 'search' = 일정구분검색, 'list' = 일정구분리스트. */
  const [mode, setMode] = useState<'search' | 'list'>('search')
  const [edit, setEdit] = useState<{ id: number | null; code: string; name: string; active: boolean } | null>(null)
  const [nameMissing, setNameMissing] = useState(false)

  async function load() {
    try { setRows((await api.get<ScheduleCategory[]>('/schedule-categories')).data) } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  async function openNew() {
    setError('')
    setNameMissing(false)
    try {
      const { data } = await api.get<{ code: string }>('/schedule-categories/next-code')
      setEdit({ id: null, code: data.code, name: '', active: true })
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useShortcut('F2', () => void openNew(), mode === 'list' && !edit)
  useShortcut('F8', () => void save(), !!edit)
  useShortcut('F3', () => setApplied(keyword), !edit)

  async function save() {
    if (!edit) return
    setError('')
    if (!edit.name.trim()) return setNameMissing(true)
    try {
      const body = { code: edit.code.trim(), name: edit.name.trim() }
      if (edit.id == null) await api.post('/schedule-categories', body)
      else await api.put(`/schedule-categories/${edit.id}`, body)
      setEdit(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function act(id: number, a: 'stop' | 'delete' | 'reuse') {
    setError('')
    if (a === 'delete' && !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      if (a === 'delete') await api.delete(`/schedule-categories/${id}`)
      else await api.patch(`/schedule-categories/${id}/active`, null, { params: { active: a === 'reuse' } })
      setEdit(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = rows.filter((c) => (mode === 'list' || c.active) && (!applied || c.code.includes(applied) || c.name.includes(applied)))
  const title = mode === 'search' ? '일정구분검색' : '일정구분리스트'

  return (
    <>
      <Modal open title={title} width={780} error={edit ? null : error} onClose={onClose}>
        <div className="flex items-center mb-[8px]">
          <span className="text-[14px] font-bold">{title}</span>
          <div className="ml-auto flex gap-[4px]">
            <input className="ec-input w-[110px]" placeholder="입력 후 [Enter]" aria-label="일정구분 검색" value={keyword}
                   onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setApplied(keyword) }} />
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setApplied(keyword)}>Search(F3)</button>
          </div>
        </div>
        <table className="w-full table-fixed">
          <thead>
            <tr>
              {mode === 'list' && <th className="w-[34px]" />}
              <th>일정구분코드</th>
              <th>일정구분명</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={mode === 'list' ? 3 : 2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((c, i) => (
              <tr key={c.id} className={c.active ? '' : 'text-ec-hint'}>
                {mode === 'list' && <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>}
                <td>
                  <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                          onClick={() => {
                            if (mode === 'search') { onPick(c); return }
                            setNameMissing(false)
                            setEdit({ id: c.id, code: c.code, name: c.name, active: c.active })
                          }}>{c.code}</button>
                  {!c.active && <span className="ml-[6px] text-[11px]">(사용중단)</span>}
                </td>
                <td>{c.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[14px]">
          {mode === 'search' ? (
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => setMode('list')}>신규 및 수정</button>
          ) : (
            <>
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void openNew()}>신규(F2)</button>
              <button type="button" className="ec-btn" onClick={() => setMode('search')}>이전</button>
            </>
          )}
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      {edit && (
        <Modal open title={edit.id == null ? '일정구분등록' : '일정구분수정'} width={780} error={error} onClose={() => setEdit(null)}>
          <div className="text-[14px] font-bold mb-[8px]">{edit.id == null ? '일정구분등록' : '일정구분수정'}</div>
          <div className="ec-form">
            <div className="grid grid-cols-[120px_1fr] gap-y-[6px] items-center text-[12px]">
              <span>일정구분코드</span>
              <input className="ec-input" aria-label="일정구분코드" placeholder="일정구분코드" maxLength={20} readOnly={edit.id != null}
                     value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
              <span>일정구분명</span>
              <span>
                <input className={`ec-input w-full ${nameMissing && !edit.name.trim() ? 'border-ec-danger' : ''}`} aria-label="일정구분명"
                       placeholder="일정구분명" maxLength={30} value={edit.name}
                       onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                {nameMissing && !edit.name.trim() && <span className="block text-ec-danger text-[11px] mt-[2px]">일정구분명을 입력 바랍니다.</span>}
              </span>
            </div>
          </div>
          <div className="flex gap-[6px] mt-[14px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
            {edit.id == null
              ? <button type="button" className="ec-btn" onClick={() => { setNameMissing(false); setEdit({ ...edit, name: '' }) }}>다시 작성</button>
              : <StopMenu active={edit.active} onPick={(a) => void act(edit.id!, a)} />}
            <button type="button" className="ec-btn" onClick={() => setEdit(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </>
  )
}
