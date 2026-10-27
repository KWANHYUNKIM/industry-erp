package com.erp.settings.company.dto;

import com.erp.settings.company.Company;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class CompanyDtos {

    private CompanyDtos() {}

    /** 회사 생성 요청. 회사코드는 서버가 자동 발급하고, 첫 관리자 계정을 함께 만든다. */
    public record CreateCompanyRequest(
            @Size(max = 100, message = "회사명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "회사명을 입력하세요.") String name,
            @NotBlank(message = "관리자 아이디를 입력하세요.")
            @Size(min = 3, max = 50, message = "아이디는 3~50자여야 합니다.") String adminUsername,
            @NotBlank(message = "관리자 비밀번호를 입력하세요.")
            @Size(min = 4, max = 100, message = "비밀번호는 최소 4자 이상이어야 합니다.") String adminPassword,
            String adminName,
            @Min(value = 1, message = "사용자 수는 1 이상이어야 합니다.") Integer maxUsers,
            LocalDate expiresOn
    ) {}

    /** 회사 수정 — 회사명 · 사용여부 · 사용자 수 · 사용기한. 회사코드 · 스키마는 바꾸지 않는다. */
    public record UpdateCompanyRequest(
            @Size(max = 100, message = "회사명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "회사명을 입력하세요.") String name,
            @NotNull(message = "사용여부를 정하세요.") Boolean active,
            @Min(value = 1, message = "사용자 수는 1 이상이어야 합니다.") Integer maxUsers,
            LocalDate expiresOn
    ) {}

    public record CompanyResponse(
            Long id,
            String code,
            String name,
            String schemaName,
            boolean active,
            LocalDateTime createdAt,
            Integer maxUsers,
            LocalDate expiresOn
    ) {
        public static CompanyResponse from(Company c) {
            return new CompanyResponse(c.getId(), c.getCode(), c.getName(),
                    c.getSchemaName(), c.isActive(), c.getCreatedAt(), c.getMaxUsers(), c.getExpiresOn());
        }
    }
}
