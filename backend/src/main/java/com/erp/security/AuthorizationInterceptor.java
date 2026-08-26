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

import java.util.List;

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

    /**
     * <b>읽기까지 막는 경로.</b> 나머지 조회는 v1 정책대로 인증만 되면 통과하지만,
     * 여기 있는 것은 "권한 없는 사람이 봐도 그만"이라고 할 수 없다.
     *
     * <p>급여가 그렇다. 권한이 하나도 없는 계정으로도 전 직원 급여명세가 그대로 읽혔다.
     * 남의 급여를 보는 것은 v1 이냐 아니냐의 문제가 아니라 애초에 열려 있으면 안 되는 것이고,
     * 이걸 막는다고 다른 화면이 깨지지도 않는다(급여 화면은 PAYROLL 을 가진 사람이 쓴다).
     *
     * <p>여기에 경로를 더할 때는 <b>그 화면이 그 권한 없이 열릴 일이 없는지</b> 확인해야 한다.
     * 읽기를 막으면 그 자료를 곁다리로 참조하던 다른 화면이 조용히 빈칸이 된다 —
     * 읽기 차단을 한꺼번에 안 하고 이렇게 하나씩 여는 이유다.
     */
    private static final List<String> READ_GUARDED = List.of(
            "/api/payslips",       // 급여명세
            "/api/pay-settings");  // 급여 항목·그룹·이체 내역

    private static boolean isReadGuarded(String uri) {
        return READ_GUARDED.stream().anyMatch(p -> uri.equals(p) || uri.startsWith(p + "/")
                || uri.startsWith(p + "?"));
    }

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) {

        // 조회는 인증만 되면 통과 (읽기 차단은 v1 범위 밖) — 단 아래 READ_GUARDED 는 예외.
        String method = request.getMethod();
        if (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method)
                || HttpMethod.OPTIONS.matches(method)) {
            if (!isReadGuarded(request.getRequestURI())) {
                return true;
            }
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
