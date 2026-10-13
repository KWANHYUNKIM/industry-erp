import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import { api, extractErrorMessage } from '../../../api/client'
import { useShortcut } from '../../../utils/useShortcut'

export interface FieldVehicle { id: number; code: string; name: string; vehicle: boolean; carType: string | null; active: boolean }

/** 원본 '이동수단등록'의 [차종] 고르기 차례(2026-10-03 실측). */
const CAR_TYPES = ['경차', '소형차', '준중형차', '중형차', '대형차', '승합차', '화물차'] as const

type Form = { code: string; name: string; vehicle: boolean; carType: string }
const blank = (): Form => ({ code: '', name: '', vehicle: true, carType: '경차' })

/**
 * 외근입력 [이동수단] 코드도움 — 원본 세 창을 그대로 잇는다(E070254, 2026-10-03 실측).
 * <ol>
 *   <li><b>이동수단검색</b> — [차량번호▼][차량명▼][차종▼], 줄을 누르면 고른다. 하단 [신규 및 수정][닫기].</li>
 *   <li><b>이동수단리스트</b> — 같은 칸에 행번호, 사용중단까지. 하단 [신규(F2)][이전][사용중단/재사용][닫기].</li>
 *   <li><b>이동수단등록</b> — 이동수단코드 · 이동수단명 · 구분(차량 / 차량아님) · 차종(경차 기본), [저장(F8)][닫기].</li>
 * </ol>
 */
export default function VehiclePicker({ open, onClose, onPick }: {
  open: boolean
  onClose: () => void
  onPick: (v: FieldVehicle) => void
}) {
  const [view, setView] = useState<'search' | 'list'>('search')
  const [rows, setRows] = useState<FieldVehicle[]>([])
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  /** 이동수단등록 창 — editId 가 있으면 고친다. */
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [formErr, setFormErr] = useState('')

  async function load(v = view) {
    try { setRows((await api.get<FieldVehicle[]>('/field-vehicles', { params: { all: v === 'list' } })).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setView('search'); setSelected(new Set()); setError(''); void load('search') } }, [open])

  function go(v: 'search' | 'list') { setView(v); setSelected(new Set()); void load(v) }

  function openForm(v: FieldVehicle | null) {
    setEditId(v?.id ?? null)
    setForm(v ? { code: v.code, name: v.name, vehicle: v.vehicle, carType: v.carType ?? '경차' } : blank())
    setFormErr('')
    setFormOpen(true)
  }
  useShortcut('F2', () => openForm(null), open && view === 'list' && !formOpen)
  useShortcut('F8', () => void save(), formOpen)

  async function save() {
    setFormErr('')
    if (!form.code.trim()) return setFormErr('이동수단코드를 입력하세요.')
    if (!form.name.trim()) return setFormErr('이동수단명을 입력하세요.')
    const body = { code: form.code.trim(), name: form.name.trim(), vehicle: form.vehicle, carType: form.vehicle ? form.carType : null }
    try {
      if (editId != null) await api.put(`/field-vehicles/${editId}`, body)
      else await api.post('/field-vehicles', body)
      setFormOpen(false)
      void load()
    } catch (err) { setFormErr(extractErrorMessage(err)) }
  }

  /** 원본 [사용중단/재사용] — 고른 줄의 사용여부를 뒤집는다. */
  async function toggleActive() {
    for (const v of rows.filter((r) => selected.has(r.id))) {
      try { await api.put(`/field-vehicles/${v.id}`, { code: v.code, name: v.name, vehicle: v.vehicle, carType: v.carType, active: !v.active }) }
      catch (err) { setError(extractErrorMessage(err)) }
    }
    setSelected(new Set())
    void load()
  }

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <>
      <Modal error={error} open={open} title={view === 'search' ? '이동수단검색' : '이동수단리스트'} width={780} onClose={onClose}>
        <table className="w-full text-left">
          <thead>
            <tr>
              {view === 'list' && <th className="w-[34px]" />}
              <th className="text-center">차량번호 ▼</th>
              <th className="text-center">차량명 ▼</th>
              <th className="text-center">차종 ▼</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={view === 'list' ? 4 : 3} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((v, i) => (
              <tr key={v.id}>
                {view === 'list' && (
                  <td className={`text-center cursor-pointer ${selected.has(v.id) ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}
                      onClick={() => toggle(v.id)}>{i + 1}</td>
                )}
                <td>
                  <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-left text-ec-navy"
                          onClick={() => (view === 'search' ? onPick(v) : openForm(v))}>
                    {v.code}
                  </button>
                </td>
                <td>{v.name}{v.active ? '' : ' (사용중단)'}</td>
                <td>{v.carType ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[10px]">
          {view === 'search' ? (
            <>
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => go('list')}>신규 및 수정</button>
              <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
            </>
          ) : (
            <>
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => openForm(null)}>신규(F2)</button>
              <button type="button" className="ec-btn" onClick={() => go('search')}>이전</button>
              <button type="button" className="ec-btn disabled:opacity-45" disabled={selected.size === 0} onClick={() => void toggleActive()}>사용중단/재사용</button>
              <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
            </>
          )}
        </div>
      </Modal>

      {/* 원본 '이동수단등록' */}
      <Modal error={formErr} open={formOpen} title="이동수단등록" width={640} onClose={() => setFormOpen(false)}>
        <ul className="ec-form mb-[10px]">
          <li className="wide">
            <div className="title">이동수단코드</div>
            <div className="form"><input className="ec-input w-full" placeholder="이동수단코드" maxLength={30} value={form.code}
                                         onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
          </li>
          <li className="wide">
            <div className="title">이동수단명</div>
            <div className="form"><input className="ec-input w-full" placeholder="이동수단명" maxLength={100} value={form.name}
                                         onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          </li>
          <li className="wide">
            <div className="title">구분</div>
            <div className="form flex-col items-start gap-[6px]">
              <div className="flex gap-[12px]">
                <label className="inline-flex items-center gap-[4px] cursor-pointer">
                  <input type="radio" name="vehicle-kind" checked={form.vehicle} onChange={() => setForm((f) => ({ ...f, vehicle: true }))} />차량
                </label>
                <label className="inline-flex items-center gap-[4px] cursor-pointer">
                  <input type="radio" name="vehicle-kind" checked={!form.vehicle} onChange={() => setForm((f) => ({ ...f, vehicle: false }))} />차량아님
                </label>
              </div>
              {form.vehicle && (
                <div className="flex items-center gap-[6px] w-full">
                  <span className="text-ec-label">차종</span>
                  <select className="ec-input flex-1" aria-label="차종" value={form.carType}
                          onChange={(e) => setForm((f) => ({ ...f, carType: e.target.value }))}>
                    {CAR_TYPES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </div>
          </li>
        </ul>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
        </div>
      </Modal>
    </>
  )
}
