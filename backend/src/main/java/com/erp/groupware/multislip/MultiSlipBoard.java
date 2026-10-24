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

    /** 원본이 '입력된 줄' 로 치는 줄인가. 화면 MultiSlipPage#isEntered 와 같다(2026-10-21 실측). */
    public boolean isEntered(java.util.Map<String, Object> line) {
        return switch (this) {
            // 채권회수: [거래처] 만 고른 줄은 빈 줄, 담당자 없이 [거래처] + [목표금액] 은 줄
            case BOND_COLLECT -> has(line, "managerCode") || has(line, "target") || has(line, "c1") || has(line, "c2") || has(line, "c3");
            // 월근태: [부서] 없이 [이름] 만 넣은 줄도 줄. 친 칸이 하나라도 있으면 줄(청구한근무시간은 처음 값 0 이라 0 이 아닐 때만)
            case MONTHLY_ATTENDANCE -> java.util.stream.Stream.of("deptCode", "empCode", "availDays", "vacationDays", "totalHours",
                    "lateBefore", "lateAfter", "absent", "note").anyMatch(k -> has(line, k))
                    || (has(line, "claimedHours") && !line.get("claimedHours").toString().trim().matches("0+(\\.0*)?"));
            default -> has(line, firstCodeKey);
        };
    }

    private static boolean has(java.util.Map<String, Object> line, String key) {
        Object v = line.get(key);
        return v != null && !v.toString().isBlank();
    }
}
