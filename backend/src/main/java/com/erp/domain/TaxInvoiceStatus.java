package com.erp.domain;

/**
 * 세금계산서 진행단계. (이카운트 '(세금)계산서진행단계')
 * 작성 → 발행 → 국세청 전송 → 승인.
 */
public enum TaxInvoiceStatus {
    DRAFT("작성"),
    ISSUED("발행"),
    SENT("전송"),
    APPROVED("승인");

    private final String displayName;

    TaxInvoiceStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** 다음 단계. 마지막(APPROVED)이면 자기 자신. */
    public TaxInvoiceStatus next() {
        return switch (this) {
            case DRAFT -> ISSUED;
            case ISSUED -> SENT;
            case SENT -> APPROVED;
            case APPROVED -> APPROVED;
        };
    }
}
