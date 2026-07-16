package com.erp.auth.dto;

import com.erp.auth.domain.Role;
import com.erp.auth.domain.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 사용자 관련 요청/응답 DTO 모음.
 */
public final class UserDtos {

    private UserDtos() {}

    /** 사용자 생성 요청 */
    public record CreateUserRequest(
            @NotBlank(message = "아이디를 입력하세요.")
            @Size(min = 3, max = 50, message = "아이디는 3~50자여야 합니다.")
            String username,

            @NotBlank(message = "비밀번호를 입력하세요.")
            @Size(min = 4, max = 100, message = "비밀번호는 최소 4자 이상이어야 합니다.")
            String password,

            @NotBlank(message = "이름을 입력하세요.")
            String name,

            @Email(message = "올바른 이메일 형식이 아닙니다.")
            String email,

            String department,

            /** 부여할 역할 코드 목록 (예: ["ADMIN", "STAFF"]) */
            Set<String> roleNames
    ) {}

    /** 사용자 수정 요청 (비밀번호는 값이 있을 때만 변경) */
    public record UpdateUserRequest(
            @NotBlank(message = "이름을 입력하세요.") String name,
            @Email(message = "올바른 이메일 형식이 아닙니다.") String email,
            String department,
            Boolean enabled,
            Set<String> roleNames,
            String password
    ) {}

    /** 사용자 응답 */
    public record UserResponse(
            Long id,
            String username,
            String name,
            String email,
            String department,
            boolean enabled,
            List<String> roles
    ) {
        public static UserResponse from(User user) {
            List<String> roleNames = user.getRoles().stream()
                    .map(Role::getName)
                    .sorted()
                    .collect(Collectors.toList());
            return new UserResponse(
                    user.getId(),
                    user.getUsername(),
                    user.getName(),
                    user.getEmail(),
                    user.getDepartment(),
                    user.isEnabled(),
                    roleNames
            );
        }
    }
}
