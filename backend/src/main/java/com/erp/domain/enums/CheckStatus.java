package com.erp.domain.enums;

/** 수표 상태. */
public enum CheckStatus {
    /** 받은수표를 보관 중 */
    HELD("보유"),
    /** 받은수표를 계좌에 입금함 */
    DEPOSITED("입금완료"),
    /** 발행수표가 은행에서 인출됨(회계는 발행 시 이미 반영) */
    PAID("결제완료"),
    /** 받은수표 부도 */
    DISHONORED("부도");

    private final String displayName;

    CheckStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
