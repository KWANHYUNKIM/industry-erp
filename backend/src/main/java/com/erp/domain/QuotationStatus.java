package com.erp.domain;

/** 견적서 진행 상태. */
public enum QuotationStatus {
    DRAFT("작성"),
    SENT("발송"),
    CONVERTED("수주전환"),
    CANCELLED("취소");

    private final String displayName;

    QuotationStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
