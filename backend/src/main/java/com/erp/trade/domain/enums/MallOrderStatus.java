package com.erp.trade.domain.enums;

/** 쇼핑몰 주문 상태. 수집 → 확인 → 판매전환 / 취소. */
public enum MallOrderStatus {
    RECEIVED("수집"),
    CONFIRMED("확인"),
    CONVERTED("판매전환"),
    CANCELLED("취소");

    private final String displayName;

    MallOrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
