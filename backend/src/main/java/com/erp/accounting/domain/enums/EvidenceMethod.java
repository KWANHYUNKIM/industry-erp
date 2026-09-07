package com.erp.accounting.domain.enums;

/** 증빙방법. 전표에 어떤 형태의 증빙을 붙였는지. */
public enum EvidenceMethod {
    TAX_INVOICE("세금계산서"),
    CARD("신용카드"),
    CASH_RECEIPT("현금영수증"),
    STATEMENT("거래명세서"),
    ETC("기타");

    private final String displayName;

    EvidenceMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
