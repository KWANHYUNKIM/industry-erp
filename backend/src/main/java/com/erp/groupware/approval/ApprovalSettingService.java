package com.erp.groupware.approval;

import com.erp.common.ApiException;
import com.erp.auth.user.User;
import com.erp.groupware.approval.dto.ApprovalSettingDtos.FormTemplateRequest;
import com.erp.groupware.approval.dto.ApprovalSettingDtos.FormTemplateResponse;
import com.erp.groupware.approval.dto.ApprovalSettingDtos.PresetRequest;
import com.erp.groupware.approval.dto.ApprovalSettingDtos.PresetResponse;
import com.erp.auth.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.erp.groupware.approval.dto.ApprovalSettingDtos;

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
    private final ApprovalGroupRepository groupRepository;

    // ── 공통양식 ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FormTemplateResponse> findTemplates() {
        return templateRepository.findAll().stream()
                .sorted((a, b) -> {
                    int c = Integer.compare(a.getSortOrder(), b.getSortOrder());
                    return c != 0 ? c : a.getCode().compareTo(b.getCode());
                })
                .map(t -> FormTemplateResponse.from(t, documentRepository.countByFormTemplateId(t.getId()), groupName(t.getGroupCode())))
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
                .groupCode(groupCode(req.groupCode()))
                .build();
        applyInputSettings(t, req);
        return FormTemplateResponse.from(templateRepository.save(t), 0, groupName(t.getGroupCode()));
    }

    @Transactional
    public FormTemplateResponse updateTemplate(Long id, FormTemplateRequest req) {
        ApprovalFormTemplate t = template(id);
        // 양식코드는 바꾸지 않는다. 이미 작성된 기안서가 이 양식을 가리키고 있다.
        t.setName(req.name());
        t.setSortOrder(req.sortOrder() != null ? req.sortOrder() : t.getSortOrder());
        t.setActive(req.active() == null || req.active());
        t.setFieldSchema(schema(req.fieldSchema()));
        t.setGroupCode(groupCode(req.groupCode()));
        applyInputSettings(t, req);
        return FormTemplateResponse.from(t, documentRepository.countByFormTemplateId(t.getId()), groupName(t.getGroupCode()));
    }

    /** 원본 입력화면설정의 [기안서확인시점설정] · [사용자별권한]. 요청에 없으면 그대로 둔다. */
    private static void applyInputSettings(ApprovalFormTemplate t, FormTemplateRequest req) {
        if (req.referenceViewTiming() != null) t.setReferenceViewTiming(req.referenceViewTiming());
        if (req.shareViewTiming() != null) t.setShareViewTiming(req.shareViewTiming());
        if (req.userPermissions() != null) {
            Map<String, String> m = new java.util.LinkedHashMap<>();
            req.userPermissions().forEach((k, v) -> {
                if ("ALLOW".equals(v) || "DENY".equals(v)) m.put(k, v);
                else if (v != null && !"GROUP".equals(v)) throw ApiException.badRequest("사용자별권한 값을 다시 고르세요: " + v);
            });
            t.setUserPermissions(m);
        }
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

    /**
     * 양식 목록(기안서작성 · 공통양식리스트)이 쓰는 꼴 — 구분 이름까지. 사용 중인 양식만.
     * 컨트롤러가 리포지토리를 직접 부르던 자리(CLAUDE.md 3장)를 여기로 옮겼다.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> activeTemplates(String username) {
        Long userId = username == null ? null : userRepository.findByUsername(username).map(u -> u.getId()).orElse(null);
        return templateRepository.findByActiveTrueOrderBySortOrderAscCodeAsc().stream()
                // 원본 [사용자별권한] 사용불가면 그 사람의 기안서작성 양식 목록에서 빠진다.
                .filter(t -> t.usableBy(userId))
                .map(t -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("id", t.getId());
                    m.put("code", t.getCode());
                    m.put("name", t.getName());
                    m.put("sortOrder", t.getSortOrder());
                    m.put("fieldSchema", t.getFieldSchema());
                    m.put("groupCode", t.getGroupCode());
                    m.put("groupName", groupName(t.getGroupCode()));
                    return m;
                })
                .toList();
    }

    // ── 구분(그룹) — 원본 '구분검색' ──────────────────────────────────

    @Transactional(readOnly = true)
    public List<ApprovalSettingDtos.GroupResponse> findGroups() {
        return groupRepository.findAllByOrderByCodeAsc().stream().map(ApprovalSettingDtos.GroupResponse::from).toList();
    }

    @Transactional
    public ApprovalSettingDtos.GroupResponse createGroup(ApprovalSettingDtos.GroupRequest req) {
        String code = req.code().trim();
        if (groupRepository.findByCode(code).isPresent()) throw ApiException.conflict("이미 등록된 그룹코드입니다: " + code);
        return ApprovalSettingDtos.GroupResponse.from(groupRepository.save(
                ApprovalGroup.builder().code(code).name(req.name().trim()).build()));
    }

    /** 원본 [수정] — 그룹명만 바꾼다(코드는 양식이 가리키고 있다). */
    @Transactional
    public ApprovalSettingDtos.GroupResponse updateGroup(Long id, ApprovalSettingDtos.GroupRequest req) {
        ApprovalGroup g = groupRepository.findById(id).orElseThrow(() -> ApiException.notFound("구분을 찾을 수 없습니다. id=" + id));
        g.setName(req.name().trim());
        return ApprovalSettingDtos.GroupResponse.from(g);
    }

    /** 원본 구분검색 [사용중단/재사용 ▲]. */
    @Transactional
    public ApprovalSettingDtos.GroupResponse setGroupActive(Long id, boolean active) {
        ApprovalGroup g = groupRepository.findById(id).orElseThrow(() -> ApiException.notFound("구분을 찾을 수 없습니다. id=" + id));
        g.setActive(active);
        return ApprovalSettingDtos.GroupResponse.from(g);
    }

    /**
     * 원본 구분검색수정 [사용중단/재사용 ▲] › 삭제('삭제하겠습니까?').
     * 양식이 기본 구분으로 가리키고 있으면 막는다 — 지우면 그 양식의 [구분] 열이 말없이 빈칸이 된다.
     */
    @Transactional
    public void deleteGroup(Long id) {
        ApprovalGroup g = groupRepository.findById(id).orElseThrow(() -> ApiException.notFound("구분을 찾을 수 없습니다. id=" + id));
        long used = templateRepository.findAll().stream().filter(t -> g.getCode().equals(t.getGroupCode())).count();
        if (used > 0) throw ApiException.conflict("양식 " + used + "개가 기본 구분으로 쓰고 있어 삭제할 수 없습니다. 사용중단 하세요.");
        groupRepository.delete(g);
    }

    private String groupName(String code) {
        if (code == null || code.isBlank()) return null;
        return groupRepository.findByCode(code).map(ApprovalGroup::getName).orElse(null);
    }

    private String groupCode(String code) {
        if (code == null || code.isBlank()) return null;
        String c = code.trim();
        if (groupRepository.findByCode(c).isEmpty()) throw ApiException.badRequest("없는 구분입니다: " + c);
        return c;
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
