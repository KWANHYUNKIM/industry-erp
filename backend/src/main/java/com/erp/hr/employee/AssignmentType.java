package com.erp.hr.employee;

/** 인사발령 유형. */
public enum AssignmentType {
    HIRE("입사"),
    TRANSFER("전보"),
    PROMOTION("승진"),
    RESIGN("퇴사"),
    REHIRE("재입사"),
    /** 원본 발령구분 '인사발령' — 직위 · 부서만 바꾼다 */
    GENERAL("인사발령");

    private final String displayName;

    AssignmentType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
