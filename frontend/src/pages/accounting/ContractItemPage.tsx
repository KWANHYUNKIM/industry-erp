import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import GridCode from '../../components/GridCode'
import EcNumInput from '../../components/EcNumInput'
import type { CodeItem } from '../../components/CodePickerField'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { won, type BillingCycle, type ContractItemRow } from '../../features/billingcontract/types'

interface Form { id: number | null; code: string; name: string; unitPrice: string; vatIncluded: boolean; billingCycle: BillingCycle; salesAccountId: string }
const blank = (): Form => ({ id: null, code: '', name: '', unitPrice: '0', vatIncluded: false, billingCycle: 'ONCE', salesAccountId: '' })

/**
 * 회계 II › 계약관리 › <b>계약항목등록</b>(E060901 계약항목리스트) — 2026-10-13 loginaa 실측.
 *
 * <p>열: 계약항목코드 · 계약항목명 · 청구주기 · 단가 · 품목별단가 · 수량별단가 · 사용구분(Yes/No). 버튼: 신규(F2) · 사용중단/재사용 · Excel.
 * [신규] 창 '계약항목등록': 계약항목코드(5자) · 계약항목명(비우고 저장하면 둘 다 빨갛게) · 단가 + VAT포함 · 청구주기(1회 기본 · 주기적) · 매출계정.
 * 저장하면 창이 닫히고 목록 끝에 붙는다(코드 차례). 품목별 · 수량별단가 [설정] 창은 아직 재지 않아 열만 비워 둔다.
 */
export default function ContractItemPage() {
  const [rows, setRows] = useState<ContractItemRow[]>([])
  const [accounts, setAccounts] = useState<CodeItem[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '계약항목리스트', [rows.length])

  async function load() {
    try {
      setRows((await api.get<ContractItemRow[]>('/contract-items')).data)
      setPicked(new Set())
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  useEffect(() => {
    void load()
    api.get<{ id: number; code: string; name: string }[]>('/accounts')
      .then((r) => setAccounts(r.data.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))))
      .catch(() => setAccounts([]))
  }, [])

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f))
  async function save() {
    if (!form) return
    const bad = new Set<string>()
    if (!form.code.trim()) bad.add('code')
    if (!form.name.trim()) bad.add('name')
    setInvalid(bad)
    if (bad.size) return
    const body = { code: form.code.trim(), name: form.name.trim(), unitPrice: Number(form.unitPrice) || 0, vatIncluded: form.vatIncluded,
      billingCycle: form.billingCycle, salesAccountId: form.salesAccountId ? Number(form.salesAccountId) : null }
    try {
      if (form.id) await api.put(`/contract-items/${form.id}`, body)
      else await api.post('/contract-items', body)
      setForm(null)
      await load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function toggleActive() {
    const chosen = rows.filter((r) => picked.has(r.id))
    if (!chosen.length) return
    try {
      await api.post('/contract-items/active', { ids: chosen.map((r) => r.id), active: !chosen[0].active })
      await load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  const edit = (r: ContractItemRow) => { setInvalid(new Set()); setForm({ id: r.id, code: r.code, name: r.name, unitPrice: String(Number(r.unitPrice)),
    vatIncluded: r.vatIncluded, billingCycle: r.billingCycle, salesAccountId: r.salesAccountId != null ? String(r.salesAccountId) : '' }) }
  const bad = (k: string) => (invalid.has(k) ? ' outline outline-1 outline-ec-danger' : '')

  return (
    <EcListShell
      title="계약항목리스트"
      searchable={false}
      actions={[
        { label: '신규(F2)', primary: true, onClick: () => { setInvalid(new Set()); setForm(blank()) } },
        { label: '사용중단/재사용', disabled: picked.size === 0, onClick: () => void toggleActive() },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full">
        <thead>
          <tr>
            <th className="w-[34px]">
              <input type="checkbox" aria-label="전체 선택" checked={rows.length > 0 && picked.size === rows.length}
                     onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
            </th>
            <th>계약항목코드</th>
            <th>계약항목명</th>
            <th className="text-center">청구주기</th>
            <th className="text-right">단가</th>
            <th className="text-right">품목별단가</th>
            <th className="text-right">수량별단가</th>
            <th className="text-center">사용구분</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${r.code} 선택`} checked={picked.has(r.id)}
                       onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); edit(r) }}>{r.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); edit(r) }}>{r.name}</a></td>
              <td className="text-center">{r.billingCycleName}</td>
              <td className="text-right">{Number(r.unitPrice) ? won(r.unitPrice) : ''}</td>
              <td className="text-right" />
              <td className="text-right" />
              <td className="text-center">{r.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!form} title="계약항목등록" width={780} error={error} onClose={() => setForm(null)}>
        {form && (
          <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
            <h3 className="text-[14px] font-bold mb-[8px]">계약항목등록</h3>
            <ul className="ec-cond mb-[8px] grid grid-cols-1 gap-[6px]">
              <li className="flex items-center gap-[8px]">
                <span className="w-[120px] text-ec-hint">계약항목코드</span>
                <input className={`ec-input flex-1${bad('code')}`} aria-label="계약항목코드" maxLength={5} value={form.code}
                       aria-invalid={invalid.has('code')} onChange={(e) => set({ code: e.target.value })} />
              </li>
              <li className="flex items-center gap-[8px]">
                <span className="w-[120px] text-ec-hint">계약항목명</span>
                <input className={`ec-input flex-1${bad('name')}`} aria-label="계약항목명" maxLength={100} value={form.name}
                       aria-invalid={invalid.has('name')} onChange={(e) => set({ name: e.target.value })} />
              </li>
              <li className="flex items-center gap-[8px]">
                <span className="w-[120px] text-ec-hint">단가</span>
                <EcNumInput className="ec-input flex-1 text-right" aria-label="단가" value={form.unitPrice} onValue={(v) => set({ unitPrice: v })} />
                <label className="inline-flex items-center gap-[3px]">
                  <input type="checkbox" checked={form.vatIncluded} onChange={(e) => set({ vatIncluded: e.target.checked })} /> VAT포함
                </label>
              </li>
              <li className="flex items-center gap-[8px]">
                <span className="w-[120px] text-ec-hint">청구주기</span>
                {(['ONCE', 'PERIODIC'] as BillingCycle[]).map((c) => (
                  <label key={c} className="inline-flex items-center gap-[3px] mr-[10px]">
                    <input type="radio" name="billingCycle" checked={form.billingCycle === c} onChange={() => set({ billingCycle: c })} />
                    {c === 'ONCE' ? '1회' : '주기적'}
                  </label>
                ))}
              </li>
              <li className="flex items-center gap-[8px]">
                <span className="w-[120px] text-ec-hint">매출계정</span>
                <span className="flex-1">
                  <GridCode title="계정검색" codeHead="계정코드" nameHead="계정명" items={accounts} value={form.salesAccountId}
                            onPick={(v) => set({ salesAccountId: v })} />
                </span>
              </li>
            </ul>
            <div className="flex gap-[5px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
              <button type="button" className="ec-btn" onClick={() => setForm(form.id ? form : blank())}>다시 작성</button>
              <button type="button" className="ec-btn" onClick={() => setForm(null)}>닫기</button>
            </div>
          </div>
        )}
      </Modal>
    </EcListShell>
  )
}
