package com.erp.trade.price;

import com.erp.security.UserPrincipal;
import com.erp.trade.price.dto.SpecialPriceDtos.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 특별단가등록(E040124) API — 알약 넷(특별단가그룹 · 품목별 · 품목그룹별 · 적용단가)과 그룹의 거래처설정 · 창고설정,
 * 전표의 단가 불러오기(/resolve).
 */
@RestController
@RequestMapping("/api/special-prices")
@RequiredArgsConstructor
public class SpecialPriceController {

    private final SpecialPriceService service;

    // 특별단가그룹
    @GetMapping("/groups")
    public List<GroupResponse> groups() { return service.groups(); }

    @PostMapping("/groups")
    public GroupResponse createGroup(@Valid @RequestBody SaveGroupRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.createGroup(req, principal.getUsername());
    }

    @PutMapping("/groups/{id}")
    public GroupResponse updateGroup(@PathVariable Long id, @Valid @RequestBody SaveGroupRequest req) {
        return service.updateGroup(id, req);
    }

    @PatchMapping("/groups/{id}/active")
    public ResponseEntity<Void> setGroupActive(@PathVariable Long id, @RequestParam boolean active) {
        service.setGroupActive(id, active);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/groups/{id}")
    public ResponseEntity<Void> deleteGroup(@PathVariable Long id) {
        service.deleteGroup(id);
        return ResponseEntity.noContent().build();
    }

    // 거래처설정
    @GetMapping("/groups/{id}/partners")
    public List<MemberResponse> partners(@PathVariable Long id) { return service.partners(id); }

    @PostMapping("/groups/{id}/partners")
    public ResponseEntity<Void> addPartner(@PathVariable Long id, @Valid @RequestBody MemberRequest req) {
        service.addPartner(id, req);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/groups/{id}/partners/{partnerId}")
    public ResponseEntity<Void> removePartner(@PathVariable Long id, @PathVariable Long partnerId, @RequestParam SpecialPriceType tradeType) {
        service.removePartner(id, partnerId, tradeType);
        return ResponseEntity.noContent().build();
    }

    // 창고설정
    @GetMapping("/groups/{id}/warehouses")
    public List<MemberResponse> warehouses(@PathVariable Long id) { return service.warehouses(id); }

    @PostMapping("/groups/{id}/warehouses")
    public ResponseEntity<Void> addWarehouse(@PathVariable Long id, @Valid @RequestBody MemberRequest req) {
        service.addWarehouse(id, req);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/warehouse-links/{linkId}")
    public ResponseEntity<Void> removeWarehouse(@PathVariable Long linkId) {
        service.removeWarehouse(linkId);
        return ResponseEntity.noContent().build();
    }

    // 품목별
    @GetMapping
    public List<ItemPriceResponse> itemPrices() { return service.itemPrices(); }

    @PostMapping
    public ItemPriceResponse createItemPrice(@Valid @RequestBody SaveItemPriceRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.createItemPrice(req, principal.getUsername());
    }

    @PutMapping("/{id}")
    public ItemPriceResponse updateItemPrice(@PathVariable Long id, @Valid @RequestBody SaveItemPriceRequest req) {
        return service.updateItemPrice(id, req);
    }

    @PatchMapping("/{id}/active")
    public ResponseEntity<Void> setItemPriceActive(@PathVariable Long id, @RequestParam boolean active) {
        service.setItemPriceActive(id, active);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteItemPrice(@PathVariable Long id) {
        service.deleteItemPrice(id);
        return ResponseEntity.noContent().build();
    }

    // 품목그룹별
    @GetMapping("/item-groups")
    public List<ItemGroupPriceResponse> itemGroupPrices() { return service.itemGroupPrices(); }

    @PostMapping("/item-groups")
    public ItemGroupPriceResponse createItemGroupPrice(@Valid @RequestBody SaveItemGroupPriceRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.createItemGroupPrice(req, principal.getUsername());
    }

    @PutMapping("/item-groups/{id}")
    public ItemGroupPriceResponse updateItemGroupPrice(@PathVariable Long id, @Valid @RequestBody SaveItemGroupPriceRequest req) {
        return service.updateItemGroupPrice(id, req);
    }

    @PatchMapping("/item-groups/{id}/active")
    public ResponseEntity<Void> setItemGroupPriceActive(@PathVariable Long id, @RequestParam boolean active) {
        service.setItemGroupPriceActive(id, active);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/item-groups/{id}")
    public ResponseEntity<Void> deleteItemGroupPrice(@PathVariable Long id) {
        service.deleteItemGroupPrice(id);
        return ResponseEntity.noContent().build();
    }

    /** 품목그룹추가 창의 고르는 값(단가기준 · 조정_단위처리 둘). */
    @GetMapping("/item-groups/options")
    public Map<String, List<String>> itemGroupOptions() {
        return Map.of("priceBases", SpecialPriceService.PRICE_BASES,
                "roundUnits", SpecialPriceService.ROUND_UNITS,
                "roundModes", SpecialPriceService.ROUND_MODES);
    }

    // 적용단가
    @GetMapping("/applied")
    public List<AppliedPriceRow> applied() { return service.appliedPrices(); }

    /** 전표의 단가 불러오기: (구분, 품목, 거래처, 창고) → 단가적용순서대로 먼저 걸리는 특별단가. */
    @GetMapping("/resolve")
    public ResolveResponse resolve(@RequestParam SpecialPriceType tradeType,
                                   @RequestParam Long itemId,
                                   @RequestParam(required = false) Long partnerId,
                                   @RequestParam(required = false) Long warehouseId) {
        return service.resolve(tradeType, itemId, partnerId, warehouseId);
    }

    /** 단가적용순서설정에서 특별단가 줄이 켜져 있나 — 화면이 "등록해도 안 걸린다" 를 알린다. */
    @GetMapping("/enabled")
    public boolean enabled(@RequestParam SpecialPriceType tradeType) {
        return service.partnerSpecialPriceEnabled(tradeType);
    }
}
