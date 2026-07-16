package com.erp.groupware.domain;

/**
 * 업무게시판(WORK) 게시글 진행상태.
 */
public enum WorkPostStatus {
    IN_PROGRESS("진행중"),
    DONE("완료");

    private final String displayName;

    WorkPostStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
