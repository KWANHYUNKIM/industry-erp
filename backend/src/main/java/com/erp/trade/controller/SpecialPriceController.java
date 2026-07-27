package com.erp.trade.controller;

import com.erp.security.UserPrincipal;
import com.erp.trade.domain.enums.SpecialPriceType;
import com.erp.trade.dto.SpecialPriceDtos.CreateSpecialPriceRequest;
import com.erp.trade.dto.SpecialPriceDtos.ResolveResponse;
import com.erp.trade.dto.SpecialPriceDtos.SpecialPriceResponse;
import com.erp.trade.service.SpecialPriceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 특별단가등록(E040124) API.
 * 표준단가를 덮어쓰는 예외 단가의 마스터 + 유효단가 해석.
 */
@RestController
@RequestMapping("/api/special-prices")
@RequiredArgsConstructor
public class SpecialPriceController {

    private final SpecialPriceService service;

    @GetMapping
    public List<SpecialPriceResponse> list() {
        return service.findAll();
    }

    /** 유효 특별단가 해석: (구분, 품목, 거래처) → 적용될 특별단가(거래처별→그룹별). */
    @GetMapping("/resolve")
    public ResolveResponse resolve(@RequestParam SpecialPriceType tradeType,
                                   @RequestParam Long itemId,
                                   @RequestParam Long partnerId) {
        return service.resolve(tradeType, itemId, partnerId);
    }

    @PostMapping
    public ResponseEntity<SpecialPriceResponse> create(
            @Valid @RequestBody CreateSpecialPriceRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 사용/사용중단 토글 */
    @PatchMapping("/{id}/active")
    public SpecialPriceResponse setActive(@PathVariable Long id, @RequestParam boolean active) {
        return service.setActive(id, active);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
