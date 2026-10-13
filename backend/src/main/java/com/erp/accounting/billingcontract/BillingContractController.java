package com.erp.accounting.billingcontract;

import com.erp.accounting.billingcontract.dto.BillingContractDtos;
import com.erp.accounting.billingcontract.dto.BillingContractDtos.BillableLine;
import com.erp.accounting.billingcontract.dto.BillingContractDtos.BillingUnitResponse;
import com.erp.accounting.billingcontract.dto.BillingContractDtos.ContractResponse;
import com.erp.accounting.billingcontract.dto.BillingContractDtos.SaveContractRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

/** 회계 II › 계약관리 › 계약입력(E060902) · 계약조회(E060903) */
@RestController
@RequestMapping("/api/billing-contracts")
@RequiredArgsConstructor
public class BillingContractController {

    private final BillingContractService service;

    @GetMapping
    public List<ContractResponse> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findAll(from, to);
    }

    @GetMapping("/{id}")
    public ContractResponse one(@PathVariable Long id) {
        return service.findOne(id);
    }

    @GetMapping("/next-code")
    public Map<String, String> nextCode() {
        return Map.of("code", service.nextCode());
    }

    @GetMapping("/units")
    public List<BillingUnitResponse> units() {
        return service.units();
    }

    /** 청구자료생성 [계약] 찾기 */
    @GetMapping("/billable")
    public List<BillableLine> billable(@RequestParam String fromMonth, @RequestParam String toMonth,
                                       @RequestParam List<Long> unitIds, @RequestParam(required = false) Long partnerId) {
        return service.billable(YearMonth.parse(fromMonth), YearMonth.parse(toMonth), unitIds, partnerId);
    }

    @PostMapping
    public ContractResponse create(@Valid @RequestBody SaveContractRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    @PutMapping("/{id}")
    public ContractResponse update(@PathVariable Long id, @Valid @RequestBody SaveContractRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.update(id, req, principal.getUsername());
    }

    /** 계약단가/수량일괄변경(E060904) [검색(F8)] · 계약현황(E060912) — 계약일자로 고른 계약 줄. */
    @GetMapping("/price-change")
    public List<BillingContractDtos.PriceChangeLine> priceChangeLines(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.priceChangeLines(from, to);
    }

    /** 계약단가/수량일괄변경 [저장(F8)] */
    @PostMapping("/price-change")
    public void changePrices(@Valid @RequestBody BillingContractDtos.PriceChangeRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        service.changePrices(req.lines(), principal.getUsername());
    }

    /** 계약조회 [선택삭제] */
    @PostMapping("/delete")
    public void delete(@RequestBody BillingContractDtos.DeleteRequest req) {
        service.delete(req.ids());
    }
}
