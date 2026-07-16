package com.erp.settings.controller;

import com.erp.settings.dto.CompanyInfoDtos.CompanyInfoRequest;
import com.erp.settings.dto.CompanyInfoDtos.CompanyInfoResponse;
import com.erp.settings.service.CompanyInfoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import com.erp.settings.dto.CompanyInfoDtos;

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
    public CompanyInfoResponse save(@Valid @RequestBody CompanyInfoRequest req) {
        return companyInfoService.save(req);
    }
}
