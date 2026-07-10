package com.erp.dto;

import com.erp.domain.Role;

public final class RoleDtos {

    private RoleDtos() {}

    public record RoleResponse(
            Long id,
            String name,
            String displayName,
            String description
    ) {
        public static RoleResponse from(Role role) {
            return new RoleResponse(
                    role.getId(),
                    role.getName(),
                    role.getDisplayName(),
                    role.getDescription()
            );
        }
    }
}
