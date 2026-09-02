package com.erp.groupware.domain.enums;

/**
 * 질문유형. 원본 설문조사입력의 질문유형 목록 그대로다
 * (단일 선택 / 복수 선택 / 단일선택기타 / 복수선택기타 / 단답형 / 장문형 / 순위입력 / 날짜 / 점수 척도형).
 *
 * <p>'기타' 붙은 두 유형은 보기 말고 직접 입력하는 칸이 하나 더 붙는다.
 */
public enum SurveyQuestionType {

    SINGLE("단일 선택", true),
    MULTI("복수 선택", true),
    SINGLE_ETC("단일선택기타", true),
    MULTI_ETC("복수선택기타", true),
    SHORT_TEXT("단답형", false),
    LONG_TEXT("장문형", false),
    RANK("순위입력", true),
    DATE("날짜", false),
    SCALE("점수 척도형", false);

    private final String displayName;
    /** 보기항목을 쓰는 유형인가 */
    private final boolean usesOptions;

    SurveyQuestionType(String displayName, boolean usesOptions) {
        this.displayName = displayName;
        this.usesOptions = usesOptions;
    }

    public String getDisplayName() { return displayName; }

    public boolean usesOptions() { return usesOptions; }
}
