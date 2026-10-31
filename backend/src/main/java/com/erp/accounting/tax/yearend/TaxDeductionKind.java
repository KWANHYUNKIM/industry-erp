package com.erp.accounting.tax.yearend;

/**
 * 정산공제항목 입력의 공제 줄 종류 — 원본에서 잰 창만 둔다(plans/세무/연말정산.md 3.2 · 3.3).
 * 보장성보험료 12% · 장애인 전용 보장성 15%(각 대상 100만 한도) · 의료비 15%(총급여 3% 문턱).
 */
public enum TaxDeductionKind {
    PROTECTION_INSURANCE, DISABLED_INSURANCE, MEDICAL
}
