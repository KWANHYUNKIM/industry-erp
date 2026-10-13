package com.erp.trade.orderrelease;

import com.erp.security.UserPrincipal;
import com.erp.trade.orderrelease.dto.OrderReleaseDtos.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 주문서출고처리(원본 E040230) — 미처리 · 처리 탭, [출고], [처리취소], 처리 건의 판매 잇기. */
@RestController
@RequestMapping("/api/order-releases")
@RequiredArgsConstructor
public class OrderReleaseController {

    private final OrderReleaseService service;

    @GetMapping("/pending")
    public List<PendingLine> pending(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.pending(from, to);
    }

    @GetMapping
    public List<ReleaseRow> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.list(from, to);
    }

    @GetMapping("/{id}")
    public ReleaseDetail detail(@PathVariable Long id) {
        return service.detail(id);
    }

    @PostMapping
    public List<ReleaseRow> create(@Valid @RequestBody CreateReleaseRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/sale")
    public ReleaseRow linkSale(@PathVariable Long id, @Valid @RequestBody LinkSaleRequest req) {
        return service.linkSale(id, req.saleId());
    }
}
