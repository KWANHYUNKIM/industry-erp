package com.erp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Date;
import java.util.Set;

/**
 * JWT 토큰 생성 및 검증 담당.
 */
@Slf4j
@Component
public class JwtTokenProvider {

    /** HS256 의 최소 키 길이. */
    static final int MIN_SECRET_BYTES = 32;

    static final String TOKEN_VERSION_CLAIM = "tv";

    /** 예전 application.yml 에 기본값으로 적혀 있던 값 — 공개 저장소에 있으므로 어느 프로필에서도 받지 않는다. */
    private static final Set<String> PUBLISHED_SECRETS = Set.of(
            "change-this-in-production-please-use-a-long-random-secret-key-32bytes+");

    private final SecretKey key;
    private final long expirationMs;

    public JwtTokenProvider(
            @Value("${app.jwt.secret:}") String secret,
            @Value("${app.jwt.expiration-ms}") long expirationMs,
            Environment env) {
        this.key = Keys.hmacShaKeyFor(resolveSecret(secret, env));
        this.expirationMs = expirationMs;
    }

    /**
     * 서명 비밀을 정한다. 기본값으로 폴백하지 않는다 — 없거나 짧거나 공개된 값이면 기동 실패.
     * dev 프로필(로컬 {@code spring-boot:run})만 예외로, 그 기동 동안만 쓰는 무작위 값으로 뜬다(재기동하면 다시 로그인).
     */
    private static byte[] resolveSecret(String secret, Environment env) {
        String s = secret == null ? "" : secret.trim();
        String problem = s.isEmpty() ? "비어 있다"
                : PUBLISHED_SECRETS.contains(s) ? "저장소에 공개된 옛 기본값이다"
                : s.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES ? MIN_SECRET_BYTES + "바이트보다 짧다"
                : null;
        if (problem == null) return s.getBytes(StandardCharsets.UTF_8);
        if (env.acceptsProfiles(Profiles.of("dev"))) {
            log.warn("app.jwt.secret(JWT_SECRET) 가 {} — dev 프로필이라 이번 기동만 쓰는 임시 비밀로 뜬다. "
                    + "재기동해도 로그인을 유지하려면 config/local.properties 에 넣는다(config/local.properties.example).", problem);
            byte[] random = new byte[48];
            new SecureRandom().nextBytes(random);
            return random;
        }
        throw new IllegalStateException("JWT 서명 비밀(app.jwt.secret · 환경변수 JWT_SECRET)이 " + problem
                + ". 32바이트 이상 무작위 값을 환경변수로 주세요(예: openssl rand -base64 48).");
    }

    /** 사용자명(subject) + 테넌트(회사 스키마) + 토큰 버전(tv, 사용자의 token_version) 기준으로 토큰 생성 */
    public String createToken(String username, String tenant, int tokenVersion) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);
        return Jwts.builder()
                .subject(username)
                .claim("tenant", tenant)
                .claim(TOKEN_VERSION_CLAIM, tokenVersion)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /** 토큰에서 사용자명 추출 */
    public String getUsername(String token) {
        return parse(token).getSubject();
    }

    /** 토큰에서 테넌트(회사 스키마) 추출. 없으면 null(구 토큰 → 본사 취급). */
    public String getTenant(String token) {
        Object t = parse(token).get("tenant");
        return t == null ? null : t.toString();
    }

    /** 토큰 버전(tv). 없으면 null — 그런 토큰은 받지 않는다(필터). */
    public Integer getTokenVersion(String token) {
        Object v = parse(token).get(TOKEN_VERSION_CLAIM);
        return v instanceof Number n ? n.intValue() : null;
    }

    /** 토큰 유효성 검증 */
    public boolean validate(String token) {
        try {
            parse(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("유효하지 않은 JWT: {}", e.getMessage());
            return false;
        }
    }

    private Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
