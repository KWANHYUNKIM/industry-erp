package com.erp.accounting.cost.importcost;

import com.erp.accounting.cost.importcost.dto.ImportCostDtos.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** 회계 II › 수입비용(E060201 ~ E060210) API. */
@RestController
@RequestMapping("/api/import-costs")
@RequiredArgsConstructor
public class ImportCostController {

    private final ImportCostService service;

    @GetMapping("/items")
    public List<CostItemResponse> items() {
        return service.items();
    }

    @PostMapping("/items")
    public CostItemResponse createItem(@Valid @RequestBody CreateCostItemRequest req) {
        return service.createItem(req);
    }

    @PutMapping("/items/{id}")
    public CostItemResponse updateItem(@PathVariable Long id, @Valid @RequestBody UpdateCostItemRequest req) {
        return service.updateItem(id, req);
    }

    @DeleteMapping("/items/{id}")
    public ResponseEntity<Void> deleteItem(@PathVariable Long id) {
        service.deleteItem(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/lots")
    public List<LotResponse> lots() {
        return service.lots();
    }

    @GetMapping("/lots/next-code")
    public Map<String, String> nextLotCode() {
        return Map.of("code", service.nextLotCode());
    }

    @PostMapping("/lots")
    public LotResponse createLot(@Valid @RequestBody CreateLotRequest req) {
        return service.createLot(req);
    }

    @PutMapping("/lots/{id}")
    public LotResponse updateLot(@PathVariable Long id, @Valid @RequestBody UpdateLotRequest req) {
        return service.updateLot(id, req);
    }

    @DeleteMapping("/lots/{id}")
    public ResponseEntity<Void> deleteLot(@PathVariable Long id) {
        service.deleteLot(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/vouchers")
    public List<VoucherResponse> vouchers(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.vouchers(from, to);
    }

    @GetMapping("/vouchers/{id}")
    public VoucherResponse voucher(@PathVariable Long id) {
        return service.voucher(id);
    }

    @PostMapping("/vouchers")
    public VoucherResponse create(@Valid @RequestBody SaveVoucherRequest req, Principal principal) {
        return service.create(req, principal != null ? principal.getName() : null);
    }

    @PutMapping("/vouchers/{id}")
    public VoucherResponse update(@PathVariable Long id, @Valid @RequestBody SaveVoucherRequest req, Principal principal) {
        return service.update(id, req, principal != null ? principal.getName() : null);
    }

    @PostMapping("/vouchers/delete")
    public ResponseEntity<Void> delete(@Valid @RequestBody DeleteVouchersRequest req) {
        service.delete(req.ids());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/ledger")
    public LedgerResponse ledger(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                 @RequestParam(required = false) Long lotId,
                                 @RequestParam(required = false) Long partnerId,
                                 @RequestParam(defaultValue = "true") boolean includeZero,
                                 @RequestParam(defaultValue = "true") boolean includeInactive) {
        return service.ledger(from, to, lotId, partnerId, includeZero, includeInactive);
    }
}
