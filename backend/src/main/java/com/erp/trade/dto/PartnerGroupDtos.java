package com.erp.trade.dto;

import com.erp.trade.domain.PartnerGroup;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

public final class PartnerGroupDtos {

    private PartnerGroupDtos() {}

    public record CreatePartnerGroupRequest(
            @Size(max = 50, message = "그룹코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹코드를 입력하세요.") String code,
            @Size(max = 100, message = "그룹명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹명을 입력하세요.") String name,
            Integer sortOrder
    ) {}

    public record UpdatePartnerGroupRequest(
            @Size(max = 100, message = "그룹명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹명을 입력하세요.") String name,
            Integer sortOrder,
            Boolean active
    ) {}

    public record PartnerGroupResponse(
            Long id,
            String code,
            String name,
            Integer sortOrder,
            boolean active
    ) {
        public static PartnerGroupResponse from(PartnerGroup g) {
            return new PartnerGroupResponse(g.getId(), g.getCode(), g.getName(), g.getSortOrder(), g.isActive());
        }
    }
}
