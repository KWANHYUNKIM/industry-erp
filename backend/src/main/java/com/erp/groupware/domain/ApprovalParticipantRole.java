package com.erp.groupware.domain;

/**
 * 결재권 없는 기안서 참여자 구분. 결재자는 {@link ApprovalLine} 이 담당한다.
 */
public enum ApprovalParticipantRole {
    REFERENCE("수신참조"),
    SHARE("공유자");

    private final String displayName;

    ApprovalParticipantRole(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
