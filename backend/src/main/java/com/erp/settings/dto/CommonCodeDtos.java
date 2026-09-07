package com.erp.settings.dto;

import com.erp.settings.domain.CodeGroup;
import com.erp.settings.domain.CommonCode;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public class CommonCodeDtos {

    public record CreateGroupRequest(
            @Size(max = 50, message = "그룹코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹코드를 입력하세요.") String groupCode,
            @Size(max = 100, message = "그룹명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹명을 입력하세요.") String name,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String description
    ) {}

    public record CreateCodeRequest(
            @Size(max = 50, message = "코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "코드를 입력하세요.") String code,
            @Size(max = 100, message = "코드명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "코드명을 입력하세요.") String name,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String value1,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String value2,
            Integer sortOrder,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record UpdateCodeRequest(
            @Size(max = 100, message = "코드명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "코드명을 입력하세요.") String name,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String value1,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String value2,
            Integer sortOrder,
            Boolean active,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
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
