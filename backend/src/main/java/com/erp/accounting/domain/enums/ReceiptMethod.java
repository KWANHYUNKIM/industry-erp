package com.erp.accounting.domain.enums;

/** 수입 회수 수단. 분개의 차변이 이걸로 정해진다. */
public enum ReceiptMethod {
    CASH("현금"),
    BANK("계좌입금"),
    CREDIT("외상");

    private final String displayName;

    ReceiptMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
