package com.erp.security;

import com.erp.common.ApiException;
import com.erp.common.MenuPermissionCatalog;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 메뉴 권한 인가. 인증(JWT 필터)은 이미 끝난 뒤 이 인터셉터가 "이 사용자가 이 API 를 쓸 수 있나"를 본다.
 *
 * <p><b>정책(v1)</b>
 * <ul>
 *   <li>ADMIN 역할이면 전권(바이패스).</li>
 *   <li>조회(GET/HEAD)는 인증만 되면 허용한다. (리소스 간 참조 조회가 많아 읽기를 코드로 막으면
 *       정상 화면이 깨진다. 읽기 차단은 리소스별 상호참조 정리 후 후속 단계.)</li>
 *   <li>변경(POST/PUT/PATCH/DELETE)은 해당 경로를 관장하는 권한 코드를 가진 역할만 허용, 아니면 403.</li>
 *   <li>카탈로그에 매핑이 없는 경로({@code /api/meta}, {@code /api/workspace}, {@code /api/me} 등
 *       공통·참조)는 인증만 되면 통과.</li>
 * </ul>
 */
@Component
public class AuthorizationInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) {

        // 조회는 인증만 되면 통과 (읽기 차단은 v1 범위 밖).
        String method = request.getMethod();
        if (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method)
                || HttpMethod.OPTIONS.matches(method)) {
            return true;
        }

        String required = MenuPermissionCatalog.requiredCode(request.getRequestURI());
        if (required == null) {
            return true;   // 공통·참조 경로 (권한 불요)
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UserPrincipal principal) {
            if (principal.isAdmin() || principal.getPermissionCodes().contains(required)) {
                return true;
            }
        }
        throw ApiException.forbidden("이 기능에 접근할 권한이 없습니다.");
    }
}
