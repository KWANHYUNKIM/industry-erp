package com.erp.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 인증 관련 요청/응답 DTO 모음.
 */
public final class AuthDtos {

    private AuthDtos() {}

    public record LoginRequest(
            @NotBlank(message = "아이디를 입력하세요.") String username,
            @NotBlank(message = "비밀번호를 입력하세요.") String password
    ) {}

    public record LoginResponse(
            String token,
            UserDtos.UserResponse user
    ) {}
}
