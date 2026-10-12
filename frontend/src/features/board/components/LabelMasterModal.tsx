import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { useShortcut } from '../../../utils/useShortcut'
import { fetchLabels, LABEL_DEFAULT_COLOR, LABEL_PALETTE, type BoardLabel } from '../labels'
import LabelChip from './LabelChip'

/** [사용중단/재사용 ▲] — 펴면 사용중단 · 삭제 · 재사용(원본 차례). */
function StopMenu({ disabled, onPick }: { disabled?: boolean; onPick: (a: 'stop' | 'delete' | 'reuse') => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <button type="button" className="ec-btn disabled:opacity-45" disabled={disabled} onClick={() => setOpen((v) => !v)}>사용중단/재사용 ▴</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[120px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
            {([['stop', '사용중단'], ['delete', '삭제'], ['reuse', '재사용']] as const).map(([k, l]) => (
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
 * 원본 공지사항 · WORK 의 [라벨] › + 가 여는 '라벨조회' 창(2026-10-12 loginaa E200080 실측).
 * 격자 [라벨코드▼][라벨명▼](칩), 하단 [신규(F2)][사용중단/재사용 ▲][닫기]. 라벨코드를 누르면 '라벨수정'.
 * '라벨등록'은 라벨코드 · 라벨명 · 색상(팔레트 11색 × 7단 + 다른색, 기본 검정) · 미리보기, [저장(F8)][다시작성][닫기].
 * 비우고 저장하면 문구 없이 빈 칸만 빨갛다. 저장하면 목록으로 돌아온다. 수정 창에서는 코드가 막히고
 * [사용중단/재사용 ▲] 이 붙는다 — [삭제]는 묻지 않고 지운다.
 */
export default function LabelMasterModal({ board, onClose }: { board: string; onClose: () => void }) {
  const [labels, setLabels] = useState<BoardLabel[]>([])
  const [keyword, setKeyword] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  /** 열어 둔 등록 · 수정 창. id 가 있으면 '라벨수정'. */
  const [edit, setEdit] = useState<{ id: number | null; code: string; name: string; color: string } | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  async function load() {
    try { setLabels(await fetchLabels(board)) } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [board])

  const openNew = () => { setInvalid(false); setEdit({ id: null, code: '', name: '', color: LABEL_DEFAULT_COLOR }) }
  useShortcut('F2', openNew, !edit)
  useShortcut('F8', () => void save(), !!edit)

  async function save() {
    if (!edit) return
    setError('')
    if (!edit.code.trim() || !edit.name.trim()) return setInvalid(true)
    try {
      const body = { board, code: edit.code.trim(), name: edit.name.trim(), color: edit.color }
      if (edit.id == null) await api.post('/work-post-labels', body)
      else await api.put(`/work-post-labels/${edit.id}`, body)
      setEdit(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function act(ids: number[], a: 'stop' | 'delete' | 'reuse') {
    setError('')
    try {
      for (const id of ids) {
        if (a === 'delete') await api.delete(`/work-post-labels/${id}`)
        else await api.patch(`/work-post-labels/${id}/active`, null, { params: { active: a === 'reuse' } })
      }
      setChecked(new Set())
      setEdit(null)
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = labels.filter((l) => !keyword || l.code.includes(keyword) || l.name.includes(keyword))

  return (
    <>
      <Modal open title="라벨조회" width={760} error={edit ? null : error} onClose={onClose}>
        <div className="flex items-center mb-[8px]">
          <span className="text-[14px] font-bold">라벨조회</span>
          <div className="ml-auto flex gap-[4px]">
            <input className="ec-input w-[110px]" placeholder="입력 후 [Enter]" aria-label="라벨 검색" value={keyword}
                   onChange={(e) => setKeyword(e.target.value)} />
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void load()}>Search(F3)</button>
          </div>
        </div>
        <table className="w-full table-fixed">
          <thead>
            <tr>
              <th className="w-[34px]" />
              <th>라벨코드</th>
              <th>라벨명</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((l, i) => (
              <tr key={l.id} className={l.active ? '' : 'text-ec-hint'}>
                <td className={`text-center cursor-pointer select-none ${checked.has(l.id) ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}
                    onClick={() => setChecked((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n })}>{i + 1}</td>
                <td>
                  <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                          onClick={() => { setInvalid(false); setEdit({ id: l.id, code: l.code, name: l.name, color: l.color }) }}>{l.code}</button>
                  {!l.active && <span className="ml-[6px] text-[11px]">(사용중단)</span>}
                </td>
                <td><LabelChip name={l.name} color={l.color} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={openNew}>신규(F2)</button>
          <StopMenu disabled={checked.size === 0} onPick={(a) => void act([...checked], a)} />
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      {edit && (
        <Modal open title={edit.id == null ? '라벨등록' : '라벨수정'} width={760} error={error} onClose={() => setEdit(null)}>
          <div className="text-[14px] font-bold mb-[8px]">{edit.id == null ? '라벨등록' : '라벨수정'}</div>
          <div className="ec-form">
            <div className="grid grid-cols-[120px_1fr] gap-y-[6px] items-center text-[12px]">
              <span>라벨코드</span>
              {edit.id == null
                ? <input className={`ec-input ${invalid && !edit.code.trim() ? 'border-ec-danger' : ''}`} aria-label="라벨코드" placeholder="라벨코드"
                         maxLength={20} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
                : <span>{edit.code}</span>}
              <span>라벨명</span>
              <input className={`ec-input ${invalid && !edit.name.trim() ? 'border-ec-danger' : ''}`} aria-label="라벨명" placeholder="라벨명"
                     maxLength={20} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <span>색상</span>
              <span className="relative">
                <button type="button" className="ec-btn ec-btn-sm" aria-label="색상" onClick={() => setPaletteOpen((v) => !v)}>
                  <LabelChip name="" color={edit.color} className="w-[14px] h-[14px] p-0 rounded-none align-middle" /> ▾
                </button>
                {paletteOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPaletteOpen(false)} />
                    <div className="absolute top-full left-0 mt-[2px] z-[41] p-[9px] bg-ec-panel border border-ec-line border-solid rounded-ec-panel">
                      <div className="flex gap-[3px]">
                        {LABEL_PALETTE.map((col) => (
                          <div key={col[0]} className="flex flex-col gap-[3px]">
                            {col.map((c) => (
                              <button key={c} type="button" aria-label={c} title={c}
                                      className={`no-ec w-[16px] h-[16px] p-0 border-solid cursor-pointer ${edit.color === c ? 'border-2 border-ec-danger' : 'border-0'}`}
                                      ref={(el) => { if (el) el.style.backgroundColor = c }}
                                      onClick={() => { setEdit({ ...edit, color: c }); setPaletteOpen(false) }} />
                            ))}
                          </div>
                        ))}
                      </div>
                      <label className="flex items-center gap-[6px] mt-[8px] text-[12px] cursor-pointer">
                        다른색
                        <input type="color" aria-label="다른색" value={edit.color}
                               onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
                      </label>
                    </div>
                  </>
                )}
              </span>
              <span>미리보기</span>
              <span><LabelChip name={edit.name} color={edit.color} className="min-w-[40px] min-h-[18px]" /></span>
            </div>
          </div>
          <div className="flex gap-[6px] mt-[14px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => { setInvalid(false); setEdit({ ...edit, name: edit.id == null ? '' : edit.name, code: edit.id == null ? '' : edit.code, color: LABEL_DEFAULT_COLOR }) }}>다시작성</button>
            {edit.id != null && <StopMenu onPick={(a) => void act([edit.id!], a)} />}
            <button type="button" className="ec-btn" onClick={() => setEdit(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </>
  )
}
