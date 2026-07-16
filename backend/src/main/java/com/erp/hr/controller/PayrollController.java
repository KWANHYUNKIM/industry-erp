package com.erp.hr.controller;

import com.erp.hr.dto.PayrollDtos.CreatePayslipRequest;
import com.erp.hr.dto.PayrollDtos.PayslipResponse;
import com.erp.security.UserPrincipal;
import com.erp.hr.service.PayrollService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.hr.dto.PayrollDtos;

@RestController
@RequestMapping("/api/payslips")
@RequiredArgsConstructor
public class PayrollController {

    private final PayrollService service;

    /** 급여대장: 귀속월의 사원별 급여명세 */
    @GetMapping
    public List<PayslipResponse> payroll(@RequestParam String month) {
        return service.payroll(month);
    }

    @GetMapping("/{id}")
    public PayslipResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    /** 급여계산: 사원+귀속월 급여명세 생성 (4대보험 자동공제) */
    @PostMapping
    public ResponseEntity<PayslipResponse> create(
            @Valid @RequestBody CreatePayslipRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @PostMapping("/{id}/confirm")
    public PayslipResponse confirm(@PathVariable Long id) {
        return service.confirm(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
