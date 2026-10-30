package com.erp.groupware.approval;

/**
 * 기안서 '전표 출력물' 을 어떻게 붙였나 — 출력물 창 아래 [적용] · [자동갱신].
 */
public enum ApprovalOutputMode {
    /** [적용] — 적용한 때의 보고서를 얼려 둔다(원본 2026-10-30 실측). */
    SNAPSHOT,
    /** [자동갱신] — 조건만 두고 열 때마다 다시 조회한다(원본에서 눌러 보지 않음 — 추정). */
    AUTO
}
