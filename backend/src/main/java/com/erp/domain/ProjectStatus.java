package com.erp.domain;

/** 프로젝트 진행 상태. */
public enum ProjectStatus {
    PLANNING("기획"),
    IN_PROGRESS("진행중"),
    ON_HOLD("보류"),
    DONE("완료");

    private final String displayName;

    ProjectStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
