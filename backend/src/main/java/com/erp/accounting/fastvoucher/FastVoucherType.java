package com.erp.accounting.fastvoucher;

/** FastEntry 간편전표 종류. */
public enum FastVoucherType {
    EXPENSE_REPORT("지출결의서"),
    DEPOSIT_REPORT("입금보고서"),
    ADVANCE_SETTLEMENT("가지급금정산서"),
    /** 원본 현금예금출금 › 영수증으로(E010402) — 출금계좌 · 계정 · 거래처명(글자) · 금액 · 수수료 한 장. */
    RECEIPT_PAYMENT("영수증으로");

    private final String displayName;

    FastVoucherType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
