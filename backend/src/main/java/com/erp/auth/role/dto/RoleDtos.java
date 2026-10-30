package com.erp.auth.role.dto;

import com.erp.auth.role.Role;
import jakarta.validation.constraints.Size;
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
        /** codes — 그룹에서 진입할 수 있는 업무(work_permissions 에서 푼 값, WorkPermissionService.groupAllowedCodes). */
        public static RoleResponse from(Role role, long userCount, List<String> codes) {
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
            @Size(max = 50, message = "역할 코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "역할 코드를 입력하세요.") String name,
            @Size(max = 100, message = "표시 이름은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "표시 이름을 입력하세요.") String displayName,
            @Size(max = 255, message = "입력한 글자가 너무 깁니다. 255자까지 넣을 수 있습니다.")
            String description,
            Set<String> permissionCodes
    ) {}

    public record UpdateRoleRequest(
            @Size(max = 100, message = "표시 이름은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "표시 이름을 입력하세요.") String displayName,
            @Size(max = 255, message = "입력한 글자가 너무 깁니다. 255자까지 넣을 수 있습니다.")
            String description,
            Set<String> permissionCodes
    ) {}
}
