package com.erp.groupware.approval;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 기안서 양식 마스터 조회. 프론트가 양식 목록과 양식별 입력 항목(field_schema), 구분(groupCode · groupName)을
 * 여기서 받아 폼을 그린다.
 */
@RestController
@RequestMapping("/api/approval-form-templates")
@RequiredArgsConstructor
public class ApprovalFormTemplateController {

    private final ApprovalSettingService settingService;

    @GetMapping
    public List<Map<String, Object>> list() {
        return settingService.activeTemplates();
    }
}
