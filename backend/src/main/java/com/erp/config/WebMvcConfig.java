package com.erp.config;

import com.erp.security.AuthorizationInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 메뉴 권한 인가 인터셉터를 /api/** 에 건다. 인증(JWT)은 Security 필터가, 인가(메뉴 권한)는
 * {@link AuthorizationInterceptor} 가 담당한다.
 */
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final AuthorizationInterceptor authorizationInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authorizationInterceptor)
                .addPathPatterns("/api/**")
                // 로그인·헬스는 인증 전이므로 인가 대상 아님
                .excludePathPatterns("/api/auth/**", "/api/health");
    }
}
