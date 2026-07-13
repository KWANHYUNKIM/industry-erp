package com.erp.domain;

/** 회계전표의 생성 출처. */
public enum JournalSourceType {
    SALES("판매"),
    PURCHASE("구매"),
    EXPENSE("지출"),
    MANUAL("수동입력");

    private final String displayName;

    JournalSourceType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
