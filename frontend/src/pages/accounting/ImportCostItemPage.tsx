import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import NumCheck from '../../features/bankcheck/components/NumCheck'
import type { ImportCostItem } from '../../features/importcost/api'

/**
 * 회계 II › 수입비용 › <b>비용항목등록</b>(원본 E060210, 제목 '비용항목리스트') — 2026-10-14 loginaa 실측.
 *
 * <ul>
 *   <li>격자: (번호) · 비용항목코드 · 비용항목명 · 정렬순서 · 사용구분(Yes). 하단 신규(F2) · 사용중단/재사용 · Excel.</li>
 *   <li>신규 창 '비용항목등록': 코드 · 비용명칭 · 정렬순서(숫자만 — 'abc' 는 빈칸). 빈 채 저장 → 세 칸 다 빨강,
 *       있는 코드 → '이미 비용항목등록에 존재하는 코드입니다.'. 저장하면 창이 닫히고, 서류징수 화면의 [비용항목] 과 수입관리대장 열에 바로 나온다.</li>
 * </ul>
 */
export default function ImportCostItemPage() {
  const [rows, setRows] = useState<ImportCostItem[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const blank = { id: null as number | null, code: '', name: '', sortOrder: '', active: true }
  const [f, setF] = useState(blank)

  function load() {
    setError('')
    api.get<ImportCostItem[]>('/import-costs/items').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  function openNew() { setF(blank); setFormError(''); setInvalid(false); setOpen(true) }
  function openEdit(i: ImportCostItem) {
    setF({ id: i.id, code: i.code, name: i.name, sortOrder: String(i.sortOrder), active: i.active })
    setFormError(''); setInvalid(false); setOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.code.trim() || !f.name.trim() || f.sortOrder === '') { setInvalid(true); setFormError(''); return }
    try {
      if (f.id) await api.put(`/import-costs/items/${f.id}`, { name: f.name.trim(), sortOrder: Number(f.sortOrder), active: f.active })
      else await api.post('/import-costs/items', { code: f.code.trim(), name: f.name.trim(), sortOrder: Number(f.sortOrder) })
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function toggle(ids: number[]) {
    if (ids.length === 0) { setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    try {
      for (const id of ids) {
        const i = rows.find((r) => r.id === id)
        if (i) await api.put(`/import-costs/items/${id}`, { name: i.name, sortOrder: i.sortOrder, active: !i.active })
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const shown = rows.filter((i) => !quick || i.code.includes(quick) || i.name.includes(quick))
  const allChecked = shown.length > 0 && shown.every((i) => checked.has(i.id))
  const red = (bad: boolean) => (invalid && bad ? 'border-ec-danger' : '')

  return (
    <EcListShell
      title="비용항목리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={openNew}
      actions={[
        { label: '사용중단/재사용', onClick: () => void toggle([...checked]) },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[40px] text-center">
              <NumCheck no="" head label="전체선택" on={allChecked} onChange={(v) => setChecked(v ? new Set(shown.map((i) => i.id)) : new Set())} />
            </th>
            <th>비용항목코드</th>
            <th>비용항목명</th>
            <th>정렬순서</th>
            <th>사용구분</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((i, n) => (
            <tr key={i.id} className={i.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <NumCheck no={n + 1} label={`${i.code} 선택`} on={checked.has(i.id)}
                          onChange={(v) => setChecked((s) => { const n = new Set(s); if (v) n.add(i.id); else n.delete(i.id); return n })} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(i) }}>{i.code}</a></td>
              <td>{i.name}</td>
              <td>{i.sortOrder}</td>
              <td>{i.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title="비용항목등록" width={620} onClose={() => setOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className={`ec-input w-full ${red(!f.code.trim())}`} aria-label="코드" placeholder="코드" autoFocus
                         value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">비용명칭</span>
              <div className="form">
                <input className={`ec-input w-full ${red(!f.name.trim())}`} aria-label="비용명칭" placeholder="비용명칭"
                       value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">정렬순서</span>
              <div className="form">
                {/* 원본은 숫자만 받는다 — 글자를 치면 빈칸으로 남는다 */}
                <input className={`ec-input w-[120px] ${red(f.sortOrder === '')}`} aria-label="정렬순서" placeholder="정렬순서" inputMode="numeric"
                       value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value.replace(/\D/g, '') })} />
              </div>
            </li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => {
              const i = rows.find((r) => r.id === f.id)
              if (i) openEdit(i); else openNew()
            }}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
