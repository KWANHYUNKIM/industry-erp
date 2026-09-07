package com.erp.groupware.domain;

/**
 * 설문 진행 상태. 원본 설문조사조회의 탭(전체·초안·진행중·완료·미발송) 그대로다.
 *
 * <p>DRAFT 는 아직 대상에게 보내지 않은 작성 중 문서, UNSENT 는 만들어 두었으나
 * 발송하지 않기로 한 것이다. 둘을 나누는 이유는 원본 탭이 나눠 놓았기 때문이다.
 */
public enum SurveyStatus {

    DRAFT("초안"),
    OPEN("진행중"),
    CLOSED("완료"),
    UNSENT("미발송");

    private final String displayName;

    SurveyStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
