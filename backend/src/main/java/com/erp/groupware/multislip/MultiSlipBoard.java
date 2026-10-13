package com.erp.groupware.multislip;

/**
 * 그룹웨어 › 다목적관리의 '다목적 전표' 넷(2026-10-14 loginaa 실측, plans/그룹웨어/E200276.md).
 *
 * 이름에 '게시판' 이 붙어 있어도 업무관리 게시판(PostBoard)과 틀이 다르다 — 머리 `일자-No.` 하나 + 격자 줄 여럿.
 * 원본은 회사가 입력항목(열)을 정하는 표인데, 우리는 원본 넷의 열을 고정으로 둔다(열 정의는 화면 MultiSlipPage).
 *
 * {@link #firstCodeKey} — 원본은 수량 · 단가 · 비고만 친 줄을 '입력된 줄' 로 치지 않는다. 첫 코드 칸이 있어야 줄이다.
 */
public enum MultiSlipBoard {
    /** 다목적 게시판 입력항목은 (E200276) — 첫 칸 담당자. */
    MULTI_INPUT("다목적 게시판 입력항목은", "managerCode"),
    /** 영업자별 계약상황 (E200268) — 첫 코드 칸 사번. */
    SALES_CONTRACT("영업자별 계약상황", "empCode"),
    /** 채권회수 상황판 (E200269) — 첫 칸 담당자. */
    BOND_COLLECT("채권회수 상황판", "managerCode"),
    /** 월근태 (E200275) — 첫 칸 부서. */
    MONTHLY_ATTENDANCE("월근태", "deptCode");

    private final String displayName;
    private final String firstCodeKey;

    MultiSlipBoard(String displayName, String firstCodeKey) {
        this.displayName = displayName;
        this.firstCodeKey = firstCodeKey;
    }

    public String getDisplayName() { return displayName; }

    public String firstCodeKey() { return firstCodeKey; }
}
