package com.erp.dto;

import com.erp.domain.ItemGroup;
import jakarta.validation.constraints.NotBlank;

public final class ItemGroupDtos {

    private ItemGroupDtos() {}

    public record CreateItemGroupRequest(
            @NotBlank(message = "그룹코드를 입력하세요.") String code,
            @NotBlank(message = "그룹명을 입력하세요.") String name,
            Integer sortOrder
    ) {}

    public record UpdateItemGroupRequest(
            @NotBlank(message = "그룹명을 입력하세요.") String name,
            Integer sortOrder,
            Boolean active
    ) {}

    public record ItemGroupResponse(
            Long id,
            String code,
            String name,
            Integer sortOrder,
            boolean active
    ) {
        public static ItemGroupResponse from(ItemGroup g) {
            return new ItemGroupResponse(g.getId(), g.getCode(), g.getName(), g.getSortOrder(), g.isActive());
        }
    }
}
