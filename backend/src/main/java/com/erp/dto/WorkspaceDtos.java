package com.erp.dto;

import com.erp.domain.UserNote;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;
import java.util.List;

/** 우측 앱바 위젯 — 통합검색 · 알림 · E Note */
public final class WorkspaceDtos {

    private WorkspaceDtos() {}

    // ── 통합검색 ──────────────────────────────────────────────────────

    /** 검색 결과 한 줄. to 는 클릭했을 때 이동할 화면 경로다. */
    public record SearchHit(String title, String subtitle, String to) {}

    /** 종류별로 묶은 결과 (품목·거래처·판매·구매·수주) */
    public record SearchGroup(String type, String typeName, int total, List<SearchHit> hits) {}

    public record SearchResponse(String keyword, int total, List<SearchGroup> groups) {}

    // ── 알림 ──────────────────────────────────────────────────────────

    /**
     * 알림 한 건. 지금 손봐야 할 일만 담는다(내 결재 차례, 안전재고 미달, 미출고, 만료임박 계약).
     * level: WARN 은 붉게, INFO 는 파랗게 보여 준다.
     */
    public record Notification(String type, String level, String title, String message, int count, String to) {}

    public record NotificationResponse(int total, List<Notification> notifications) {}

    // ── E Note ────────────────────────────────────────────────────────

    public record NoteRequest(
            @NotBlank(message = "메모 내용을 입력하세요.") String content,
            Boolean pinned
    ) {}

    public record NoteResponse(Long id, String content, boolean pinned, LocalDateTime updatedAt) {
        public static NoteResponse from(UserNote n) {
            return new NoteResponse(n.getId(), n.getContent(), n.isPinned(), n.getUpdatedAt());
        }
    }
}
