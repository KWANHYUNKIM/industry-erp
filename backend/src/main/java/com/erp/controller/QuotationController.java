package com.erp.controller;

import com.erp.dto.QuotationDtos.CreateQuotationRequest;
import com.erp.dto.QuotationDtos.QuotationResponse;
import com.erp.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.QuotationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/quotations")
@RequiredArgsConstructor
public class QuotationController {

    private final QuotationService service;

    @GetMapping
    public List<QuotationResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<QuotationResponse> create(
            @Valid @RequestBody CreateQuotationRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 발송 처리 (작성 → 발송) */
    @PostMapping("/{id}/send")
    public QuotationResponse send(@PathVariable Long id) {
        return service.markSent(id);
    }

    @PostMapping("/{id}/cancel")
    public QuotationResponse cancel(@PathVariable Long id) {
        return service.cancel(id);
    }

    /** 수주 전환 → 생성된 수주(SalesOrder)를 반환 */
    @PostMapping("/{id}/convert")
    public ResponseEntity<SalesOrderResponse> convert(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.convertToOrder(id, principal.getUsername()));
    }
}
