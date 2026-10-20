import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import EcDateField from '../../components/EcDateField'
import { ymd } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import NumCheck from '../../components/NumCheck'
import type { Partner } from '../../types/api'
import type { ImportLot } from '../../features/importcost/api'

/** 신규 창 [최초거래일] 처음 값 — 원본은 전월 1일(2026-10-14 실측 '2026 / 09 / 01'). */
function prevMonthFirst(): string {
  const d = new Date()
  return ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1))
}

/**
 * 회계 II › 수입비용 › <b>관리번호등록</b>(원본 E060201, 제목 '관리번호코드리스트') — 2026-10-14 loginaa 실측.
 *
 * <ul>
 *   <li>격자: (번호 체크칸) · 관리번호코드 · 관리번호명 · 거래처명 · 최초거래일 · 적요, 코드 오름차순. 하단 신규(F2) · 사용중단/재사용 · Excel.</li>
 *   <li>신규 창 '관리번호등록': 관리번호코드(다음 번호 '000000004' 자동, 고칠 수 있음) · 관리번호명 · 거래처(거래처검색) · 최초거래일(전월 1일) · 적요.
 *       빈 채 저장하면 관리번호명 · 거래처가 빨개진다. 저장하면 안내 없이 닫힌다.</li>
 *   <li>수정 창: 코드가 글자로 잠기고 [사용중단/재사용] 이 붙는다. <b>삭제 단추가 없다</b>(원본 그대로).</li>
 * </ul>
 */
export default function ImportLotPage() {
  const [rows, setRows] = useState<ImportLot[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const blank = { id: null as number | null, code: '', name: '', partnerId: '', firstTradeDate: prevMonthFirst(), remark: '', active: true }
  const [f, setF] = useState(blank)

  function load() {
    setError('')
    Promise.all([api.get<ImportLot[]>('/import-costs/lots'), api.get<Partner[]>('/partners')])
      .then(([l, p]) => { setRows(l.data); setPartners(p.data) })
      .catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  async function openNew() {
    setFormError(''); setInvalid(false)
    let code = ''
    try { code = (await api.get<{ code: string }>('/import-costs/lots/next-code')).data.code } catch { /* 비워 두면 서버가 매긴다 */ }
    setF({ ...blank, code }); setOpen(true)
  }
  function openEdit(l: ImportLot) {
    setF({ id: l.id, code: l.code, name: l.name, partnerId: String(l.partnerId), firstTradeDate: l.firstTradeDate ?? '',
      remark: l.remark ?? '', active: l.active })
    setFormError(''); setInvalid(false); setOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.name.trim() || !f.partnerId) { setInvalid(true); return }
    const body = { name: f.name.trim(), partnerId: Number(f.partnerId), firstTradeDate: f.firstTradeDate || null, remark: f.remark }
    try {
      if (f.id) await api.put(`/import-costs/lots/${f.id}`, { ...body, active: f.active })
      else await api.post('/import-costs/lots', { code: f.code.trim() || undefined, ...body })
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  /** 원본 [사용중단/재사용] — 확인 창 없이 뒤집는다. */
  async function toggle(ids: number[]) {
    if (ids.length === 0) { setError('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    try {
      for (const id of ids) {
        const l = rows.find((r) => r.id === id)
        if (!l) continue
        await api.put(`/import-costs/lots/${id}`, { name: l.name, partnerId: l.partnerId, firstTradeDate: l.firstTradeDate,
          remark: l.remark, active: !l.active })
      }
      if (open && f.id) setF({ ...f, active: !f.active })
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const has = (v: string | null | undefined, q: string) => (v ?? '').includes(q)
  const shown = rows.filter((l) => !quick || has(l.code, quick) || has(l.name, quick) || has(l.partnerName, quick))
  const allChecked = shown.length > 0 && shown.every((l) => checked.has(l.id))
  const partnerItems = partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))

  return (
    <EcListShell
      title="관리번호코드리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={() => void openNew()}
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
              <NumCheck no="" head label="전체선택" on={allChecked} onChange={(v) => setChecked(v ? new Set(shown.map((l) => l.id)) : new Set())} />
            </th>
            <th>관리번호코드</th>
            <th>관리번호명</th>
            <th>거래처명</th>
            <th>최초거래일</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((l, i) => (
            <tr key={l.id} className={l.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <NumCheck no={i + 1} label={`${l.code} 선택`} on={checked.has(l.id)}
                          onChange={(v) => setChecked((s) => { const n = new Set(s); if (v) n.add(l.id); else n.delete(l.id); return n })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => openEdit(l)}>{l.code}</button></td>
              <td>{l.name}</td>
              <td>{l.partnerName}</td>
              <td>{l.firstTradeDate ? l.firstTradeDate.replace(/-/g, '/') : ''}</td>
              <td>{l.remark ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title="관리번호등록" width={780} onClose={() => setOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide">
              <span className="title">관리번호코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className="ec-input w-full" aria-label="관리번호코드" placeholder="관리번호코드" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li className="wide">
              <span className="title">관리번호명</span>
              <div className="form">
                <input className={`ec-input w-full ${invalid && !f.name.trim() ? 'border-ec-danger' : ''}`} aria-label="관리번호명" placeholder="관리번호명" autoFocus
                       value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">거래처</span>
              <div className={`form ${invalid && !f.partnerId ? '[&_.ec-input]:border-ec-danger' : ''}`}>
                <CodePickerField label="거래처" hideLabel pair fill placeholder="거래처" popupTitle="거래처검색" emptyLabel="선택 해제"
                                 value={f.partnerId} items={partnerItems} onChange={(v) => setF({ ...f, partnerId: v })} />
              </div>
            </li>
            <li className="wide">
              <span className="title">최초거래일</span>
              <div className="form"><EcDateField value={f.firstTradeDate} onChange={(v) => setF({ ...f, firstTradeDate: v })} /></div>
            </li>
            <li className="wide">
              <span className="title">적요</span>
              <div className="form"><input className="ec-input w-full" aria-label="적요" placeholder="적요" value={f.remark} onChange={(e) => setF({ ...f, remark: e.target.value })} /></div>
            </li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => {
              const l = rows.find((r) => r.id === f.id)
              if (l) openEdit(l); else void openNew()
            }}>다시 작성</button>
            {f.id && <button type="button" className="ec-btn" onClick={() => void toggle([f.id as number])}>사용중단/재사용</button>}
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
