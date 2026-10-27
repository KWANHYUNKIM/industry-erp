import type { Partner, PurchaseDoc, SalesDoc } from '../types/api'
import type { DocParty, PrintDocumentOptions } from './printDocument'

/**
 * 판매 · 구매 전표 → 인쇄 서식. 원본 [저장/전표(F7)]가 저장 직후 띄우는 양식이다
 * (2026-10-06 loginaa 실측):
 * <ul>
 *   <li>판매입력 F7 → <b>거래명세서</b> — 공급자(우리 회사) · 공급받는자(거래처) · 품목 줄 · 수량/공급가액/VAT/합계</li>
 *   <li>구매입력 F7 → <b>구매전표</b> — 머리에 전표번호 · DATE · 구매창고 · 구매처, 공급자/받는자 상자는 없다</li>
 * </ul>
 * 원본은 두 양식 모두 단가를 원 단위로 찍는다(333.5 → 334) — 인쇄 서식이 금액 칸을 원 단위로 그려 같게 나온다.
 */
export function salesSlipDocument(d: SalesDoc, partner: Partner | undefined, supplier: DocParty | null): PrintDocumentOptions {
  return {
    title: '거래명세서',
    docNo: d.docNo,
    docDate: d.saleDate,
    supplier: supplier ?? { label: '공급자', name: '(회사정보 미등록)' },
    customer: {
      label: '공급받는자',
      name: d.partnerName,
      bizRegNo: partner?.bizRegNo,
      ceo: partner?.ceoName,
      bizType: partner?.bizType,
      bizItem: partner?.bizItem,
      tel: partner?.phone,
      address: partner?.address,
    },
    extra: [
      { label: '창고', value: d.warehouseName },
      { label: '담당', value: d.employeeName },
    ],
    remark: d.remark,
    lines: d.lines.map(lineOf),
  }
}

export function purchaseSlipDocument(d: PurchaseDoc): PrintDocumentOptions {
  return {
    title: '구매전표',
    docNo: d.docNo,
    docDate: d.purchaseDate,
    supplier: { label: '구매처', name: d.partnerName },
    customer: { label: '구매창고', name: d.warehouseName },
    hideParties: true,
    extra: [
      { label: '구매창고', value: d.warehouseName },
      { label: '구매처', value: d.partnerName },
      { label: '담당', value: d.employeeName },
    ],
    remark: d.remark,
    lines: d.lines.map(lineOf),
  }
}

function lineOf(l: SalesDoc['lines'][number]) {
  return {
    itemCode: l.itemCode,
    itemName: l.itemName,
    spec: l.spec,
    unit: l.unit,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    supplyAmount: l.supplyAmount,
    vatAmount: l.vatAmount,
  }
}
