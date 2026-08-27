package com.erp.auth.dto;

import com.erp.auth.domain.Role;
import com.erp.auth.domain.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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

            /**
             * 연간 휴가 부여일수. 안 주면 15일.
             *
             * <p>예전에는 이 값이 서비스 상수 하나였다 — 휴가잔여일수현황이 전원을 15일로
             * 보여줬는데, 근속연수에 따라 사람마다 다르다(15일에서 시작해 3년차부터 2년마다
             * +1일, 최대 25일). 소수 3자리인 이유는 시간 단위 휴가가 0.125일씩 쌓이기 때문이다.
             */
            @PositiveOrZero(message = "휴가일수는 0 이상이어야 합니다.") BigDecimal annualLeaveDays,

            /** 부여할 역할 코드 목록 (예: ["ADMIN", "STAFF"]) */
            Set<String> roleNames
    ) {}

    /** 사용자 수정 요청 (비밀번호는 값이 있을 때만 변경) */
    public record UpdateUserRequest(
            @NotBlank(message = "이름을 입력하세요.") String name,
            @Email(message = "올바른 이메일 형식이 아닙니다.") String email,
            String department,
            /**
             * 연간 휴가 부여일수. 안 주면 15일.
             *
             * <p>예전에는 이 값이 서비스 상수 하나였다 — 휴가잔여일수현황이 전원을 15일로
             * 보여줬는데, 근속연수에 따라 사람마다 다르다(15일에서 시작해 3년차부터 2년마다
             * +1일, 최대 25일). 소수 3자리인 이유는 시간 단위 휴가가 0.125일씩 쌓이기 때문이다.
             */
            @PositiveOrZero(message = "휴가일수는 0 이상이어야 합니다.") BigDecimal annualLeaveDays,
            Boolean enabled,
            Set<String> roleNames,
            String password
    ) {}

    /**
     * 사용여부만 바꾸는 요청.
     *
     * <p>목록에서 사용여부를 토글할 때 이름·이메일·부서·권한까지 함께 보내면,
     * 그 행이 화면에 뜬 뒤 다른 사람이 바꾼 값을 <b>토글한 사람이 모르는 채로 되돌린다.</b>
     * 사용여부만 바꾸겠다는 요청에는 사용여부만 싣는다. 계정과목이 이미 같은 방식이다
     * ({@code PATCH /api/accounts/{id}}).
     */
    public record ToggleEnabledRequest(
            @NotNull(message = "사용여부를 지정하세요.") Boolean enabled
    ) {}

    /** 사용자 응답 */
    public record UserResponse(
            Long id,
            String username,
            String name,
            String email,
            String department,
            /** 연간 휴가 부여일수. 휴가잔여일수현황의 '휴가일수' 열이 이 값이다. */
            BigDecimal annualLeaveDays,
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
                    user.getAnnualLeaveDays(),
                    user.isEnabled(),
                    roleNames
            );
        }
    }
}
