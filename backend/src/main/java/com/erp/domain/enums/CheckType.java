package com.erp.domain.enums;

/** 수표 종류. */
public enum CheckType {
    /** 받은수표 — 거래처에서 받아 보관 중인 수표 */
    RECEIVED("받은수표"),
    /** 발행수표 — 우리가 당좌계좌로 끊어 준 수표 */
    ISSUED("발행수표");

    private final String displayName;

    CheckType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
