package com.erp.groupware.domain.enums;

/** 설문대상구분. 원본 설문조사입력의 [내부/외부] 라디오. */
public enum SurveyTargetScope {

    INTERNAL("내부"),
    EXTERNAL("외부");

    private final String displayName;

    SurveyTargetScope(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
