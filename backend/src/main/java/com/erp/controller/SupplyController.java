package com.erp.controller;

import com.erp.dto.SupplyDtos.CreateSupplyRequest;
import com.erp.dto.SupplyDtos.SupplyResponse;
import com.erp.dto.SupplyDtos.UpdateSupplyRequest;
import com.erp.service.SupplyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/supplies")
@RequiredArgsConstructor
public class SupplyController {

    private final SupplyService supplyService;

    @GetMapping
    public List<SupplyResponse> list() {
        return supplyService.findAll();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<SupplyResponse> create(@Valid @RequestBody CreateSupplyRequest req) {
        return ResponseEntity.ok(supplyService.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public SupplyResponse update(@PathVariable Long id, @Valid @RequestBody UpdateSupplyRequest req) {
        return supplyService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        supplyService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
