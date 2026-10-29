package com.erp.inventory.project.dto;

import com.erp.inventory.project.Project;
import com.erp.inventory.project.ProjectStatus;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDate;

public final class ProjectDtos {

    private ProjectDtos() {}

    public record CreateProjectRequest(
            /* 원본 [프로젝트코드] — 사람이 정할 수 있다. 비우면 서버가 매긴다. */
            @Size(max = 30, message = "프로젝트코드는 30자까지 넣을 수 있습니다.") String code,
            @Size(max = 200, message = "프로젝트명은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "프로젝트명을 입력하세요.") String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String manager,
            LocalDate startDate,
            LocalDate endDate,
            ProjectStatus status,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String group1,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String group2,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String extraText1,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String extraText2,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String extraText3,
            java.math.BigDecimal extraNum1,
            java.math.BigDecimal extraNum2,
            java.math.BigDecimal extraNum3,
            @Size(max = 2000, message = "입력한 글자가 너무 깁니다. 2000자까지 넣을 수 있습니다.") String extraLong1,
            @Size(max = 2000, message = "입력한 글자가 너무 깁니다. 2000자까지 넣을 수 있습니다.") String extraLong2,
            @Size(max = 2000, message = "입력한 글자가 너무 깁니다. 2000자까지 넣을 수 있습니다.") String extraLong3,
            LocalDate extraDate1,
            LocalDate extraDate2,
            LocalDate extraDate3
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
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String group1,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String group2,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark,
            /* 원본 [사용중단/재사용] */
            Boolean active,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String extraText1,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String extraText2,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String extraText3,
            java.math.BigDecimal extraNum1,
            java.math.BigDecimal extraNum2,
            java.math.BigDecimal extraNum3,
            @Size(max = 2000, message = "입력한 글자가 너무 깁니다. 2000자까지 넣을 수 있습니다.") String extraLong1,
            @Size(max = 2000, message = "입력한 글자가 너무 깁니다. 2000자까지 넣을 수 있습니다.") String extraLong2,
            @Size(max = 2000, message = "입력한 글자가 너무 깁니다. 2000자까지 넣을 수 있습니다.") String extraLong3,
            LocalDate extraDate1,
            LocalDate extraDate2,
            LocalDate extraDate3
    ) {}

    public record ProjectResponse(
            Long id, String code, String name, String manager,
            LocalDate startDate, LocalDate endDate,
            int progress, ProjectStatus status, String statusName,
            String remark, String createdBy, boolean active, String group1, String group2,
            String extraText1, String extraText2, String extraText3, java.math.BigDecimal extraNum1, java.math.BigDecimal extraNum2, java.math.BigDecimal extraNum3, String extraLong1, String extraLong2, String extraLong3, LocalDate extraDate1, LocalDate extraDate2, LocalDate extraDate3
    ) {
        public static ProjectResponse from(Project p) {
            return new ProjectResponse(
                    p.getId(), p.getCode(), p.getName(), p.getManager(),
                    p.getStartDate(), p.getEndDate(),
                    p.getProgress(), p.getStatus(), p.getStatus().getDisplayName(),
                    p.getRemark(), p.getCreatedBy(), p.isActive(), p.getGroup1(), p.getGroup2(),
                    p.getExtraText1(), p.getExtraText2(), p.getExtraText3(), p.getExtraNum1(), p.getExtraNum2(), p.getExtraNum3(), p.getExtraLong1(), p.getExtraLong2(), p.getExtraLong3(), p.getExtraDate1(), p.getExtraDate2(), p.getExtraDate3());
        }
    }
}
