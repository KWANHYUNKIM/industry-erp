package com.erp.inventory.dto;

import com.erp.inventory.domain.Project;
import com.erp.inventory.domain.ProjectStatus;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDate;

public final class ProjectDtos {

    private ProjectDtos() {}

    public record CreateProjectRequest(
            @Size(max = 200, message = "프로젝트명은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "프로젝트명을 입력하세요.") String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String manager,
            LocalDate startDate,
            LocalDate endDate,
            ProjectStatus status,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** 진척률/상태/일정 수정. null 필드는 변경하지 않음. */
    public record UpdateProjectRequest(
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String manager,
            LocalDate startDate,
            LocalDate endDate,
            @Min(value = 0, message = "진척률은 0~100입니다.") @Max(value = 100, message = "진척률은 0~100입니다.") Integer progress,
            ProjectStatus status,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record ProjectResponse(
            Long id, String code, String name, String manager,
            LocalDate startDate, LocalDate endDate,
            int progress, ProjectStatus status, String statusName,
            String remark, String createdBy
    ) {
        public static ProjectResponse from(Project p) {
            return new ProjectResponse(
                    p.getId(), p.getCode(), p.getName(), p.getManager(),
                    p.getStartDate(), p.getEndDate(),
                    p.getProgress(), p.getStatus(), p.getStatus().getDisplayName(),
                    p.getRemark(), p.getCreatedBy());
        }
    }
}
