package com.erp.accounting.vatinvoice;

/** 각종구분값변경의 [진행상태] — 국세청 전송을 하지 않으므로 전송완료 · 예정발송완료는 생기지 않는다. */
public enum VatInvoiceProgress {
    NONE("발행 안됨"),
    LATE("기한후 발행"),
    ELSEWHERE("타발행"),
    ;

    private final String displayName;

    VatInvoiceProgress(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
