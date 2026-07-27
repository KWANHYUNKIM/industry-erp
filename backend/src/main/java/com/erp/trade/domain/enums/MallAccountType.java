package com.erp.trade.domain.enums;

/** 쇼핑몰 등록 구분. */
public enum MallAccountType {
    MALL("쇼핑몰"),
    SOLUTION("통합관리솔루션");

    private final String displayName;

    MallAccountType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
