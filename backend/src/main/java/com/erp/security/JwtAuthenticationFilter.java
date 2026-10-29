package com.erp.security;

import com.erp.settings.company.CompanyAccessService;
import com.erp.tenant.StartupGate;
import com.erp.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.lang.NonNull;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 요청 헤더의 Bearer 토큰을 검사해 SecurityContext 에 인증 정보를 채운다.
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;
    private final CustomUserDetailsService userDetailsService;
    private final CompanyAccessService companyAccessService;
    private final StartupGate startupGate;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String token = resolveToken(request);
        // 기동이 덜 끝났으면 토큰이 맞는지 가릴 수 없다 — 401(=로그아웃) 이 아니라 503(=잠시 뒤 다시)
        if (token != null && !startupGate.isReady()) {
            unavailable(response);
            return;
        }
        boolean tenantSet = false;
        try {
            // 로그인 뒤에 회사가 중지되거나 사용기한이 지나면 토큰이 살아 있어도 인증하지 않는다(→ 401 → 로그인 화면,
            // 거기서 이유를 말해 준다). 요청마다 public.companies 를 한 번 읽는다.
            String tenant = token != null && tokenProvider.validate(token) ? tenantOf(token) : null;
            if (tenant != null && companyAccessService.isUsable(tenant)) {
                // 사용자 로딩·이후 모든 DB 접근이 이 회사 스키마로 가도록 테넌트를 먼저 건다.
                TenantContext.set(tenant);
                tenantSet = true;

                String username = tokenProvider.getUsername(token);
                UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                userDetails, null, userDetails.getAuthorities());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }

            filterChain.doFilter(request, response);
        } catch (UsernameNotFoundException e) {
            // 토큰은 맞는데 사용자가 없다 — 진짜 401. 인증 없이 보내면 EntryPoint 가 401 을 낸다.
            SecurityContextHolder.clearContext();
            if (!response.isCommitted()) filterChain.doFilter(request, response);
        } catch (DataAccessException | CannotCreateTransactionException e) {
            // DB 가 잠시 못 받는 상태(마이그레이션 잠금 · 연결 풀 · 재기동). 예전엔 예외가 /error 로 넘어가 401 이 됐다.
            SecurityContextHolder.clearContext();
            if (!response.isCommitted()) unavailable(response);
        } finally {
            if (tenantSet) {
                TenantContext.clear();   // 스레드 풀에 테넌트가 눌어붙지 않도록
            }
        }
    }

    private void unavailable(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
        response.setHeader("Retry-After", "3");
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"status\":503,\"message\":\"서버가 준비 중입니다. 잠시 뒤 다시 시도하세요.\"}");
    }

    /** 회사 정보가 없는 옛 토큰은 본사 것이다(TenantContext.set(null) 이 본사로 가던 것과 같다). */
    private String tenantOf(String token) {
        String t = tokenProvider.getTenant(token);
        return t == null || t.isBlank() ? TenantContext.DEFAULT : t;
    }

    private String resolveToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }
}
