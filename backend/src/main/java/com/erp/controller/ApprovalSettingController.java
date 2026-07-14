package com.erp.controller;

import com.erp.dto.ApprovalSettingDtos.FormTemplateRequest;
import com.erp.dto.ApprovalSettingDtos.FormTemplateResponse;
import com.erp.dto.ApprovalSettingDtos.PresetRequest;
import com.erp.dto.ApprovalSettingDtos.PresetResponse;
import com.erp.service.ApprovalSettingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 그룹웨어 > 전자결재 설정 — 공통양식등록(양식·입력항목)과 결재선 프리셋.
 * 기안 화면이 읽는 양식 목록(/api/approval-form-templates)은 사용중인 양식만 내려주고,
 * 여기서는 사용중지된 양식까지 전부 보여 준다(관리 화면이라서).
 */
@RestController
@RequestMapping("/api/approval-settings")
@RequiredArgsConstructor
public class ApprovalSettingController {

    private final ApprovalSettingService service;

    @GetMapping("/templates")
    public List<FormTemplateResponse> templates() {
        return service.findTemplates();
    }

    @PostMapping("/templates")
    public FormTemplateResponse createTemplate(@Valid @RequestBody FormTemplateRequest req) {
        return service.createTemplate(req);
    }

    @PutMapping("/templates/{id}")
    public FormTemplateResponse updateTemplate(@PathVariable Long id, @Valid @RequestBody FormTemplateRequest req) {
        return service.updateTemplate(id, req);
    }

    @DeleteMapping("/templates/{id}")
    public ResponseEntity<Void> deleteTemplate(@PathVariable Long id) {
        service.deleteTemplate(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/presets")
    public List<PresetResponse> presets() {
        return service.findPresets();
    }

    @PostMapping("/presets")
    public PresetResponse createPreset(@Valid @RequestBody PresetRequest req) {
        return service.createPreset(req);
    }

    @PutMapping("/presets/{id}")
    public PresetResponse updatePreset(@PathVariable Long id, @Valid @RequestBody PresetRequest req) {
        return service.updatePreset(id, req);
    }

    @DeleteMapping("/presets/{id}")
    public ResponseEntity<Void> deletePreset(@PathVariable Long id) {
        service.deletePreset(id);
        return ResponseEntity.noContent().build();
    }
}
