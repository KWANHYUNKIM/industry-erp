package com.erp.groupware.domain;

/** 설문 진행 상태. */
public enum SurveyStatus {
    OPEN("진행중"),
    CLOSED("마감");

    private final String displayName;

    SurveyStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
