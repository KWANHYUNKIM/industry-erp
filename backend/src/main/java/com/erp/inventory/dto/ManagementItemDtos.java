package com.erp.inventory.dto;

import com.erp.inventory.domain.ManagementItem;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

public final class ManagementItemDtos {

    private ManagementItemDtos() {}

    public record CreateManagementItemRequest(
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String code,
            @Size(max = 100, message = "관리항목명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "관리항목명을 입력하세요.") String name,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String description
    ) {}

    public record UpdateManagementItemRequest(
            @Size(max = 100, message = "관리항목명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "관리항목명을 입력하세요.") String name,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
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
