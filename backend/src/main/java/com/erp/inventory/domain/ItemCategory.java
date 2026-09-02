package com.erp.inventory.domain;

/**
 * 품목 분류. 제조업 기준 표준 구분.
 *
 * <p><b>표시 이름은 원본(이카운트) 표기를 따른다.</b> 사본의 품목등록 리스트에
 * '[원재료]' '[부재료]' '[반제품]' '[제품]' '[상품]' 으로 찍혀 있다.
 * 우리는 '원자재·부자재' 로 쓰고 있어서, 같은 것을 두 화면이 다른 말로 부르고 있었다.
 * enum 상수 이름은 그대로다 — DB 에 들어가는 값이고 CHECK 제약이 그것을 본다.
 */
public enum ItemCategory {
    RAW_MATERIAL("원재료"),
    SUB_MATERIAL("부재료"),
    SEMI_FINISHED("반제품"),
    FINISHED("제품"),
    MERCHANDISE("상품");

    private final String displayName;

    ItemCategory(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
