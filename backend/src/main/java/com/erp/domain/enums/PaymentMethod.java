package com.erp.domain.enums;

/** 간편전표의 결제(입금) 수단. 분개의 상대편에 무엇이 서는지를 정한다. */
public enum PaymentMethod {
    /** 현금(101) */
    CASH("현금"),
    /** 등록된 계좌. 계좌 잔액도 함께 움직이고 입출금 내역에 남는다. */
    BANK("계좌"),
    /** 아직 나가지 않은 돈 — 미지급금(253) / 받을 돈 — 외상매출금(108) */
    CREDIT("미지급/미수");

    private final String displayName;

    PaymentMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
