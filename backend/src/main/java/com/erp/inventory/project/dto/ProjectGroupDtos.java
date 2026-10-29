package com.erp.inventory.project.dto;

import com.erp.inventory.project.ProjectGroup;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class ProjectGroupDtos {

    private ProjectGroupDtos() {}

    public record CreateProjectGroupRequest(
            @Size(max = 50, message = "그룹코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹코드를 입력하세요.") String code,
            @Size(max = 100, message = "그룹명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹명을 입력하세요.") String name,
            Integer sortOrder,
            Boolean active
    ) {}

    public record ProjectGroupResponse(Long id, String code, String name, Integer sortOrder, boolean active) {
        public static ProjectGroupResponse from(ProjectGroup g) {
            return new ProjectGroupResponse(g.getId(), g.getCode(), g.getName(), g.getSortOrder(), g.isActive());
        }
    }
}
