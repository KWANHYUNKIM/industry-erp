package com.erp.settings.dto;

import com.erp.settings.domain.CodeGroup;
import com.erp.settings.domain.CommonCode;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public class CommonCodeDtos {

    public record CreateGroupRequest(
            @NotBlank(message = "그룹코드를 입력하세요.") String groupCode,
            @NotBlank(message = "그룹명을 입력하세요.") String name,
            String description
    ) {}

    public record CreateCodeRequest(
            @NotBlank(message = "코드를 입력하세요.") String code,
            @NotBlank(message = "코드명을 입력하세요.") String name,
            String value1,
            String value2,
            Integer sortOrder,
            String remark
    ) {}

    public record UpdateCodeRequest(
            @NotBlank(message = "코드명을 입력하세요.") String name,
            String value1,
            String value2,
            Integer sortOrder,
            Boolean active,
            String remark
    ) {}

    public record CodeResponse(
            Long id,
            String code,
            String name,
            String value1,
            String value2,
            int sortOrder,
            boolean active,
            String remark
    ) {
        public static CodeResponse from(CommonCode c) {
            return new CodeResponse(c.getId(), c.getCode(), c.getName(),
                    c.getValue1(), c.getValue2(), c.getSortOrder(), c.isActive(), c.getRemark());
        }
    }

    public record CodeGroupResponse(
            Long id,
            String groupCode,
            String name,
            String description,
            boolean system,
            boolean active,
            List<CodeResponse> codes
    ) {
        public static CodeGroupResponse from(CodeGroup g) {
            return new CodeGroupResponse(
                    g.getId(), g.getGroupCode(), g.getName(), g.getDescription(),
                    g.isSystem(), g.isActive(),
                    g.getCodes().stream()
                            .sorted((a, b) -> a.getSortOrder() != b.getSortOrder()
                                    ? Integer.compare(a.getSortOrder(), b.getSortOrder())
                                    : a.getName().compareTo(b.getName()))
                            .map(CodeResponse::from)
                            .toList());
        }
    }
}
