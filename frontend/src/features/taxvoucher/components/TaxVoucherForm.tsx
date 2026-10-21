import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/CodePickerField'
import EcNumInput from '../../../components/EcNumInput'
import { EcCond } from '../../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../../api/client'
import { ecConfirm } from '../../../components/EcDialog'
import EcHistoryButton from '../../../components/EcHistory'
import DropUpButton from './DropUpButton'

export type Side = 'SALES' | 'PURCHASE'
export interface PartnerOpt { id: number; code: string; name: string; bizRegNo?: string | null; ceoName?: string | null; address?: string | null; bizType?: string | null; bizItem?: string | null }
export interface Voucher {
  id: number; side: Side; sideName: string; entryDate: string; entryNo: number; vatType: string
  partnerId: number; partnerCode: string; partnerName: string
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null
  departmentId?: number | null; projectId?: number | null
}
export interface VoucherForm { id?: number; entryNo?: number; side: Side; entryDate: string; vatType: string; partnerId: string; supply: string; vat: string; remark: string; departmentId: string; projectId: string }

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
  ({ side, entryDate: today(), vatType: '세금계산서', partnerId: '', supply: '0', vat: '0', remark: '', departmentId: '', projectId: '' })
export const voucherFormOf = (r: Voucher): VoucherForm =>
  ({ id: r.id, entryNo: r.entryNo, side: r.side, entryDate: r.entryDate, vatType: r.vatType, partnerId: String(r.partnerId),
     supply: String(r.supplyAmount), vat: String(r.vatAmount), remark: r.remark ?? '',
     departmentId: r.departmentId ? String(r.departmentId) : '', projectId: r.projectId ? String(r.projectId) : '' })

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
  /** 저장 · 삭제 뒤. saved 는 저장한 계산서(삭제면 null), print 는 [저장/청구서인쇄] 였는지. after 가 있으면 창을 닫지 않고 목록만 새로 읽는다. */
  onSaved: (saved: Voucher | null, print: boolean, after?: 'keep' | 'new') => void | Promise<void>
}) {
  const [form, setForm] = useState<VoucherForm>(initial)
  const [formError, setFormError] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [departments, setDepartments] = useState<{ value: string; code: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ value: string; code: string; name: string }[]>([])
  useEffect(() => {
    type Opt = { id: number; code: string; name: string }
    const items = (rs: Opt[]) => rs.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))
    api.get<Opt[]>('/departments').then((r) => setDepartments(items(r.data))).catch(() => setDepartments([]))
    api.get<Opt[]>('/projects').then((r) => setProjects(items(r.data))).catch(() => setProjects([]))
  }, [])
  const set = (patch: Partial<VoucherForm>) => setForm({ ...form, ...patch })

  async function save(thenPrint = false, after?: 'keep' | 'new') {
    if (!form.partnerId) { setFormError('__partner'); return }
    const body = { side: form.side, entryDate: form.entryDate, vatType: form.vatType, partnerId: Number(form.partnerId),
      supplyAmount: Number(form.supply) || 0, vatAmount: Number(form.vat) || 0, remark: form.remark,
      departmentId: form.departmentId ? Number(form.departmentId) : null, projectId: form.projectId ? Number(form.projectId) : null }
    try {
      const saved = form.id ? await api.put<Voucher>(`/tax-vouchers/${form.id}`, body) : await api.post<Voucher>('/tax-vouchers', body)
      await onSaved(saved.data ?? null, thenPrint, after)
      /* 원본(2026-10-22 실측): [저장/내용유지] 는 창이 열린 채 방금 저장한 전표의 수정 창(전표일자 '2026/10/22 - 4' 막힘 · [삭제] · [H])이 되고,
         [저장/신규] 는 같은 저장 뒤 빈 새 창이 뜬다. */
      if (after === 'keep' && saved.data) { setForm(voucherFormOf(saved.data)); setFormError('') }
      if (after === 'new') { setForm(newVoucherForm(form.side)); setFormError('') }
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
          <EcCond label="부서코드" span={2}>
            <CodePickerField label="부서코드" hideLabel fill pair emptyLabel="(선택 안 함)" value={form.departmentId}
                             onChange={(v) => set({ departmentId: v })} items={departments} />
          </EcCond>
          <EcCond label="프로젝트코드" span={2}>
            <CodePickerField label="프로젝트코드" hideLabel fill pair emptyLabel="(선택 안 함)" value={form.projectId}
                             onChange={(v) => set({ projectId: v })} items={projects} />
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
          <DropUpButton label="저장(F8)" primary onClick={() => void save()}
                        items={[{ label: '저장/내용유지', onClick: () => void save(false, 'keep') }, { label: '저장/신규', onClick: () => void save(false, 'new') }]} />
          {form.side === 'SALES' && (
            <DropUpButton label="저장/청구서인쇄" onClick={() => void save(true)}
                          items={[{ label: '저장/전자(세금)계산서인쇄', onClick: () => void save(true) }, { label: '전자(세금)계산서발행', onClick: () => void save(true) }]} />
          )}
          {form.id
            ? <button className="ec-btn" onClick={() => void remove()}>삭제</button>
            : <button className="ec-btn" onClick={() => { setForm(newVoucherForm(form.side)); setFormError('') }}>다시 작성</button>}
          <button className="ec-btn" onClick={onClose}>닫기</button>
          {/* 원본 수정 창 끝의 [H] — 이력 창은 마지막 수정 일시 · 작업자 한 줄(2026-10-22 실측) */}
          <EcHistoryButton target="TAX_VOUCHER" id={form.id} last />
        </div>
      </Modal>

      {detailOpen && (
        <Modal open error={shownError} title="세금계산서내역등록" width={780} onClose={() => setDetailOpen(false)}>
          {/* 원본 세금계산서내역등록 창(2026-10-21 실측): 일련번호 · 청구/영수 · 비고 · 현금 · 수표 · 어음 · 외상매출금 + 격자 4줄
              [월/일 · 품명 · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 비고] · 합계. 비고만 전표에 담긴다 — 나머지 칸은 우리 세무 전표에 담을 곳이 없어 모양만 둔다. */}
          <ul className="ec-form [&>li>.title]:basis-[100px]">
            <EcCond label="일련번호"><input className="ec-input w-full" placeholder="일련번호" /></EcCond>
            <EcCond label="청구/영수">
              <label className="inline-flex items-center gap-[3px] mr-[10px]"><input type="radio" name="tv-claim" defaultChecked /> 청구</label>
              <label className="inline-flex items-center gap-[3px]"><input type="radio" name="tv-claim" /> 영수</label>
            </EcCond>
            <EcCond label="비고" span={2}>
              <input className="ec-input w-full" placeholder="비고" value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
            </EcCond>
            <EcCond label="현금"><input className="ec-input w-full text-right" defaultValue="0" aria-label="현금" /></EcCond>
            <EcCond label="수표"><input className="ec-input w-full text-right" defaultValue="0" aria-label="수표" /></EcCond>
            <EcCond label="어음"><input className="ec-input w-full text-right" defaultValue="0" aria-label="어음" /></EcCond>
            <EcCond label="외상매출금"><input className="ec-input w-full text-right" defaultValue="0" aria-label="외상매출금" /></EcCond>
          </ul>
          <table className="w-full mt-[8px]">
            <thead><tr><th className="w-[34px]"></th><th className="w-[90px]">월/일</th><th>품명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th>비고</th></tr></thead>
            <tbody>
              {[0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td><input className="ec-input w-full" placeholder="월/일" aria-label={`${i + 1}줄 월/일`} /></td>
                  <td><input className="ec-input w-full" aria-label={`${i + 1}줄 품명`} /></td>
                  <td><input className="ec-input w-full" aria-label={`${i + 1}줄 규격`} /></td>
                  <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 수량`} /></td>
                  <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 단가`} /></td>
                  <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 공급가액`} /></td>
                  <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 부가세`} /></td>
                  <td><input className="ec-input w-full" aria-label={`${i + 1}줄 비고`} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={6}></td><td className="text-right">0</td><td className="text-right">0</td><td></td></tr></tfoot>
          </table>
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={() => setDetailOpen(false)}>적용(F8)</button>
            <button className="ec-btn" onClick={() => setDetailOpen(false)}>닫기</button>
          </div>
        </Modal>
      )}
    </>
  )
}
