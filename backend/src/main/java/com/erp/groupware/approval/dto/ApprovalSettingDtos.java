package com.erp.groupware.approval.dto;

import com.erp.groupware.approval.ApprovalFormTemplate;
import com.erp.groupware.approval.ApprovalGroup;
import com.erp.groupware.approval.ApprovalLinePreset;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;

/** 전자결재 설정 — 공통양식등록 · 결재선 프리셋 */
public final class ApprovalSettingDtos {

    private ApprovalSettingDtos() {}

    // ── 공통양식 ──────────────────────────────────────────────────────

    public record FormTemplateRequest(
            @Size(max = 50, message = "양식코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "양식코드를 입력하세요.") String code,
            @Size(max = 100, message = "양식명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "양식명을 입력하세요.") String name,
            Integer sortOrder,
            Boolean active,
            /** 양식별 입력 항목 정의. 비우면 자유서식(본문만). */
            List<Map<String, Object>> fieldSchema,
            /** 기본 구분(그룹코드) — 원본 기본값설정 › 구분. 비우면 구분 없음. */
            @Size(max = 20, message = "구분 코드는 20자까지 넣을 수 있습니다.") String groupCode
    ) {}

    public record FormTemplateResponse(
            Long id, String code, String name, Integer sortOrder, boolean active,
            List<Map<String, Object>> fieldSchema,
            /** 이 양식으로 작성된 기안서 수 — 0건일 때만 삭제할 수 있다 */
            long documentCount,
            String groupCode,
            /** 공통양식리스트 [구분] 열 — 구분의 이름 */
            String groupName
    ) {
        public static FormTemplateResponse from(ApprovalFormTemplate t, long documentCount, String groupName) {
            return new FormTemplateResponse(
                    t.getId(), t.getCode(), t.getName(), t.getSortOrder(), t.isActive(),
                    t.getFieldSchema(), documentCount, t.getGroupCode(), groupName);
        }
    }

    // ── 구분(그룹) ────────────────────────────────────────────────────

    /** 원본 '구분검색' [신규(F2)] · [수정] — 그룹코드 · 그룹명. */
    public record GroupRequest(
            @Size(max = 20, message = "그룹코드는 20자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹코드를 입력하세요.") String code,
            @Size(max = 50, message = "그룹명은 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "그룹명을 입력하세요.") String name
    ) {}

    public record GroupResponse(Long id, String code, String name, boolean active) {
        public static GroupResponse from(ApprovalGroup g) {
            return new GroupResponse(g.getId(), g.getCode(), g.getName(), g.isActive());
        }
    }

    // ── 결재선 프리셋 ──────────────────────────────────────────────────

    public record PresetRequest(
            @Size(max = 100, message = "결재선 이름은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "결재선 이름을 입력하세요.") String name,
            /** 특정 양식 전용이면 지정, 비우면 공통 */
            Long formTemplateId,
            Boolean active,
            @NotEmpty(message = "결재자를 1명 이상 지정하세요.") List<@NotNull Long> approverIds
    ) {}

    public record PresetStepResponse(int stepOrder, Long approverId, String approverName, String department) {}

    public record PresetResponse(
            Long id, String name, boolean active,
            Long formTemplateId, String formTemplateName,
            List<PresetStepResponse> steps
    ) {
        public static PresetResponse from(ApprovalLinePreset p) {
            return new PresetResponse(
                    p.getId(), p.getName(), p.isActive(),
                    p.getFormTemplate() != null ? p.getFormTemplate().getId() : null,
                    p.getFormTemplate() != null ? p.getFormTemplate().getName() : null,
                    p.getSteps().stream()
                            .map(s -> new PresetStepResponse(
                                    s.getStepOrder(),
                                    s.getApprover().getId(),
                                    s.getApprover().getName(),
                                    s.getApprover().getDepartment()))
                            .toList());
        }
    }
}
