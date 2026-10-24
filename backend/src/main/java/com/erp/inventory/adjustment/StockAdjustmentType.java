package com.erp.inventory.adjustment;

/**
 * 기타이동 유형(창고이동 제외).
 * SELF_USE·DEFECT·SUBSTITUTE·DISPOSAL 은 수량만큼 재고를 차감하고,
 * ADJUST 는 실사수량과 현재고의 차이만큼 증감한다.
 */
public enum StockAdjustmentType {
    SELF_USE("자가사용", "SU-"),
    DEFECT("불량처리", "DF-"),
    SUBSTITUTE("대체사용", "SB-"),
    DISPOSAL("폐기", "DP-"),
    ADJUST("재고조정", "SA-");

    private final String displayName;
    private final String docPrefix;

    StockAdjustmentType(String displayName, String docPrefix) {
        this.displayName = displayName;
        this.docPrefix = docPrefix;
    }

    /**
     * 전표번호 접두어 — 종류마다 따로 센다. 원본은 같은 날 자가사용 -2 를 넣은 뒤에도 첫 불량처리가 -1 이다
     * (2026-10-21 loginaa 재고1 실측). 예전엔 모두 SA- 를 같이 써서 그날 첫 불량처리가 -2 가 됐다.
     */
    public String getDocPrefix() {
        return docPrefix;
    }

    public String getDisplayName() {
        return displayName;
    }
}
