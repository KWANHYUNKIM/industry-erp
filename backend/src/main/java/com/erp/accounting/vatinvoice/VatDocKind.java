package com.erp.accounting.vatinvoice;

/** 각종구분값변경의 [전자세금계산서] 칸 — 원본 드롭다운 차례 그대로(2026-10-04 loginaa 실측). */
public enum VatDocKind {
    PAPER("종이(세금)계산서"),
    ELECTRONIC("전자(세금)계산서"),
    MODIFY_ERROR("기재사항착오·정정"),
    MODIFY_AMOUNT("공급가액변동"),
    MODIFY_RETURN("환입"),
    MODIFY_CANCEL("계약의해제"),
    MODIFY_LC("내국신용장개설"),
    MODIFY_DUPLICATE("착오에의한이중발급"),
    ;

    private final String displayName;

    VatDocKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
