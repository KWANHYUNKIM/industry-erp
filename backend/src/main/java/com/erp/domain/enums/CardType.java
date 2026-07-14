package com.erp.domain.enums;

/** 카드 종류. 법인카드는 미지급금으로, 개인카드는 사용자 정산 대상으로 관리한다. */
public enum CardType {
    CORPORATE("법인카드"),
    PERSONAL("개인카드");

    private final String displayName;

    CardType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
