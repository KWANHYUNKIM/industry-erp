import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import { ecConfirm, requireSelection } from '../../components/EcDialog'
import { EcCond } from '../../components/EcStatusPanel'

export interface ContractItem { id: number; name: string; value: string | null }

const DELETE_ASK = '삭제하겠습니까?\n전송정보입력이 된 경우 해당 코드에 입력된 내용이 같이 삭제됩니다.'

/**
 * 근로계약서진행단계 [수신정보입력] › 계약참여자1 [항목등록] → '항목리스트' 창 (원본 C061103, 2026-10-24 실측).
 *
 * <p>격자 □ 번호 · 항목명(링크 → '항목수정'), 아래 [신규(F2)] [삭제] [닫기]. 항목은 계약서마다 따로다(다른 계약서는 '등록된 데이터가 없습니다.').
 * '항목등록' 창은 항목명 칸 하나(빈칸이면 빨간 테만, 안내 없음) + [저장(F8)] [닫기] — 저장하면 안내 없이 닫히고 리스트 끝에 붙는다.
 * '항목수정' 은 [저장(F8)] [삭제] [닫기], [삭제] 는 '삭제하겠습니까? 전송정보입력이 된 경우 해당 코드에 입력된 내용이 같이 삭제됩니다.' → 안내 없이 닫힘.
 * 등록한 항목은 원본 [전송정보입력] 격자에 열로 붙는다 — 우리는 수신정보입력 창에 항목마다 값 칸을 단다.
 */
export default function ContractItemsModal({ contractId, open, onClose, onChanged }: {
  contractId: number; open: boolean; onClose: () => void; onChanged: () => void
}) {
  const [items, setItems] = useState<ContractItem[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  /** null = 닫힘, 0 = 항목등록, 그 밖 = 항목수정(그 id) */
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [bad, setBad] = useState(false)

  function load() {
    api.get<ContractItem[]>(`/employment-contracts/${contractId}/items`)
      .then((r) => { setItems(r.data); setChecked(new Set()) })
      .catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { if (open) { setError(''); load() } }, [open, contractId]) // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit(it: ContractItem | null) { setEditId(it ? it.id : 0); setName(it ? it.name : ''); setBad(false) }

  async function save() {
    if (!name.trim()) { setBad(true); return }
    try {
      if (editId) await api.put(`/employment-contracts/${contractId}/items/${editId}`, { name: name.trim() })
      else await api.post(`/employment-contracts/${contractId}/items`, { name: name.trim() })
      setEditId(null); load(); onChanged()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  async function remove(ids: number[]) {
    if (!(await ecConfirm(DELETE_ASK))) return
    try {
      for (const id of ids) await api.delete(`/employment-contracts/${contractId}/items/${id}`)
      setEditId(null); load(); onChanged()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  const toggle = (id: number) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <>
      <Modal error={error} open={open} title="항목리스트" onClose={onClose}>
        <table className="ec-list-grid w-full">
          <thead><tr><th className="w-[40px]" /><th>항목명</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={2} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
            {items.map((it, i) => (
              <tr key={it.id}>
                <td className="text-center">
                  <label className="inline-flex items-center gap-[3px]">
                    <input type="checkbox" checked={checked.has(it.id)} onChange={() => toggle(it.id)} />{i + 1}
                  </label>
                </td>
                <td><a href="#" onClick={(ev) => { ev.preventDefault(); openEdit(it) }}>{it.name}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[9px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => openEdit(null)}>신규(F2)</button>
          <button type="button" className="ec-btn" onClick={() => { if (requireSelection(checked.size)) void remove([...checked]) }}>삭제</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
      <Modal open={editId !== null} title={editId ? '항목수정' : '항목등록'} onClose={() => setEditId(null)}>
        <form onSubmit={(ev) => { ev.preventDefault(); void save() }}>
          <ul className="ec-form">
            <EcCond label="항목명" span="full">
              <input aria-label="항목명" className={`ec-input w-full${bad ? ' ec-invalid' : ''}`} placeholder="항목명" value={name}
                     onChange={(e) => { setName(e.target.value); setBad(false) }} autoFocus />
            </EcCond>
          </ul>
          <div className="flex gap-[6px] mt-[9px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            {editId ? <button type="button" className="ec-btn" onClick={() => void remove([editId])}>삭제</button> : null}
            <button type="button" className="ec-btn" onClick={() => setEditId(null)}>닫기</button>
          </div>
        </form>
      </Modal>
    </>
  )
}
