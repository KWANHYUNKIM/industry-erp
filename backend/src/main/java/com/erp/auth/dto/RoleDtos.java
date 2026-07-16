package com.erp.auth.dto;

import com.erp.auth.domain.Permission;
import com.erp.auth.domain.Role;
import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Set;

public final class RoleDtos {

    private RoleDtos() {}

    public record RoleResponse(
            Long id,
            String name,
            String displayName,
            String description,
            boolean system,
            long userCount,
            List<String> permissionCodes
    ) {
        public static RoleResponse from(Role role, long userCount) {
            List<String> codes = role.getPermissions().stream()
                    .map(Permission::getCode)
                    .sorted()
                    .toList();
            return new RoleResponse(
                    role.getId(),
                    role.getName(),
                    role.getDisplayName(),
                    role.getDescription(),
                    isSystem(role.getName()),
                    userCount,
                    codes);
        }

        /** ADMIN/MANAGER/STAFF 는 삭제·이름변경을 막는 기본 역할. */
        public static boolean isSystem(String name) {
            return "ADMIN".equals(name) || "MANAGER".equals(name) || "STAFF".equals(name);
        }
    }

    public record CreateRoleRequest(
            @NotBlank(message = "역할 코드를 입력하세요.") String name,
            @NotBlank(message = "표시 이름을 입력하세요.") String displayName,
            String description,
            Set<String> permissionCodes
    ) {}

    public record UpdateRoleRequest(
            @NotBlank(message = "표시 이름을 입력하세요.") String displayName,
            String description,
            Set<String> permissionCodes
    ) {}
}
