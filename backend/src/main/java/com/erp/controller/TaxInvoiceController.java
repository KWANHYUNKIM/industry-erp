package com.erp.controller;

import com.erp.domain.TaxInvoiceType;
import com.erp.dto.TaxInvoiceDtos.IssueRequest;
import com.erp.dto.TaxInvoiceDtos.TaxInvoiceResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.TaxInvoiceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/tax-invoices")
@RequiredArgsConstructor
public class TaxInvoiceController {

    private final TaxInvoiceService service;

    /** 종류(SALES/PURCHASE)·기간별 세금계산서 목록 */
    @GetMapping
    public List<TaxInvoiceResponse> list(
            @RequestParam TaxInvoiceType type,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.list(type, from, to);
    }

    /** 판매/구매 전표에서 세금계산서 발행 */
    @PostMapping
    public ResponseEntity<TaxInvoiceResponse> issue(
            @Valid @RequestBody IssueRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.issue(req, principal.getUsername()));
    }

    /** 진행단계 전진 (작성→발행→전송→승인) */
    @PostMapping("/{id}/advance")
    public TaxInvoiceResponse advance(@PathVariable Long id) {
        return service.advance(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
