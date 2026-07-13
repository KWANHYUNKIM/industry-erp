package com.erp.domain;

/**
 * 판매전표 확인상태. (이카운트 판매조회의 탭)
 *
 * 전자결재로 상신하면 IN_APPROVAL, 결재가 끝나면 CONFIRMED 로 넘어간다.
 * 반려되면 UNCONFIRMED 로 되돌아온다.
 */
public enum SalesConfirmStatus {
    UNCONFIRMED("미확인"),
    IN_APPROVAL("결재중"),
    CONFIRMED("확인");

    private final String displayName;

    SalesConfirmStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
