package com.erp.hr.employee;

/**
 * 원본 인사카드등록 [인사자료] 탭의 항목. 지금은 학력사항 · 경력사항만 만들었다(나머지 자격 · 면허 · 가족 · 외국어 ·
 * 상벌 · 교육 · 출장 · 메모 · 근무실태 · 보증인은 원본 입력 창의 열을 재 오면 더한다).
 */
public enum HrDetailCategory {
    EDUCATION("학력사항"),
    CAREER("경력사항");

    private final String displayName;

    HrDetailCategory(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
