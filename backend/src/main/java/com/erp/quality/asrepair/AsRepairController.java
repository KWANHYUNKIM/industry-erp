package com.erp.quality.asrepair;

import com.erp.quality.asrepair.dto.AsRepairDtos.LinkSaleRequest;
import com.erp.quality.asrepair.dto.AsRepairDtos.RepairRequest;
import com.erp.quality.asrepair.dto.AsRepairDtos.RepairResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** A/S수리 입력 · 조회 · 판매연결전표. */
@RestController
@RequestMapping("/api/as-repairs")
@RequiredArgsConstructor
public class AsRepairController {

    private final AsRepairService service;

    @GetMapping
    public List<RepairResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.list(from != null ? from : LocalDate.of(1, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31));
    }

    @GetMapping("/{id}")
    public RepairResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public RepairResponse create(@Valid @RequestBody RepairRequest req, @AuthenticationPrincipal UserPrincipal p) {
        return service.create(req, p.getUsername());
    }

    @PutMapping("/{id}")
    public RepairResponse update(@PathVariable Long id, @Valid @RequestBody RepairRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/sales")
    public RepairResponse linkSale(@PathVariable Long id, @Valid @RequestBody LinkSaleRequest req,
                                   @AuthenticationPrincipal UserPrincipal p) {
        return service.linkSale(id, req, p.getUsername());
    }

    @DeleteMapping("/{id}/sales/{salesId}")
    public RepairResponse unlinkSale(@PathVariable Long id, @PathVariable Long salesId,
                                     @AuthenticationPrincipal UserPrincipal p) {
        return service.unlinkSale(id, salesId, p.getUsername());
    }
}
