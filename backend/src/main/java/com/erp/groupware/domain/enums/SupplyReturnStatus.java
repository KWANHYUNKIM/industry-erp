package com.erp.groupware.domain.enums;

/** 공용품 반납여부. 원본 공용품관리등록 폼의 [미반납 / 반납 / 미지정] 라디오 그대로다. */
public enum SupplyReturnStatus {

    NOT_RETURNED("미반납"),
    RETURNED("반납"),
    UNSPECIFIED("미지정");

    private final String displayName;

    SupplyReturnStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
