package com.erp.settings.controller;

import com.erp.common.ApiException;
import com.erp.settings.dto.CompanyDtos.CompanyResponse;
import com.erp.settings.dto.CompanyDtos.CreateCompanyRequest;
import com.erp.settings.service.CompanyService;
import com.erp.tenant.TenantContext;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.settings.dto.CompanyDtos;

/**
 * 회사(테넌트) 관리. <b>본사(public) 관리자만</b> 다른 회사를 만들 수 있다.
 * 회사코드·사용자관리 권한(USER_MANAGE)으로 1차 인가되고, 여기서 "본사에서 로그인했는가"를 2차로 막는다.
 */
@RestController
@RequestMapping("/api/companies")
@RequiredArgsConstructor
public class CompanyController {

    private final CompanyService companyService;

    @GetMapping
    public List<CompanyResponse> list() {
        requireHostTenant();
        return companyService.list();
    }

    @PostMapping
    public CompanyResponse create(@Valid @RequestBody CreateCompanyRequest req) {
        requireHostTenant();
        return companyService.create(req);
    }

    /** 회사 관리는 본사(public)에서만. 다른 회사 관리자가 남의 회사를 만들지 못하게. */
    private void requireHostTenant() {
        if (!TenantContext.DEFAULT.equals(TenantContext.get())) {
            throw ApiException.forbidden("회사 관리는 본사에서만 가능합니다.");
        }
    }
}
