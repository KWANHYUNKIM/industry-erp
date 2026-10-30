package com.erp.auth.workpermission;

/** 업무 안의 행위. 원본 상세 권한(입력 · 수정 · 삭제 · 외부전송)과 같은 이름. 조회는 진입 권한이 정한다. */
public enum WorkAction {
    VIEW("조회"), CREATE("입력"), UPDATE("수정"), DELETE("삭제"), EXPORT("외부전송");

    private final String label;

    WorkAction(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
