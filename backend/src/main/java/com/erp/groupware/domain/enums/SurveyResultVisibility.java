package com.erp.groupware.domain.enums;

/** 결과공개범위. 원본 설문조사입력의 [전체공개/일부공개/비공개]. */
public enum SurveyResultVisibility {

    ALL("전체공개"),
    /** 설문 작성자와 설문대상에게만 결과를 보여준다. */
    PARTIAL("일부공개"),
    /** 작성자만 본다. */
    NONE("비공개");

    private final String displayName;

    SurveyResultVisibility(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
