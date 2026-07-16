package com.erp.groupware.dto;

import com.erp.groupware.domain.ApprovalFormTemplate;
import com.erp.groupware.domain.ApprovalLinePreset;
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
            @NotBlank(message = "양식코드를 입력하세요.") String code,
            @NotBlank(message = "양식명을 입력하세요.") String name,
            Integer sortOrder,
            Boolean active,
            /** 양식별 입력 항목 정의. 비우면 자유서식(본문만). */
            List<Map<String, Object>> fieldSchema
    ) {}

    public record FormTemplateResponse(
            Long id, String code, String name, Integer sortOrder, boolean active,
            List<Map<String, Object>> fieldSchema,
            /** 이 양식으로 작성된 기안서 수 — 0건일 때만 삭제할 수 있다 */
            long documentCount
    ) {
        public static FormTemplateResponse from(ApprovalFormTemplate t, long documentCount) {
            return new FormTemplateResponse(
                    t.getId(), t.getCode(), t.getName(), t.getSortOrder(), t.isActive(),
                    t.getFieldSchema(), documentCount);
        }
    }

    // ── 결재선 프리셋 ──────────────────────────────────────────────────

    public record PresetRequest(
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
