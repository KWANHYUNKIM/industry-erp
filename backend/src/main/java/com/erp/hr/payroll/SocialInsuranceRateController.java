package com.erp.hr.payroll;

import com.erp.hr.payroll.dto.InsuranceRateDtos.InsuranceRateRequest;
import com.erp.hr.payroll.dto.InsuranceRateDtos.InsuranceRateResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** 공제항목등록 Option › 세율/세액등록 — 연도별 4대보험 요율 */
@RestController
@RequestMapping("/api/pay-settings/insurance-rates")
@RequiredArgsConstructor
public class SocialInsuranceRateController {

    private final SocialInsuranceRateService service;

    @GetMapping("/{year}")
    public InsuranceRateResponse get(@PathVariable int year) {
        return service.get(year);
    }

    @PutMapping("/{year}")
    public InsuranceRateResponse save(@PathVariable int year, @Valid @RequestBody InsuranceRateRequest req) {
        return service.save(year, req);
    }

    /** 회사가 정한 줄을 지워 법정 요율로 되돌린다 */
    @DeleteMapping("/{year}")
    public InsuranceRateResponse reset(@PathVariable int year) {
        return service.reset(year);
    }
}
