package com.erp.hr.dto;

import com.erp.hr.domain.Department;
import jakarta.validation.constraints.NotBlank;

public class DepartmentDtos {

    public record CreateDepartmentRequest(
            @NotBlank(message = "부서명을 입력하세요.") String name,
            String code,
            Long parentId,
            Integer sortOrder
    ) {}

    public record UpdateDepartmentRequest(
            @NotBlank(message = "부서명을 입력하세요.") String name,
            Long parentId,
            Integer sortOrder,
            Boolean active
    ) {}

    /** 부서 한 건. 트리는 parentId 로 프론트에서 조립한다. */
    public record DepartmentResponse(
            Long id,
            String code,
            String name,
            Long parentId,
            String parentName,
            int sortOrder,
            boolean active,
            long employeeCount
    ) {
        public static DepartmentResponse from(Department d, long employeeCount) {
            return new DepartmentResponse(
                    d.getId(), d.getCode(), d.getName(),
                    d.getParent() != null ? d.getParent().getId() : null,
                    d.getParent() != null ? d.getParent().getName() : null,
                    d.getSortOrder(), d.isActive(), employeeCount);
        }
    }
}
