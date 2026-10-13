import type { PurchaseOrder } from '../../types/api'
import type { PrintDocumentOptions } from '../../utils/printDocument'
import { dateNo } from '../../utils/dateNo'

/** 서버 줄 응답은 줄 거래처도 싣는다(OrderLineResponse.partnerName) — 공용 타입에 없어 여기서만 넓힌다. */
type Line = PurchaseOrder['lines'][number] & { partnerName?: string | null }

/**
 * 발주요청 → 인쇄 서식 '발주요청서'. 원본 [저장/전표(F7)] 과 발주요청조회 줄의 [인쇄] 가 띄운다(2026-10-13 E040314 실측):
 * 머리 전표번호(2026/10/13 -3) · 입고될창고 · 담당자 · 납기일자 · 프로젝트 · 참조, 줄 월/일 · 품목명(규격) · 거래처명 · 수량 ·
 * 단가 · 공급가액 · 부가세, 총합계. 공급자 · 공급받는자 상자는 없다.
 */
export function purchaseRequestDocument(po: PurchaseOrder): PrintDocumentOptions {
  const lines = po.lines as Line[]
  const partners = [...new Set(lines.map((l) => l.partnerName ?? po.partnerName).filter(Boolean))]
  return {
    title: '발주요청서',
    docNo: dateNo(po.orderDate, po.orderNo),
    docDate: po.orderDate,
    supplier: { label: '거래처', name: po.partnerName },
    customer: { label: '입고될창고', name: po.warehouseName ?? '' },
    hideParties: true,
    extra: [
      { label: '입고될창고', value: po.warehouseName },
      { label: '담당자', value: po.employeeName },
      { label: '납기일자', value: po.dueDate },
      { label: '프로젝트', value: po.projectName },
      { label: '거래처명', value: partners.join(', ') },
      { label: '참조', value: po.remark },
    ],
    lines: lines.map((l) => ({
      itemCode: l.itemCode,
      itemName: l.itemName,
      spec: l.spec,
      unit: l.unit,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      supplyAmount: Number(l.supplyAmount),
      vatAmount: Number(l.vatAmount),
    })),
  }
}
