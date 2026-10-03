package com.erp.hr.employee;

/**
 * 원본 관리 &gt; 사원등록의 <b>[급여구분]</b>. 사원리스트에 열로, 조회 조건에 라디오로 나온다.
 * 새 사원은 원본처럼 고정급으로 시작한다.
 */
public enum PayType {
    FIXED("고정급"),
    VARIABLE("변동급");

    private final String displayName;

    PayType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
