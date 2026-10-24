package com.erp.accounting.bankcard;

/** 원본 카드등록의 [카드구분] — 신용카드 · 체크카드. 체크카드는 결제계좌가 있어야 한다. */
public enum CardKind {
    CREDIT("신용카드"),
    CHECK("체크카드");

    private final String displayName;

    CardKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
