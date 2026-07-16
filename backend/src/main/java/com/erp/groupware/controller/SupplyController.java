package com.erp.groupware.controller;

import com.erp.groupware.dto.SupplyDtos.CreateSupplyRequest;
import com.erp.groupware.dto.SupplyDtos.SupplyResponse;
import com.erp.groupware.dto.SupplyDtos.UpdateSupplyRequest;
import com.erp.groupware.service.SupplyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.SupplyDtos;

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
    public ResponseEntity<SupplyResponse> create(@Valid @RequestBody CreateSupplyRequest req) {
        return ResponseEntity.ok(supplyService.create(req));
    }

    @PutMapping("/{id}")
    public SupplyResponse update(@PathVariable Long id, @Valid @RequestBody UpdateSupplyRequest req) {
        return supplyService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        supplyService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
