import type { SlipPrintDoc, SlipPrintLine } from '../components/EcSlipPrintModal'
import { amountToKorean } from './amountToKorean'
import type { DocParty } from './printDocument'
import { fmtNumberOf } from './format.ts'

/**
 * 견적서 · 주문서 인쇄 미리보기 종이(EcSlipPrintModal 의 letter 양식)를 짠다 — 원본 C000071 견적서조회 ·
 * C000072 주문서조회 줄 [인쇄] 2026-10-31 loginad 실측.
 *
 * 견적서: 왼쪽 일련번호 · 수신 · 참조 · TEL/FAX · 결제조건 · 유효기간 + 인사말 두 줄,
 *         오른쪽 로고 · 사업자등록번호 · 회사명/대표 · 주 소 · 업태/종목 · 담당자 · TEL/FAX. 품목명(규격), 총합계에 수량 없음, 품목 칸 25.
 * 주문서: 왼쪽 수 신 · 참 조 · TEL/FAX · 결제조건 · 유효기간 · 납기일자, 오른쪽 로고 · 일련번호 · 담당자(두 줄). 품목명[규격], 총합계에 수량, 품목 칸 20.
 */
interface LetterLine { itemCode?: string | null; itemName: string; spec?: string | null; unit?: string | null; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }
interface LetterSrc {
  key: number
  dateNo: string
  partnerName: string
  partnerTel?: string | null
  partnerFax?: string | null
  employeeName: string | null
  validUntil?: string | null
  dueDate?: string | null
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  lines: LetterLine[]
}

const slash = (v?: string | null) => (v ?? '').replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1/$2/$3')

function linesOf(src: LetterSrc): SlipPrintLine[] {
  return src.lines.map((l) => ({
    date: l.itemCode ?? '', name: l.spec ? `${l.itemName} [${l.spec}]` : l.itemName,
    qty: `${Number(l.quantity).toLocaleString()}${l.unit ?? ''}`, unitPrice: fmtNumberOf(l.unitPrice),
    supply: fmtNumberOf(l.supplyAmount), vat: fmtNumberOf(l.vatAmount),
  }))
}

function base(src: LetterSrc, title: string) {
  return {
    key: src.key, title, docNo: src.dateNo, date: '', right: [],
    lines: linesOf(src),
    totalQty: src.lines.reduce((a, l) => a + Number(l.quantity), 0).toLocaleString(),
    supply: fmtNumberOf(src.supplyAmount), vat: fmtNumberOf(src.vatAmount), total: fmtNumberOf(src.totalAmount),
  }
}

const telFax = (tel?: string | null, fax?: string | null) => `${tel ?? ''} / ${fax ?? ''}`.trim()

export function quoteSlip(src: LetterSrc, company: DocParty | null): SlipPrintDoc {
  return {
    ...base(src, '견적서'),
    letter: {
      left: [
        { label: '일련번호', value: src.dateNo }, { label: '수 신', value: src.partnerName }, { label: '참 조', value: '' },
        { label: 'TEL/FAX', value: telFax(src.partnerTel, src.partnerFax) }, { label: '결제조건', value: '' },
        { label: '유효기간', value: slash(src.validUntil) },
      ],
      notice: ['1. 귀사의 일익 번창하심을 기원합니다.', '2. 하기와 같이 견적드리오니 검토하기 바랍니다.'],
      right: [
        { label: '사업자등록번호', value: company?.bizRegNo ?? '' },
        { label: '회사명/대표', value: company ? `${company.name} / ${company.ceo ?? ''}` : '' },
        { label: '주 소', value: company?.address ?? '' },
        { label: '업태/종목', value: company ? `${company.bizType ?? ''} / ${company.bizItem ?? ''}` : '' },
        { label: '담당자', value: src.employeeName ?? '' },
        { label: 'TEL/FAX', value: telFax(company?.tel) },
      ],
      company: company?.name ?? '',
      amountKorean: amountToKorean(src.totalAmount),
      nameHead: '품목명(규격)', sumQty: false, rowsPerPage: 25,
    },
  }
}

export function orderSlip(src: LetterSrc, company: DocParty | null): SlipPrintDoc {
  return {
    ...base(src, '주문서'),
    letter: {
      left: [
        { label: '수 신', value: src.partnerName }, { label: '참 조', value: '' },
        { label: 'TEL/FAX', value: telFax(src.partnerTel, src.partnerFax) }, { label: '결제조건', value: '' },
        { label: '유효기간', value: slash(src.validUntil) }, { label: '납기일자', value: slash(src.dueDate) },
      ],
      right: [{ label: '일련번호', value: src.dateNo }, { label: '담당자', value: src.employeeName ?? '', rows: 2 }],
      company: company?.name ?? '',
      amountKorean: amountToKorean(src.totalAmount),
      nameHead: '품목명[규격]', sumQty: true, rowsPerPage: 20,
    },
  }
}

/**
 * 발주서(원본 C000077 발주서조회 줄 [인쇄] 2026-10-31 loginad 실측 — 창 '발주서' 폭 782, ✓내자기본):
 * 왼쪽 일련번호 · 수 신 · 참 조 · TEL · FAX · '납기일자 : 일자'(두 칸 합침), 오른쪽 로고(두 줄) · 사업자등록번호 · 회사명/대표 ·
 * 주 소 · 담당/연락처. 품목명[규격], 품목 칸 26 · 총합계 줄 없음.
 */
export function purchaseOrderSlip(src: LetterSrc, company: DocParty | null): SlipPrintDoc {
  return {
    ...base(src, '발주서'),
    letter: {
      left: [
        { label: '일련번호', value: src.dateNo }, { label: '수 신', value: src.partnerName }, { label: '참 조', value: '' },
        { label: 'TEL', value: src.partnerTel ?? '' }, { label: 'FAX', value: src.partnerFax ?? '' },
        { label: '', value: `납기일자 : ${slash(src.dueDate)}`, span: true },
      ],
      right: [
        { label: '사업자등록번호', value: company?.bizRegNo ?? '' },
        { label: '회사명/대표', value: company ? `${company.name} / ${company.ceo ?? ''}` : '' },
        { label: '주 소', value: company?.address ?? '' },
        { label: '담당/연락처', value: `${src.employeeName ?? ''} / ${company?.tel ?? ''}` },
      ],
      company: company?.name ?? '',
      amountKorean: amountToKorean(src.totalAmount),
      nameHead: '품목명[규격]', sumQty: false, noSum: true, logoRows: 2, rowsPerPage: 26,
    },
  }
}
