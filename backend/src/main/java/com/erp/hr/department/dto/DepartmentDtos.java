package com.erp.hr.department.dto;

import com.erp.hr.department.Department;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

public class DepartmentDtos {

    public record CreateDepartmentRequest(
            @Size(max = 100, message = "부서명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "부서명을 입력하세요.") String name,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String code,
            Long parentId,
            Integer sortOrder
    ) {}

    public record UpdateDepartmentRequest(
            @Size(max = 100, message = "부서명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "부서명을 입력하세요.") String name,
            Long parentId,
            Integer sortOrder,
            Boolean active
    ) {}

    /** 조직도등록 [부서장지정] — 고른 부서의 부서장을 이 사원으로. null 이면 부서장을 비운다. */
    public record SetHeadRequest(Long employeeId) {}

    /** 조직도등록 [부서장설정] 창의 한 줄 — 부서 · 부서장 ID. 창 전체를 [저장(F8)] 으로 한 번에 보낸다. */
    public record HeadLine(Long departmentId, Long employeeId) {}

    /** 부서 한 건. 트리는 parentId 로 프론트에서 조립한다. */
    public record DepartmentResponse(
            Long id,
            String code,
            String name,
            Long parentId,
            String parentName,
            int sortOrder,
            boolean active,
            long employeeCount,
            /** 부서장 사원 id — 조직도등록 [부서장] 열. 정하는 곳은 PUT …/{id}/head · PUT …/heads 다. */
            Long headEmployeeId,
            /** 조직도등록 Fn › 미포함 — 정하는 곳은 PUT …/{id}/org 다. */
            boolean orgExcluded
    ) {
        public static DepartmentResponse from(Department d, long employeeCount) {
            return new DepartmentResponse(
                    d.getId(), d.getCode(), d.getName(),
                    d.getParent() != null ? d.getParent().getId() : null,
                    d.getParent() != null ? d.getParent().getName() : null,
                    d.getSortOrder(), d.isActive(), employeeCount, d.getHeadEmployeeId(), d.isOrgExcluded());
        }
    }

    /**
     * 조직도등록 Fn › 미포함(excluded=true) · 하위부서추가로 다시 넣기(excluded=false, parentId=넣을 상위 부서 — 비우면 맨 위).
     */
    public record OrgPlacementRequest(boolean excluded, Long parentId) {}
}
