package com.erp.security;

import com.erp.auth.workpermission.EffectivePermissions;
import com.erp.auth.workpermission.WorkAction;
import com.erp.common.MenuPermissionCatalog;
import com.erp.common.PermissionDeniedException;
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
 * 업무권한 인가 — 단일 출처. 인증(JWT 필터)이 끝난 뒤 "이 사용자가 이 API 를 이 화면에서 쓸 수 있나"를 본다.
 * 원본 이카운트 업무권한(Self-Customizing › 사용자관리)과 같은 규칙이다(plans/데이터이관/원본-업무권한.md).
 *
 * <p><b>무엇으로 판단하나</b>
 * <ul>
 *   <li>API 경로 → 업무: {@link MenuPermissionCatalog#requiredCode}. 매핑이 없는 경로(/api/me · /api/workspace · /api/auth …)는 인증만.</li>
 *   <li>요청한 화면: 프론트가 모든 요청에 {@code X-Erp-Menu}(화면 경로)와 {@code X-Erp-Work}(그 화면의 업무 코드, 공용 화면이면 '-')를 싣는다
 *       (api/client.ts). 예외(메뉴) — 업무 안 하위 화면마다의 진입 — 는 이 화면 경로로 본다.</li>
 *   <li>마스터(ADMIN)는 전권.</li>
 * </ul>
 *
 * <p><b>조회(GET)</b> — 그 업무에 들어갈 수 있으면 통과. 못 들어가는 업무의 자료라도, <b>들어갈 수 있는 화면이 곁다리로 읽는 것</b>
 * (판매입력의 품목 코드도움 · 결재선의 사용자 목록 …)은 통과시킨다 — 원본도 판매 권한만 있는 사람이 판매입력에서 품목을 고른다.
 * 공용 화면(대시보드 · 데이터센터 — 업무 '-')에서 읽는 것도 같다. 화면 머리가 없는 요청(스크립트)은 API 경로의 업무만 본다.
 * <i>한계(가정)</i>: 화면 머리는 브라우저가 보내는 값이라 꾸밀 수 있다. 그래도 그 사람이 들어갈 수 있는 화면 중 하나를
 * 대야 하고, 예전(조회는 전부 열림)보다 좁다. 아래 {@link #READ_GUARDED} 는 화면과 무관하게 늘 막는다.
 *
 * <p><b>쓰기(POST · PUT · PATCH · DELETE)</b> — API 경로의 업무에 들어갈 수 있고, 행위(POST 입력 · PUT/PATCH 수정 · DELETE 삭제)가
 * 예외(행위)로 꺼져 있지 않아야 한다. 거부는 {@link PermissionDeniedException} — 본문에 업무 · 권한종류 · 행위를 싣는다.
 * <i>가정</i>: 조회를 POST 로 하는 몇 API(검색 · 미리보기)도 '입력'으로 센다.
 */
@Component
public class AuthorizationInterceptor implements HandlerInterceptor {

    public static final String MENU_HEADER = "X-Erp-Menu";
    public static final String WORK_HEADER = "X-Erp-Work";

    /**
     * <b>화면과 무관하게 늘 막는 조회.</b> 곁다리 조회 허용이 여기는 안 먹는다.
     *
     * <p>급여가 그렇다 — 남의 급여는 어느 화면에서 읽든 그 업무 권한이 있어야 한다.
     * 계좌·카드는 자금(BANK) 외에 전표입력(ACCOUNTING)·수입금액(FINANCE)·급여이체(PAYROLL)가 계좌 드롭다운으로 쓰므로
     * <b>그 중 하나라도</b> 들어갈 수 있으면 통과.
     */
    private record ReadGuard(String prefix, List<String> anyOf) {}

    private static final List<ReadGuard> READ_GUARDED = List.of(
            new ReadGuard("/api/payslips", List.of("PAYROLL")),
            new ReadGuard("/api/pay-settings", List.of("PAYROLL")),
            new ReadGuard("/api/bank-cards", List.of("BANK", "ACCOUNTING", "FINANCE", "PAYROLL")));

    private static ReadGuard readGuardFor(String uri) {
        return READ_GUARDED.stream()
                .filter(g -> uri.equals(g.prefix()) || uri.startsWith(g.prefix() + "/"))
                .findFirst().orElse(null);
    }

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        String uri = request.getRequestURI();
        String method = request.getMethod();
        boolean read = HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method)
                || HttpMethod.OPTIONS.matches(method);
        if (HttpMethod.OPTIONS.matches(method)) return true;

        String code = MenuPermissionCatalog.requiredCode(uri);
        ReadGuard guard = read ? readGuardFor(uri) : null;
        if (code == null && guard == null) {
            return true;   // 공통·참조 경로 (권한 불요)
        }

        EffectivePermissions perms = currentPermissions();
        if (perms == null) {
            // 인증 없이 여기까지 온 요청(공개 경로) — 예전처럼 조회는 두고 쓰기는 막는다.
            if (read) return true;
            throw denied(code, WorkAction.CREATE, null);
        }
        if (perms.isMaster()) return true;

        String menu = header(request, MENU_HEADER);
        String menuWork = header(request, WORK_HEADER);
        // 예외(메뉴)는 그 화면이 이 업무의 화면일 때만 본다.
        String menuOfThisWork = code != null && code.equals(menuWork) ? menu : null;

        if (read) {
            if (guard != null) {
                if (guard.anyOf().stream().anyMatch(c -> perms.canEnter(c, null))) return true;
                throw denied(guard.anyOf().get(0), WorkAction.VIEW, menu);
            }
            if (perms.canEnter(code, menuOfThisWork)) return true;
            if (menu != null && menuWork != null && !code.equals(menuWork)) {
                // 곁다리 조회 — 공용 화면('-')이거나 들어갈 수 있는 다른 업무의 화면
                if ("-".equals(menuWork)) return true;
                if (MenuPermissionCatalog.exists(menuWork) && perms.canEnter(menuWork, menu)) return true;
            }
            throw denied(code, WorkAction.VIEW, menu);
        }

        WorkAction action = HttpMethod.DELETE.matches(method) ? WorkAction.DELETE
                : HttpMethod.POST.matches(method) ? WorkAction.CREATE : WorkAction.UPDATE;
        if (!perms.canEnter(code, menuOfThisWork) || !perms.can(code, action)) {
            throw denied(code, action, menu);
        }
        return true;
    }

    private static PermissionDeniedException denied(String code, WorkAction action, String menu) {
        return new PermissionDeniedException(code, MenuPermissionCatalog.nameOf(code), action.label(), menu);
    }

    private static String header(HttpServletRequest request, String name) {
        String v = request.getHeader(name);
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static EffectivePermissions currentPermissions() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal principal)) {
            return null;
        }
        return principal.getPermissions();
    }
}
