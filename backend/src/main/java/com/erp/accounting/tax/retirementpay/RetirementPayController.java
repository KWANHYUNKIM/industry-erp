package com.erp.accounting.tax.retirementpay;

import com.erp.accounting.tax.retirementpay.dto.RetirementPayDtos.Calculation;
import com.erp.accounting.tax.retirementpay.dto.RetirementPayDtos.RetirementPayRequest;
import com.erp.accounting.tax.retirementpay.dto.RetirementPayDtos.RetirementPayResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 퇴직금계산 (세무 › 원천징수 › 퇴직정산 E030117) */
@RestController
@RequestMapping("/api/retirement-pays")
@RequiredArgsConstructor
public class RetirementPayController {

    private final RetirementPayService service;
    private final RetirementEstimateService estimateService;

    /** 퇴직급여추계액 (E030108) — 기준월(YYYY-MM)에 재직 중인 사원마다 어림한 퇴직급여. */
    @GetMapping("/estimate")
    public java.util.List<com.erp.accounting.tax.retirementpay.dto.RetirementPayDtos.EstimateRow> estimate(
            @RequestParam String baseMonth, @RequestParam(required = false) String employeeCode,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(defaultValue = "false") boolean includeUnderOneYear,
            @RequestParam(defaultValue = "false") boolean midSettlement) {
        return estimateService.estimate(baseMonth, employeeCode, departmentId, includeUnderOneYear, midSettlement);
    }

    @GetMapping
    public List<RetirementPayResponse> list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate payFrom,
                                            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate payTo,
                                            @RequestParam(required = false) Long employeeId,
                                            @RequestParam(required = false) Long departmentId,
                                            @RequestParam(required = false) String employed) {
        return service.list(from, to, payFrom, payTo, employeeId, departmentId, employed);
    }

    @GetMapping("/{id}")
    public RetirementPayResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    /** 저장하지 않고 셈만 — 원본 창의 계산내역 · 세액계산 */
    @PostMapping("/calculate")
    public Calculation calculate(@Valid @RequestBody RetirementPayRequest req) {
        return service.calculate(req);
    }

    @PostMapping
    public RetirementPayResponse create(@Valid @RequestBody RetirementPayRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public RetirementPayResponse update(@PathVariable Long id, @Valid @RequestBody RetirementPayRequest req) {
        return service.update(id, req);
    }

    /** 선택삭제 */
    @PostMapping("/delete")
    public void delete(@RequestBody List<Long> ids) {
        service.delete(ids);
    }
}
