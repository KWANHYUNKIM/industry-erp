package com.erp.groupware.approval;

import lombok.RequiredArgsConstructor;
import com.erp.security.UserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
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

    /** forDraft=true 면 기안서작성 양식 고르기 — 원본 [사용자별권한] 사용불가인 양식을 뺀다. */
    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(defaultValue = "false") boolean forDraft,
                                          @AuthenticationPrincipal UserPrincipal principal) {
        return settingService.activeTemplates(forDraft && principal != null ? principal.getUsername() : null);
    }
}
