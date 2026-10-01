package com.erp.settings.companyinfo;

import com.erp.settings.companyinfo.dto.CompanyInfoDtos.CompanyInfoRequest;
import com.erp.settings.companyinfo.dto.CompanyInfoDtos.CompanyInfoResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import com.erp.settings.companyinfo.dto.CompanyInfoDtos;

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
