package com.erp.accounting.tax.paymentstatement;

/**
 * 지급명세서파일생성 자료구분 — 원본 [신규] 창 선택지 차례 그대로(E030503, 2026-10-14 loginaa 실측).
 * 자료구분 아래 꼬리표(신고구분 · 중도정산 · 반영기준 · 기타소득)는 자료구분마다 다르다.
 */
public enum PaymentStatementKind {
    BATCH("일괄생성", true, true, true),
    LABOR("근로소득", true, false, false),
    RETIREMENT("퇴직소득", false, false, false),
    RESIDENT_OTHER("거주자 기타소득", false, false, true),
    RESIDENT_BUSINESS("거주자 사업소득", false, true, false),
    NONRESIDENT("비거주자 사업,기타소득", false, true, false),
    INTEREST_DIVIDEND("이자,배당소득", false, false, false),
    MEDICAL("의료비명세서", false, false, false);

    private final String displayName;
    /** [중도정산포함] 꼬리표가 붙나 — 포함 · 미포함 */
    private final boolean midSettlement;
    /** [자료반영기준] 꼬리표 — 귀속연월 · 지급연월 */
    private final boolean basis;
    /** [기타소득] 꼬리표 — 포함 · 미포함 · 일부포함 */
    private final boolean otherIncome;

    PaymentStatementKind(String displayName, boolean midSettlement, boolean basis, boolean otherIncome) {
        this.displayName = displayName;
        this.midSettlement = midSettlement;
        this.basis = basis;
        this.otherIncome = otherIncome;
    }

    public String getDisplayName() { return displayName; }

    public boolean hasMidSettlement() { return midSettlement; }

    public boolean hasBasis() { return basis; }

    public boolean hasOtherIncome() { return otherIncome; }
}
