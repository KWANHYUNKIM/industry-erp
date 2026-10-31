import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import EcDateField from '../../../components/EcDateField'
import EcNumInput from '../../../components/EcNumInput'
import { EcCond } from '../../../components/EcStatusPanel'
import CodePickerField, { type CodeItem } from '../../../components/codepicker/CodePickerField'

/** 결의서 줄의 [추가정보] › 부가세정보. */
export interface LineVat {
  vatType: string
  vatDate: string
  partnerId: string
  supply: string
  vat: string
}

/**
 * 원본 '매입종류선택' 목록(2026-10-21 loginaa 지출결의서 E010408 · 가지급금정산서 E010505 실측, 차례 그대로).
 */
export const PURCHASE_VAT_TYPES = [
  '세금계산서', '영세율', '계산서', '세금계산서(불공)', '세금계산서(수입)', '현금영수증', '카드매입',
  '세.계(고정-수입)', '세.계(고정자산)', '영세율(수입)', '계산서(수입)', '세.계(고정-불공)', '계산서(고정자산)',
  '신용카드(고정자산)', '매입자발행세금계산서', '현금영수증(고정자산)', '기타수입', '재활용', '기타매입',
]

/** 부가세 10% 가 붙는 유형 — 영세율 · 계산서(면세) · 기타 · 재활용은 0(원본은 세금계산서만 잼). */
const taxed = (t: string) => !/^(영세율|계산서|기타|재활용)/.test(t)

/** 적용한 줄의 [추가정보] 칸 글 — 원본 '[세금계산서] 10,909 / 1,091'. */
export function vatCellText(v: LineVat) {
  const won = (s: string) => (Number(s) || 0).toLocaleString('ko-KR')
  return `[${v.vatType}] ${won(v.supply)} / ${won(v.vat)}`
}

/**
 * '추가정보입력' 창(원본 784 × 342) — 탭 [부가세정보] · [불러오기(F4)] · 부가세유형 [매입종류선택 ▾] · 발생일자 · 거래처 · 공급가액 · 부가세,
 * 아래 [적용(F8)] [삭제] [닫기].
 *
 * - 유형을 고르면 공급가액 = 줄 금액 / 1.1 반올림, 부가세 = 나머지(12,000 → 10,909 · 1,091). 세금계산서면 옆에 '전자(세금)계산서-신규 정상'.
 * - 공급가액을 고치면 부가세 = 10%(20,000 → 2,000).
 * - 거래처를 비우고 적용하면 거래처 칸만 빨간 테두리(글 없음). 적용하면 줄 [금액] = 공급가액 + 부가세.
 */
export default function VoucherVatModal({ open, amount, date, value, partners, onApply, onRemove, onClose }: {
  open: boolean
  /** 줄의 지금 금액 — 유형을 처음 고를 때 공급가액 · 부가세를 나눈다. */
  amount: number
  /** 전표 일자 — 발생일자의 처음 값. */
  date: string
  value: LineVat | null
  partners: CodeItem[]
  onApply: (v: LineVat) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [v, setV] = useState<LineVat>({ vatType: '', vatDate: date, partnerId: '', supply: '', vat: '' })
  const [partnerInvalid, setPartnerInvalid] = useState(false)

  useEffect(() => {
    if (!open) return
    setV(value ?? { vatType: '', vatDate: date, partnerId: '', supply: '', vat: '' })
    setPartnerInvalid(false)
  }, [open, value, date])

  function pickType(t: string) {
    if (!t) { setV((x) => ({ ...x, vatType: '' })); return }
    setV((x) => {
      if (x.vatType && x.supply) {
        const s = Number(x.supply) || 0
        return { ...x, vatType: t, vat: String(taxed(t) ? Math.round(s * 0.1) : 0) }
      }
      const supply = taxed(t) ? Math.round(amount / 1.1) : amount
      return { ...x, vatType: t, supply: String(supply), vat: String(amount - supply) }
    })
  }

  function setSupply(s: string) {
    setV((x) => ({ ...x, supply: s, vat: String(x.vatType && taxed(x.vatType) ? Math.round((Number(s) || 0) * 0.1) : 0) }))
  }

  function apply() {
    if (!v.vatType) return
    if (!v.partnerId) { setPartnerInvalid(true); return }
    onApply(v)
  }

  return (
    <Modal open={open} title="추가정보입력" width={784} error={null} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); apply() } }}>
        <div className="flex items-center justify-between mb-[8px]">
          <ul className="ec-pills"><li className="ec-pill active">부가세정보</li></ul>
          <button type="button" className="ec-btn ec-btn-sm">불러오기(F4)</button>
        </div>
        <ul className="ec-form mb-[8px]">
          <EcCond label="부가세유형" span={2}>
            <span className="inline-flex items-center gap-[6px]">
              <select className="ec-input w-[180px]" aria-label="부가세유형" value={v.vatType} onChange={(e) => pickType(e.target.value)}>
                <option value="">매입종류선택</option>
                {PURCHASE_VAT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {v.vatType === '세금계산서' && <span>전자(세금)계산서-신규 정상</span>}
            </span>
          </EcCond>
          <EcCond label="발생일자" span={2}>
            <EcDateField value={v.vatDate} onChange={(d) => setV((x) => ({ ...x, vatDate: d }))} />
          </EcCond>
          <EcCond label="거래처" span={2}>
            <div className={`w-full${partnerInvalid ? ' ec-invalid' : ''}`}>
              <CodePickerField label="거래처" hideLabel pair fill emptyLabel="(없음)" value={v.partnerId} items={partners}
                               onChange={(p) => { setV((x) => ({ ...x, partnerId: p })); if (p) setPartnerInvalid(false) }} />
            </div>
          </EcCond>
          <EcCond label="공급가액" span={2}>
            <EcNumInput className="ec-input w-[180px] text-right" aria-label="공급가액" placeholder="공급가액" value={v.supply} onValue={setSupply} />
          </EcCond>
          <EcCond label="부가세" span={2}>
            <EcNumInput className="ec-input w-[180px] text-right" aria-label="부가세" placeholder="부가세" value={v.vat}
                        onValue={(x) => setV((y) => ({ ...y, vat: x }))} />
          </EcCond>
        </ul>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onRemove}>삭제</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}
