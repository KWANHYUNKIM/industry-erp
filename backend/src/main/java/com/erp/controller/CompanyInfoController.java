package com.erp.controller;

import com.erp.dto.CompanyInfoDtos.CompanyInfoRequest;
import com.erp.dto.CompanyInfoDtos.CompanyInfoResponse;
import com.erp.service.CompanyInfoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/company")
@RequiredArgsConstructor
public class CompanyInfoController {

    private final CompanyInfoService companyInfoService;

    @GetMapping
    public CompanyInfoResponse get() {
        return companyInfoService.get();
    }

    @PutMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public CompanyInfoResponse save(@Valid @RequestBody CompanyInfoRequest req) {
        return companyInfoService.save(req);
    }
}
