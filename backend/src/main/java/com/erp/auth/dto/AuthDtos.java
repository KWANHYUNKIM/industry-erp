package com.erp.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 인증 관련 요청/응답 DTO 모음.
 */
public final class AuthDtos {

    private AuthDtos() {}

    public record LoginRequest(
            /** 회사코드. 비우면 본사(0001)로 로그인 (하위호환). */
            String companyCode,
            @NotBlank(message = "아이디를 입력하세요.") String username,
            @NotBlank(message = "비밀번호를 입력하세요.") String password
    ) {}

    public record LoginResponse(
            String token,
            String companyCode,
            String companyName,
            UserDtos.UserResponse user
    ) {}
}
