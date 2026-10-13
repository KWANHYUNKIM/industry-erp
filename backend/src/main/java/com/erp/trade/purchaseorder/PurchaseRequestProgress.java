package com.erp.trade.purchaseorder;

/**
 * 발주요청의 [종결여부] — 원본 발주요청조회(E040315)의 미확인 / 확인(진행중 · 완료). 사람이 [진행상태변경]으로 바꾼다
 * (2026-10-13 실측). 발주 흐름 상태(PurchaseOrderStatus)와 따로 간다.
 */
public enum PurchaseRequestProgress {
    UNCONFIRMED("미확인"),
    IN_PROGRESS("진행중"),
    COMPLETED("완료");

    private final String displayName;

    PurchaseRequestProgress(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
