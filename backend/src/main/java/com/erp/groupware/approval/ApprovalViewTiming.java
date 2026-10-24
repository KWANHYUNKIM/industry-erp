package com.erp.groupware.approval;

/**
 * 원본 공통양식 입력화면설정 › [기안서확인시점설정] 의 라디오 셋(2026-10-13 실측).
 * 기본설정은 수신참조면 결재완료후, 공유문서면 결재완료전이다.
 */
public enum ApprovalViewTiming {
    DEFAULT,
    /** 결재완료전 — 기안하자마자 본다. */
    BEFORE,
    /** 결재완료후 — 최종 승인된 뒤에야 본다. */
    AFTER;

    /** 이 참여자가 지금 문서를 볼 수 있나. */
    public boolean visible(ApprovalParticipantRole role, ApprovalStatus status) {
        ApprovalViewTiming t = this == DEFAULT ? (role == ApprovalParticipantRole.REFERENCE ? AFTER : BEFORE) : this;
        // 결재완료전이라도 아직 상신하지 않은(기안중) 문서는 기안자 것이다.
        return t == BEFORE ? status != ApprovalStatus.DRAFTING : status == ApprovalStatus.APPROVED;
    }
}
