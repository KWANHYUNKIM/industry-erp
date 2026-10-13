package com.erp.production.production;

/**
 * 생산입고의 진행상태 — 원본 생산입고조회 탭 [결재중 · 미확인 · 확인]. 판매(SalesConfirmStatus)와 같은 세 값이다.
 * 확인한 전표는 확인취소를 먼저 해야 고치거나 지울 수 있다.
 */
public enum ProductionConfirmStatus {
    UNCONFIRMED("미확인"),
    IN_APPROVAL("결재중"),
    CONFIRMED("확인");

    private final String displayName;

    ProductionConfirmStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
