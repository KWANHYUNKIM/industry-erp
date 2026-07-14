package com.erp.domain;

/** 회계전표의 생성 출처. */
public enum JournalSourceType {
    SALES("판매"),
    PURCHASE("구매"),
    EXPENSE("지출"),
    BANK("계좌입출금"),
    CARD("카드사용"),
    NOTE("어음"),
    DEPRECIATION("감가상각"),
    DISPOSAL("자산처분"),
    VOUCHER("간편전표"),
    NONCASH("비현금거래"),
    MANUAL("수동입력");

    private final String displayName;

    JournalSourceType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
