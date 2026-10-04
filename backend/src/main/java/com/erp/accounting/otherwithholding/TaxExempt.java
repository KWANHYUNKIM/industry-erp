package com.erp.accounting.otherwithholding;

/** 기타원천세 줄의 세액을 0 으로 둔 까닭 — 원본 기타원천세입력 [소액부징수] · [과세최저한]. */
public enum TaxExempt {
    /** 소액부징수 — 소득세 1,000원 미만(소득세법 86조). 사업소득 줄은 해당 없다. */
    SMALL,
    /** 과세최저한 — 기타소득금액 건별 50,000원 이하(소득세법 84조). */
    MIN,
}
