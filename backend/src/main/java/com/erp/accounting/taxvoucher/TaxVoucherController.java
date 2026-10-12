package com.erp.accounting.taxvoucher;

import com.erp.accounting.taxvoucher.dto.TaxVoucherDtos.TaxVoucherRequest;
import com.erp.accounting.taxvoucher.dto.TaxVoucherDtos.TaxVoucherResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 세무 › 부가세 › (세금)계산서발행/수령 (원본 C000068). */
@RestController
@RequestMapping("/api/tax-vouchers")
@RequiredArgsConstructor
public class TaxVoucherController {

    private final TaxVoucherService service;

    @GetMapping
    public List<TaxVoucherResponse> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) TaxVoucherSide side) {
        return service.list(from, to, side);
    }

    @GetMapping("/{id}")
    public TaxVoucherResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public TaxVoucherResponse create(@Valid @RequestBody TaxVoucherRequest req,
                                     @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    @PutMapping("/{id}")
    public TaxVoucherResponse update(@PathVariable Long id, @Valid @RequestBody TaxVoucherRequest req,
                                     @AuthenticationPrincipal UserPrincipal principal) {
        return service.update(id, req, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
