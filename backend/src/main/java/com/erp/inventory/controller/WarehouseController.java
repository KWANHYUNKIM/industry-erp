package com.erp.inventory.controller;

import com.erp.inventory.dto.WarehouseDtos.CreateWarehouseRequest;
import com.erp.inventory.dto.WarehouseDtos.UpdateWarehouseRequest;
import com.erp.inventory.dto.WarehouseDtos.WarehouseResponse;
import com.erp.inventory.service.WarehouseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.inventory.dto.WarehouseDtos;

@RestController
@RequestMapping("/api/warehouses")
@RequiredArgsConstructor
public class WarehouseController {

    private final WarehouseService warehouseService;

    @GetMapping
    public List<WarehouseResponse> list() {
        return warehouseService.findAll();
    }

    @PostMapping
    public ResponseEntity<WarehouseResponse> create(@Valid @RequestBody CreateWarehouseRequest req) {
        return ResponseEntity.ok(warehouseService.create(req));
    }

    @PutMapping("/{id}")
    public WarehouseResponse update(@PathVariable Long id, @Valid @RequestBody UpdateWarehouseRequest req) {
        return warehouseService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        warehouseService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
