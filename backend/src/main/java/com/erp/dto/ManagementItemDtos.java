package com.erp.dto;

import com.erp.domain.ManagementItem;
import jakarta.validation.constraints.NotBlank;

public final class ManagementItemDtos {

    private ManagementItemDtos() {}

    public record CreateManagementItemRequest(
            String code,
            @NotBlank(message = "관리항목명을 입력하세요.") String name,
            String description
    ) {}

    public record UpdateManagementItemRequest(
            @NotBlank(message = "관리항목명을 입력하세요.") String name,
            String description,
            Boolean active
    ) {}

    public record ManagementItemResponse(
            Long id, String code, String name, String description, boolean active
    ) {
        public static ManagementItemResponse from(ManagementItem m) {
            return new ManagementItemResponse(m.getId(), m.getCode(), m.getName(), m.getDescription(), m.isActive());
        }
    }
}
