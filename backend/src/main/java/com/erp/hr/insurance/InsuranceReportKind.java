package com.erp.hr.insurance;

/** 4대보험신고 서식 — 원본 [서식명] 조건의 세 값. */
public enum InsuranceReportKind {
    ACQUIRE("사업장가입자 자격취득 신고서"),
    LOSS("사업장가입자 자격상실 신고서"),
    DEPENDENT("피부양자 자격(취득,상실) 신고서");

    private final String formName;

    InsuranceReportKind(String formName) { this.formName = formName; }

    public String formName() { return formName; }
}
