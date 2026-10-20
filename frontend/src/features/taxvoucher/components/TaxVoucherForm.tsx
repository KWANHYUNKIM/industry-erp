import { useState } from 'react'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/CodePickerField'
import EcNumInput from '../../../components/EcNumInput'
import { EcCond } from '../../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../../api/client'
import { ecConfirm } from '../../../components/EcDialog'

export type Side = 'SALES' | 'PURCHASE'
export interface PartnerOpt { id: number; code: string; name: string; bizRegNo?: string | null; ceoName?: string | null; address?: string | null; bizType?: string | null; bizItem?: string | null }
export interface Voucher {
  id: number; side: Side; sideName: string; entryDate: string; entryNo: number; vatType: string
  partnerId: number; partnerCode: string; partnerName: string
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null
}
export interface VoucherForm { id?: number; entryNo?: number; side: Side; entryDate: string; vatType: string; partnerId: string; supply: string; vat: string; remark: string }

/* 원본 [부가세유형] 목록 글자 그대로(2026-10-12 loginaa 실측) — 매출 창과 매입 창이 다르다. */
export const SALES_TYPES = [
  '세금계산서', '영세율', '계산서', '소매매출', '수출', '카드매출', '계산서(고정자산)', '세.계(고정자산)', '소매(면세)',
  '카드매출(면세)', '현금영수증(면세)', '현금영수증', '매입자발행세금계산서', '영세율(기타)', '기타매출',
] as const
export const PURCHASE_TYPES = [
  '세금계산서', '영세율', '계산서', '세금계산서(불공)', '세금계산서(수입)', '현금영수증', '카드매입', '세.계(고정-수입)',
  '세.계(고정자산)', '영세율(수입)', '계산서(수입)', '세.계(고정-불공)', '계산서(고정자산)', '신용카드(고정자산)',
  '매입자발행세금계산서', '현금영수증(고정자산)', '기타수입', '재활용', '기타매입',
] as const
/* 부가세를 공급가액의 10% 로 채우는 유형 — 영세율 · 계산서(면세) · 수출은 0 이다. */
const TAXED = new Set(['세금계산서', '소매매출', '카드매출', '세.계(고정자산)', '현금영수증', '매입자발행세금계산서', '기타매출',
  '세금계산서(불공)', '세금계산서(수입)', '카드매입', '세.계(고정-수입)', '세.계(고정-불공)', '신용카드(고정자산)', '현금영수증(고정자산)',
  '기타매입'])
const vatOf = (type: string, supply: string) => (TAXED.has(type) ? String(Math.round((Number(supply) || 0) / 10)) : '0')
const today = () => new Date().toLocaleDateString('sv-SE')

export const newVoucherForm = (side: Side): VoucherForm =>
  ({ side, entryDate: today(), vatType: '세금계산서', partnerId: '', supply: '0', vat: '0', remark: '' })
export const voucherFormOf = (r: Voucher): VoucherForm =>
  ({ id: r.id, entryNo: r.entryNo, side: r.side, entryDate: r.entryDate, vatType: r.vatType, partnerId: String(r.partnerId),
     supply: String(r.supplyAmount), vat: String(r.vatAmount), remark: r.remark ?? '' })

/**
 * (세금)계산서발행/수령(원본 E030202)의 '매출(세금)계산서발행' · '매입(세금)계산서수령' 창 — 그 화면 목록과
 * 매출 · 매입(세금)계산서조회(세무)(E030203 · E030204)의 '세무' 줄 일자-번호가 같은 창을 띄운다(2026-10-20 원본 실측:
 * 조회(세무)에서 열어 200,000 으로 고치고 [삭제] '전표를 삭제하겠습니까?' 까지 그 창에서 된다).
 *
 * <p>원본 매출 창에는 비고 칸이 없고 [세부내역](세금계산서내역등록) 창 안에 있다. 빈 거래처는 문구 없이 빨간 테두리.
 * 수정 창은 전표일자가 막히고 [삭제] 가 붙는다.
 */
export default function TaxVoucherForm({ initial, partners, onClose, onSaved }: {
  initial: VoucherForm; partners: PartnerOpt[]; onClose: () => void
  /** 저장 · 삭제 뒤. saved 는 저장한 계산서(삭제면 null), print 는 [저장/청구서인쇄] 였는지. */
  onSaved: (saved: Voucher | null, print: boolean) => void | Promise<void>
}) {
  const [form, setForm] = useState<VoucherForm>(initial)
  const [formError, setFormError] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const set = (patch: Partial<VoucherForm>) => setForm({ ...form, ...patch })

  async function save(thenPrint = false) {
    if (!form.partnerId) { setFormError('__partner'); return }
    const body = { side: form.side, entryDate: form.entryDate, vatType: form.vatType, partnerId: Number(form.partnerId),
      supplyAmount: Number(form.supply) || 0, vatAmount: Number(form.vat) || 0, remark: form.remark }
    try {
      const saved = form.id ? await api.put<Voucher>(`/tax-vouchers/${form.id}`, body) : await api.post<Voucher>('/tax-vouchers', body)
      await onSaved(saved.data ?? null, thenPrint)
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!form.id) return
    if (!(await ecConfirm('전표를 삭제하겠습니까?'))) return
    try {
      await api.delete(`/tax-vouchers/${form.id}`)
      await onSaved(null, false)
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  const types = form.side === 'PURCHASE' ? PURCHASE_TYPES : SALES_TYPES
  const title = form.side === 'PURCHASE' ? '매입(세금)계산서수령' : '매출(세금)계산서발행'
  const partnerItems = partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))
  const shownError = formError === '__partner' ? '' : formError

  return (
    <>
      <Modal open error={shownError} title={title} width={780} onClose={onClose}>
        <ul className="ec-form [&>li>.title]:basis-[100px]">
          <EcCond label="전표일자" span={2}>
            <input type="date" className="ec-input w-[150px]" value={form.entryDate} disabled={!!form.id}
                   onChange={(e) => set({ entryDate: e.target.value })} />
            {form.id && <span>- {form.entryNo}</span>}
          </EcCond>
          <EcCond label="부가세유형" span={2}>
            <select className="ec-input w-full" value={form.vatType}
                    onChange={(e) => set({ vatType: e.target.value, vat: vatOf(e.target.value, form.supply) })}>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </EcCond>
          <EcCond label="거래처" span={2}>
            <div className={`w-full${formError === '__partner' ? ' ec-invalid' : ''}`}>
            <CodePickerField label="거래처" hideLabel fill pair emptyLabel="(선택 안 함)" value={form.partnerId}
                             onChange={(v) => { set({ partnerId: v }); setFormError('') }} items={partnerItems} />
            </div>
          </EcCond>
          <EcCond label="공급가액" span={2}>
            <EcNumInput className="ec-input w-full text-right" value={form.supply}
                        onValue={(v) => set({ supply: v, vat: vatOf(form.vatType, v) })} />
          </EcCond>
          <EcCond label="부가세" span={2}>
            <EcNumInput className="ec-input w-full text-right" value={form.vat} onValue={(v) => set({ vat: v })} />
          </EcCond>
          {form.side === 'PURCHASE' ? (
            <EcCond label="비고" span={2}>
              <input className="ec-input w-full" placeholder="비고" value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
            </EcCond>
          ) : (
            <EcCond label="세부내역" span={2}>
              <button className="ec-link" onClick={() => setDetailOpen(true)}>세부내역</button>
            </EcCond>
          )}
        </ul>
        <div className="flex gap-[6px] mt-[12px]">
          <button className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
          {form.side === 'SALES' && <button className="ec-btn" onClick={() => void save(true)}>저장/청구서인쇄</button>}
          {form.id
            ? <button className="ec-btn" onClick={() => void remove()}>삭제</button>
            : <button className="ec-btn" onClick={() => { setForm(newVoucherForm(form.side)); setFormError('') }}>다시 작성</button>}
          <button className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>

      {detailOpen && (
        <Modal open error={shownError} title="세금계산서내역등록" width={780} onClose={() => setDetailOpen(false)}>
          <ul className="ec-form [&>li>.title]:basis-[100px]">
            <EcCond label="비고" span={2}>
              <input className="ec-input w-full" placeholder="비고" value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
            </EcCond>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={() => setDetailOpen(false)}>적용(F8)</button>
            <button className="ec-btn" onClick={() => setDetailOpen(false)}>닫기</button>
          </div>
        </Modal>
      )}
    </>
  )
}
