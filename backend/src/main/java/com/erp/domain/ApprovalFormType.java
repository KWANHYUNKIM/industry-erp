package com.erp.domain;

/**
 * 전자결재 기안서 양식 종류.
 */
public enum ApprovalFormType {
    LEAVE("휴가신청서"),
    BIZ_TRIP("국내출장신청서"),
    TRIP_REPORT("출장복명서"),
    EXPENSE("지출결의서"),
    PURCHASE_REQ("구매요청서"),
    GENERAL("일반기안");

    private final String displayName;

    ApprovalFormType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
