package com.erp.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 지금 요청을 보낸 사용자 — 서비스가 "호출자가 마스터인가" 같은 것을 컨트롤러 인자 없이 확인할 때 쓴다.
 */
public final class CurrentUser {

    private CurrentUser() {}

    /** 로그인한 사용자. 요청 밖(기동 시더 · 회사 생성 시드)이면 null. */
    public static UserPrincipal principal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof UserPrincipal p ? p : null;
    }

    /**
     * 마스터만 할 수 있는 일인가 — 로그인한 사용자가 마스터가 아니면 false.
     * 요청 밖(시스템 호출, principal 없음)은 막지 않는다.
     */
    public static boolean isMasterOrSystem() {
        UserPrincipal p = principal();
        return p == null || p.isAdmin();
    }
}
