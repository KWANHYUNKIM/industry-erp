package com.erp.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 요청 id. 들어온 {@code X-Request-Id} 를 쓰고, 없거나 이상하면 새로 만든다.
 *
 * <p>MDC({@value #MDC_KEY})에 넣어 그 요청의 서버 로그 줄마다 찍히게 하고(application.yml
 * {@code logging.pattern.level}), 응답 머리에도 돌려준다. 오류 응답(ProblemDetail)에는
 * {@code requestId} 확장 필드로 실린다 — 화면 오류 문구에서 서버 로그의 같은 요청을 찾는다.
 *
 * <p>보안 필터보다 먼저 돈다(가장 높은 우선순위) — 401 · 403 도 id 를 단다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    /** 받아 줄 id 꼴. 로그에 그대로 찍히므로 줄바꿈 · 공백 같은 것은 받지 않는다(로그 위조). */
    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String incoming = request.getHeader(HEADER);
        String id = incoming != null && SAFE.matcher(incoming).matches()
                ? incoming
                : UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        MDC.put(MDC_KEY, id);
        response.setHeader(HEADER, id);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
