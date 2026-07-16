package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.ApprovalFormTemplate;
import com.erp.groupware.domain.ApprovalLinePreset;
import com.erp.groupware.domain.ApprovalLinePresetStep;
import com.erp.auth.domain.User;
import com.erp.groupware.dto.ApprovalSettingDtos.FormTemplateRequest;
import com.erp.groupware.dto.ApprovalSettingDtos.FormTemplateResponse;
import com.erp.groupware.dto.ApprovalSettingDtos.PresetRequest;
import com.erp.groupware.dto.ApprovalSettingDtos.PresetResponse;
import com.erp.groupware.repository.ApprovalDocumentRepository;
import com.erp.groupware.repository.ApprovalFormTemplateRepository;
import com.erp.groupware.repository.ApprovalLinePresetRepository;
import com.erp.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.erp.groupware.dto.ApprovalSettingDtos;

/**
 * 전자결재 설정 — 공통양식등록과 결재선 프리셋.
 *
 * 양식은 이미 쓰인 기안서가 있으면 지우지 않는다(그 기안서들이 양식을 가리킨다).
 * 대신 사용중지(active=false)하면 새 기안에서만 사라지고 과거 문서는 그대로 열린다.
 */
@Service
@RequiredArgsConstructor
public class ApprovalSettingService {

    private final ApprovalFormTemplateRepository templateRepository;
    private final ApprovalLinePresetRepository presetRepository;
    private final ApprovalDocumentRepository documentRepository;
    private final UserRepository userRepository;

    // ── 공통양식 ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FormTemplateResponse> findTemplates() {
        return templateRepository.findAll().stream()
                .sorted((a, b) -> {
                    int c = Integer.compare(a.getSortOrder(), b.getSortOrder());
                    return c != 0 ? c : a.getCode().compareTo(b.getCode());
                })
                .map(t -> FormTemplateResponse.from(t, documentRepository.countByFormTemplateId(t.getId())))
                .toList();
    }

    @Transactional
    public FormTemplateResponse createTemplate(FormTemplateRequest req) {
        String code = req.code().trim().toUpperCase();
        if (templateRepository.findByCode(code).isPresent()) {
            throw ApiException.conflict("이미 등록된 양식코드입니다: " + code);
        }
        ApprovalFormTemplate t = ApprovalFormTemplate.builder()
                .code(code)
                .name(req.name())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .active(req.active() == null || req.active())
                .fieldSchema(schema(req.fieldSchema()))
                .build();
        return FormTemplateResponse.from(templateRepository.save(t), 0);
    }

    @Transactional
    public FormTemplateResponse updateTemplate(Long id, FormTemplateRequest req) {
        ApprovalFormTemplate t = template(id);
        // 양식코드는 바꾸지 않는다. 이미 작성된 기안서가 이 양식을 가리키고 있다.
        t.setName(req.name());
        t.setSortOrder(req.sortOrder() != null ? req.sortOrder() : t.getSortOrder());
        t.setActive(req.active() == null || req.active());
        t.setFieldSchema(schema(req.fieldSchema()));
        return FormTemplateResponse.from(t, documentRepository.countByFormTemplateId(t.getId()));
    }

    /** 기안서가 한 건도 없는 양식만 삭제한다. 쓰인 양식은 사용중지로 내린다. */
    @Transactional
    public void deleteTemplate(Long id) {
        ApprovalFormTemplate t = template(id);
        long used = documentRepository.countByFormTemplateId(id);
        if (used > 0) {
            throw ApiException.conflict("이미 " + used + "건의 기안서가 사용 중인 양식은 삭제할 수 없습니다: "
                    + t.getName() + " (사용중지로 내리세요)");
        }
        templateRepository.delete(t);
    }

    // ── 결재선 프리셋 ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PresetResponse> findPresets() {
        return presetRepository.findAllWithSteps().stream().map(PresetResponse::from).toList();
    }

    @Transactional
    public PresetResponse createPreset(PresetRequest req) {
        if (presetRepository.existsByName(req.name())) {
            throw ApiException.conflict("이미 등록된 결재선입니다: " + req.name());
        }
        ApprovalLinePreset p = ApprovalLinePreset.builder()
                .name(req.name())
                .formTemplate(req.formTemplateId() != null ? template(req.formTemplateId()) : null)
                .active(req.active() == null || req.active())
                .build();
        applySteps(p, req.approverIds());
        return PresetResponse.from(presetRepository.save(p));
    }

    @Transactional
    public PresetResponse updatePreset(Long id, PresetRequest req) {
        ApprovalLinePreset p = preset(id);
        if (!p.getName().equals(req.name()) && presetRepository.existsByName(req.name())) {
            throw ApiException.conflict("이미 등록된 결재선입니다: " + req.name());
        }
        p.setName(req.name());
        p.setFormTemplate(req.formTemplateId() != null ? template(req.formTemplateId()) : null);
        p.setActive(req.active() == null || req.active());

        // 기존 단계를 지우고 다시 넣는다. flush 를 끼우지 않으면 Hibernate 가 삭제보다 삽입을 먼저 내보내
        // (preset_id, step_order) 유니크 제약에 걸린다.
        p.clearSteps();
        presetRepository.flush();
        applySteps(p, req.approverIds());
        return PresetResponse.from(p);
    }

    @Transactional
    public void deletePreset(Long id) {
        presetRepository.delete(preset(id));
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    /** 결재 순서대로 단계를 만든다. 같은 사람이 연달아 두 번 결재하는 건 막는다. */
    private void applySteps(ApprovalLinePreset p, List<Long> approverIds) {
        Long previous = null;
        for (Long approverId : approverIds) {
            if (approverId.equals(previous)) {
                throw ApiException.badRequest("같은 결재자가 연속으로 올 수 없습니다.");
            }
            User approver = userRepository.findById(approverId)
                    .orElseThrow(() -> ApiException.notFound("결재자를 찾을 수 없습니다. id=" + approverId));
            p.addStep(ApprovalLinePresetStep.builder().approver(approver).build());
            previous = approverId;
        }
    }

    private List<Map<String, Object>> schema(List<Map<String, Object>> input) {
        return input != null ? input : new ArrayList<>();
    }

    private ApprovalFormTemplate template(Long id) {
        return templateRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("양식을 찾을 수 없습니다. id=" + id));
    }

    private ApprovalLinePreset preset(Long id) {
        return presetRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("결재선을 찾을 수 없습니다. id=" + id));
    }
}
