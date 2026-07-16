package com.erp.hr.domain.enums;

/**
 * 휴가 신청 상태.
 *
 * 예전에는 "대기"/"승인"/"반려" 문자열이었다. 오타("승인 "·"승락")를 막을 방법이 없었고,
 * DB에 무슨 값이 들어있는지 코드만 봐서는 알 수 없었다. 다른 모듈은 전부 enum + CHECK 제약이다.
 */
public enum VacationStatus {
    PENDING("대기"),
    APPROVED("승인"),
    REJECTED("반려");

    private final String displayName;

    VacationStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
