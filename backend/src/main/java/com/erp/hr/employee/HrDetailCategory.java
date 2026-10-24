package com.erp.hr.employee;

/**
 * 원본 인사카드등록 [인사자료] 탭의 항목 열한 가지(원본 차례). 칸이 어느 열인지는 화면(HrCardPage CATEGORIES)이 정한다.
 */
public enum HrDetailCategory {
    EDUCATION("학력사항"),
    CAREER("경력사항"),
    LICENSE("자격ㆍ면허"),
    FAMILY("가족사항"),
    LANGUAGE("외국어"),
    REWARD("상벌사항"),
    TRAINING("교육사항"),
    TRIP("출장사항"),
    MEMO("메모사항"),
    WORK_STATUS("근무실태"),
    GUARANTOR("보증인");

    private final String displayName;

    HrDetailCategory(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
