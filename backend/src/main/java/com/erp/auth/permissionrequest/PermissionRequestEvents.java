package com.erp.auth.permissionrequest;

import java.util.List;

/**
 * 권한요청 알림 이벤트. auth 는 메신저(groupware)를 모른다(groupware → auth 만 허용, CLAUDE.md 4.1) —
 * 그래서 이벤트로 내고 groupware 의 듣는 쪽이 메신저 메시지를 보낸다. 같은 트랜잭션 안에서 동기로 돈다.
 */
public final class PermissionRequestEvents {

    private PermissionRequestEvents() {}

    /** 새 권한요청 — 마스터들에게 알린다. */
    public record Requested(Long requestId, Long requesterId, List<Long> masterIds, String workName,
                            String menuName, String reason) {}

    /** 승인 · 반려 — 요청자(와 승인자)에게 결과를 알린다. */
    public record Processed(Long requestId, Long requesterId, Long approverId, String workName,
                            String menuName, boolean approved) {}
}
