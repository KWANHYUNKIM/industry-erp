package com.erp.auth.permissionrequest;

/** 권한요청 승인여부(권한승인대기현황 조회조건 · 열). */
public enum PermissionRequestStatus {
    /** 대기 */
    PENDING,
    /** 승인 */
    APPROVED,
    /** 반려 */
    REJECTED
}
