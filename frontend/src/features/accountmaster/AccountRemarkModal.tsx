import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import { ecAlert, ecConfirm, NO_SELECTION_MESSAGE } from '../../components/EcDialog'

interface Remark { id: number; code: string; name: string }

/**
 * 계정등록 목록 [적요] '등록' → 창 '적요리스트'(784 · ☐ · 적요코드 · 적요명, [신규(F2)] [선택삭제] [닫기]).
 * [신규(F2)] → '적요등록'(적요코드 다음 번호 01 · 적요명, [저장(F8)] [닫기]) — 빈 적요명 저장은 칸 아래 '적요명을 입력합니다.'.
 * 줄을 누르면 같은 창이 열리고 코드는 글자, 단추 [저장(F8)] [삭제] [닫기] — [삭제] 는 '삭제하겠습니까?' (2026-10-22 loginaa 실측).
 */
export default function AccountRemarkModal({ account, onClose }: {
  account: { id: number; code: string; name: string } | null
  onClose: () => void
}) {
  const [rows, setRows] = useState<Remark[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [edit, setEdit] = useState<{ id: number | null; code: string; name: string } | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState('')
  const base = account ? `/accounts/${account.id}/remarks` : ''

  function load() {
    if (!account) return
    api.get<Remark[]>(base).then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
    setChecked(new Set())
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (account) { setError(''); load() } }, [account?.id])

  async function openNew() {
    const { data } = await api.get<{ code: string }>(`/accounts/${account!.id}/remarks/next-code`)
    setInvalid(false); setEdit({ id: null, code: data.code, name: '' })
  }
  async function save() {
    if (!edit) return
    if (!edit.name.trim()) { setInvalid(true); return }
    try {
      if (edit.id) await api.put(`${base}/${edit.id}`, { name: edit.name })
      else await api.post(base, { code: edit.code, name: edit.name })
      setEdit(null); load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function remove(ids: number[]) {
    if (ids.length === 0) { await ecAlert(NO_SELECTION_MESSAGE); return }
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try { for (const id of ids) await api.delete(`${base}/${id}`) } catch (e) { setError(extractErrorMessage(e)) }
    setEdit(null); load()
  }

  return (
    <>
      <Modal open={!!account} title="적요리스트" width={784} error={error} onClose={onClose}>
        <table className="w-full text-left mb-[10px]">
          <thead>
            <tr>
              <th className="w-[34px] text-center">
                <input type="checkbox" aria-label="전체 선택" checked={rows.length > 0 && checked.size === rows.length}
                       onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
              </th>
              <th className="w-[160px]">적요코드</th>
              <th>적요명</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${r.code} 선택`} checked={checked.has(r.id)}
                         onChange={(e) => setChecked((s) => { const x = new Set(s); if (e.target.checked) x.add(r.id); else x.delete(r.id); return x })} />
                </td>
                <td><button type="button" className="ec-link" onClick={() => { setInvalid(false); setEdit({ id: r.id, code: r.code, name: r.name }) }}>{r.code}</button></td>
                <td><button type="button" className="ec-link" onClick={() => { setInvalid(false); setEdit({ id: r.id, code: r.code, name: r.name }) }}>{r.name}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void openNew()}>신규(F2)</button>
          <button type="button" className="ec-btn" onClick={() => void remove([...checked])}>선택삭제</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
      <Modal open={!!edit} title="적요등록" width={600} onClose={() => setEdit(null)}>
        {edit && (
          <form onSubmit={(e) => { e.preventDefault(); void save() }}
                onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
            <ul className="ec-form">
              <li className="wide"><span className="title">적요코드</span>
                <div className="form">{edit.id ? <span>{edit.code}</span> : (
                  <input className="ec-input w-[160px]" aria-label="적요코드" maxLength={10} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
                )}</div></li>
              <li className="wide"><span className="title">적요명</span>
                <div className="form">
                  <input className={`ec-input w-full ${invalid && !edit.name.trim() ? 'border-ec-danger' : ''}`} aria-label="적요명" maxLength={100} autoFocus
                         value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  {invalid && !edit.name.trim() && <div className="text-ec-danger text-[11px]">적요명을 입력합니다.</div>}
                </div></li>
            </ul>
            <div className="flex gap-[4px] mt-[12px]">
              <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
              {edit.id && <button type="button" className="ec-btn" onClick={() => void remove([edit.id!])}>삭제</button>}
              <button type="button" className="ec-btn" onClick={() => setEdit(null)}>닫기</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
