package com.erp.auth.auth.dto;

import com.erp.auth.user.dto.UserDtos;
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

    /** 사람 그림 › [개인정보수정] — 본인 성명 · Email (아이디는 바꾸지 않는다) */
    public record MyProfileResponse(String username, String name, String email) {}

    public record MyProfileRequest(
            @NotBlank(message = "성명을 입력하세요.") String name,
            String email
    ) {}

    /** 사람 그림 › [개인정보수정] › [비밀번호 변경] */
    public record MyPasswordRequest(
            @NotBlank(message = "현재 비밀번호를 입력하세요.") String currentPassword,
            @NotBlank(message = "새 비밀번호를 입력하세요.") String newPassword
    ) {}
}
