import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import EcListShell from '../../../components/EcListShell'
import Modal from '../../../components/Modal'
import GridCode from '../../../components/codepicker/GridCode'
import EcNumInput from '../../../components/EcNumInput'
import type { CodeItem } from '../../../components/codepicker/CodePickerField'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import type { BillingCycle, ContractItemRow, ProductLink, QtyPrice } from '../../../features/billingcontract/types'
import ProductLinkModal, { SetTag, type ProductOption } from '../../../features/billingcontract/ProductLinkModal'
import QtyPriceModal from '../../../features/billingcontract/QtyPriceModal'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { EcHistoryModal } from '../../../components/EcHistory'
import { ecConfirm, requireSelection } from '../../../components/EcDialog'
import { fmtAmountOf } from '../../../utils/format'

interface Form {
  id: number | null; code: string; name: string; unitPrice: string; vatIncluded: boolean; billingCycle: BillingCycle; salesAccountId: string
  products: ProductLink[]; qtyPrices: QtyPrice[]
}
const blank = (): Form => ({ id: null, code: '', name: '', unitPrice: '0', vatIncluded: false, billingCycle: 'ONCE', salesAccountId: '', products: [], qtyPrices: [] })
const productTotal = (ps: ProductLink[]) => ps.reduce((s, p) => s + Number(p.supplyAmount ?? 0), 0)
/** 조건 판 — 원본 Search(F3): 계약항목코드 · 계약항목명 · 단가 ~ · 청구주기(전체) · 매출계정 · 사용구분(사용 기본). */
interface Cond { code: string; name: string; priceFrom: string; priceTo: string; cycle: 'ALL' | BillingCycle; accountId: string; use: 'ALL' | 'Y' | 'N' }
const blankCond = (): Cond => ({ code: '', name: '', priceFrom: '', priceTo: '', cycle: 'ALL', accountId: '', use: 'Y' })

/**
 * 회계 II › 계약관리 › <b>계약항목등록</b>(E060901 계약항목리스트) — 2026-10-13 loginaa 실측.
 *
 * <p>열: 계약항목코드 · 계약항목명 · 청구주기 · 단가 · 품목별단가 · 수량별단가 · 사용구분(Yes/No). 버튼: 신규(F2) · 사용중단/재사용 · Excel.
 * [신규] 창 '계약항목등록': 계약항목코드(5자) · 계약항목명(비우고 저장하면 둘 다 빨갛게) · 단가 + VAT포함 · 청구주기(1회 기본 · 주기적) · 매출계정.
 * 저장하면 창이 닫히고 목록 끝에 붙는다(코드 차례).
 * <p>[품목별단가 › 설정] → '품목연결설정' 창(2026-10-13 실측, {@link ProductLinkModal}) — 고른 품목들의 공급가액 합계가 창의 품목별단가 칸과
 * 목록 [품목별단가] 열이 된다(00007 렌탈 품목관리 340,000). 계약입력 줄 [상세]가 이 설정을 복사해 쓰고, 그것을 [적용]한 계약 줄만
 * 회계/판매일괄반영 [판매반영]에 나온다. [수량별단가 › 설정] → {@link QtyPriceModal}(수량 N 이상 · 적용단가 · VAT포함 줄 목록 —
 * <b>원본 창 미실측</b>, 00003 목록 값 50,000 만 읽음). 목록 [수량별단가] 열은 첫 줄의 단가.
 * <p>매출계정 칸은 원본처럼 코드 + 계정명 두 칸('4019 | 상품매출', 2026-10-29 데이터이관 QA C2). 목록에서 F2 = [신규].
 */
export default function ContractItemPage() {
  const [rows, setRows] = useState<ContractItemRow[]>([])
  const [accounts, setAccounts] = useState<CodeItem[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [invalid, setInvalid] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [products, setProducts] = useState<ProductOption[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [qtyOpen, setQtyOpen] = useState(false)
  const [cond, setCond] = useState<Cond>(blankCond)
  const [applied, setApplied] = useState<Cond>(blankCond)
  const [quick, setQuick] = useState('')
  const [historyId, setHistoryId] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
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
    api.get<{ id: number; code: string; name: string }[]>('/accounts', { params: { slip: true } })
      .then((r) => setAccounts(r.data.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))))
      .catch(() => setAccounts([]))
    api.get<ProductOption[]>('/items').then((r) => setProducts(r.data)).catch(() => setProducts([]))
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
      billingCycle: form.billingCycle, salesAccountId: form.salesAccountId ? Number(form.salesAccountId) : null, products: form.products,
      qtyPrices: form.qtyPrices }
    try {
      if (form.id) await api.put(`/contract-items/${form.id}`, body)
      else await api.post('/contract-items', body)
      setForm(null)
      await load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function toggleActive(ids = rows.filter((r) => picked.has(r.id)).map((r) => r.id)) {
    const chosen = rows.filter((r) => ids.includes(r.id))
    if (!chosen.length) return
    try {
      await api.post('/contract-items/active', { ids: chosen.map((r) => r.id), active: !chosen[0].active })
      await load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  /** 목록 [사용중단/재사용] 펼침 — 원본은 사용중단 · 삭제 · 재사용 셋, 삭제는 '삭제하겠습니까?' 확인 뒤 지우고 목록만 다시 읽는다. */
  async function apply(op: '사용중단' | '삭제' | '재사용') {
    setMenuOpen(false)
    const ids = shown.filter((r) => picked.has(r.id)).map((r) => r.id)
    if (!requireSelection(ids.length)) return
    try {
      if (op === '삭제') {
        if (!(await ecConfirm('삭제하겠습니까?'))) return
        for (const id of ids) await api.delete(`/contract-items/${id}`)
      } else {
        await api.post('/contract-items/active', { ids, active: op === '재사용' })
      }
      await load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  const has =(v: string | null | undefined, q: string) => !q || (v ?? '').toLowerCase().includes(q.toLowerCase())
  const shown = rows.filter((r) => has(r.code, applied.code) && has(r.name, applied.name)
    && (!applied.priceFrom || Number(r.unitPrice) >= Number(applied.priceFrom))
    && (!applied.priceTo || Number(r.unitPrice) <= Number(applied.priceTo))
    && (applied.cycle === 'ALL' || r.billingCycle === applied.cycle)
    && (!applied.accountId || String(r.salesAccountId) === applied.accountId)
    && (applied.use === 'ALL' || (applied.use === 'Y') === r.active)
    && (!quick || has(r.code, quick) || has(r.name, quick)))
  const edit = (r: ContractItemRow) => { setInvalid(new Set()); setForm({ id: r.id, code: r.code, name: r.name, unitPrice: String(Number(r.unitPrice)),
    vatIncluded: r.vatIncluded, billingCycle: r.billingCycle, salesAccountId: r.salesAccountId != null ? String(r.salesAccountId) : '',
    products: r.products ?? [], qtyPrices: r.qtyPrices ?? [] }) }
  const bad = (k: string) => (invalid.has(k) ? ' outline outline-1 outline-ec-danger' : '')

  return (
    <EcListShell
      title="계약항목리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => setApplied(cond)}
      onReset={() => setCond(blankCond())}
      onNew={() => { if (form) return; setInvalid(new Set()); setForm(blank()) }}
      actions={[
        { label: '사용중단/재사용', onClick: () => setMenuOpen((v) => !v) },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond">
        <EcCond label="계약항목코드"><input className="ec-input w-full" aria-label="조건 계약항목코드" value={cond.code} onChange={(e) => setCond({ ...cond, code: e.target.value })} /></EcCond>
        <EcCond label="계약항목명"><input className="ec-input w-full" aria-label="조건 계약항목명" value={cond.name} onChange={(e) => setCond({ ...cond, name: e.target.value })} /></EcCond>
        <EcCond label="단가">
          <span className="flex items-center gap-[4px]">
            <EcNumInput className="ec-input w-full text-right" aria-label="단가 부터" value={cond.priceFrom} onValue={(v) => setCond({ ...cond, priceFrom: v })} />~
            <EcNumInput className="ec-input w-full text-right" aria-label="단가 까지" value={cond.priceTo} onValue={(v) => setCond({ ...cond, priceTo: v })} />
          </span>
        </EcCond>
        <EcCond label="청구주기">
          {([['ALL', '전체'], ['ONCE', '1회'], ['PERIODIC', '주기적']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="ci-cycle" checked={cond.cycle === v} onChange={() => setCond({ ...cond, cycle: v })} /> {l}</label>
          ))}
        </EcCond>
        <EcCond label="매출계정" pick>
          <CodePickerField label="매출계정" hideLabel fill placeholder="매출계정" value={cond.accountId} items={accounts}
                           onChange={(v) => setCond({ ...cond, accountId: v })} />
        </EcCond>
        <EcCond label="사용구분">
          {([['ALL', '전체'], ['Y', '사용'], ['N', '사용중단']] as const).map(([v, l]) => (
            <label key={v} className="mr-[10px]"><input type="radio" name="ci-use" checked={cond.use === v} onChange={() => setCond({ ...cond, use: v })} /> {l}</label>
          ))}
        </EcCond>
      </ul>
      {menuOpen && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuOpen(false)} />
          <div className="ec-menu fixed top-auto right-auto bottom-[44px] left-[300px] mobile:left-[16px]">
            {(['사용중단', '삭제', '재사용'] as const).map((op) => (
              <button key={op} type="button" onClick={() => void apply(op)}>{op}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table ref={tableRef} className="w-full">
        <thead>
          <tr>
            <th className="w-[34px]">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
                     onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
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
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${r.code} 선택`} checked={picked.has(r.id)}
                       onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} />
              </td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); edit(r) }}>{r.code}</a></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); edit(r) }}>{r.name}</a></td>
              <td className="text-center">{r.billingCycleName}</td>
              <td className="text-right">{Number(r.unitPrice) ? fmtAmountOf(r.unitPrice) : ''}</td>
              <td className="text-right">{r.productPrice != null ? fmtAmountOf(r.productPrice) : ''}</td>
              <td className="text-right">{r.qtyPrice != null ? fmtAmountOf(r.qtyPrice) : ''}</td>
              <td className="text-center">{r.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!form} title={form?.id ? '계약항목수정' : '계약항목등록'} width={780} error={error} onClose={() => setForm(null)}>
        {form && (
          <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
            <h3 className="text-[14px] font-bold mb-[8px]">{form.id ? '계약항목수정' : '계약항목등록'}</h3>
            <ul className="ec-cond mb-[8px] grid grid-cols-1 gap-[6px]">
              <li className="flex items-center gap-[8px]">
                <span className="w-[120px] text-ec-hint">계약항목코드</span>
                {/* 원본 수정 창은 코드가 글자로만 보인다(바꿀 수 없음) */}
                {form.id ? <span className="flex-1">{form.code}</span> : (
                  <input className={`ec-input flex-1${bad('code')}`} aria-label="계약항목코드" maxLength={5} value={form.code}
                         aria-invalid={invalid.has('code')} onChange={(e) => set({ code: e.target.value })} />)}
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
                <span className="w-[120px] text-ec-hint">품목별단가</span>
                {/* 원본: 막힌 칸(합계, 처음 0) · VAT포함(막힘) · [설정] 한 줄 */}
                <input className="ec-input flex-1 text-right" aria-label="품목별단가" disabled value={fmtAmountOf(productTotal(form.products))} />
                <label className="inline-flex items-center gap-[3px]">
                  <input type="checkbox" disabled checked={false} readOnly /> VAT포함
                </label>
                <SetTag set={form.products.length > 0} label="설정" onClick={() => setLinkOpen(true)} />
              </li>
              <li className="flex items-center gap-[8px]">
                <span className="w-[120px] text-ec-hint">수량별단가</span>
                {/* 품목별단가 줄과 같은 꼴: 막힌 칸(첫 줄 단가) · VAT포함(막힘) · [설정] — 원본 [설정] 창 미실측 */}
                <input className="ec-input flex-1 text-right" aria-label="수량별단가" disabled value={fmtAmountOf(form.qtyPrices[0]?.unitPrice ?? 0)} />
                <label className="inline-flex items-center gap-[3px]">
                  <input type="checkbox" disabled checked={!!form.qtyPrices[0]?.vatIncluded} readOnly /> VAT포함
                </label>
                <SetTag set={form.qtyPrices.length > 0} label="설정" onClick={() => setQtyOpen(true)} />
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
                {/* 원본: 코드 칸 + 계정명 칸('4019 | 상품매출') */}
                <span className="w-[140px]">
                  <GridCode title="계정검색" codeHead="계정코드" nameHead="계정명" items={accounts} value={form.salesAccountId}
                            onPick={(v) => set({ salesAccountId: v })} />
                </span>
                <input className="ec-input flex-1" aria-label="매출계정명" disabled
                       value={accounts.find((a) => a.value === form.salesAccountId)?.name ?? ''} />
              </li>
            </ul>
            <div className="flex gap-[5px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
              <button type="button" className="ec-btn" onClick={() => setForm(form.id ? form : blank())}>다시 작성</button>
              {form.id && <button type="button" className="ec-btn" onClick={() => { const id = form.id as number; setForm(null); void toggleActive([id]) }}>사용중단/재사용</button>}
              <button type="button" className="ec-btn" onClick={() => setForm(null)}>닫기</button>
              {form.id && <button type="button" className="ec-btn" onClick={() => setHistoryId(form.id)}>H</button>}
            </div>
          </div>
        )}
      </Modal>
      {historyId != null && <EcHistoryModal url={`/contract-items/${historyId}/history`} onClose={() => setHistoryId(null)} />}
      <ProductLinkModal open={linkOpen} value={form?.products ?? []} products={products} onClose={() => setLinkOpen(false)}
        onApply={(ps) => { set({ products: ps }); setLinkOpen(false) }} />
      <QtyPriceModal open={qtyOpen} value={form?.qtyPrices ?? []} onClose={() => setQtyOpen(false)}
        onApply={(qs) => { set({ qtyPrices: qs }); setQtyOpen(false) }} />
    </EcListShell>
  )
}
