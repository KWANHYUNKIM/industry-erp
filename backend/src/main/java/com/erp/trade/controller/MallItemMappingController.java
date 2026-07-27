package com.erp.trade.controller;

import com.erp.trade.dto.MallItemMappingDtos.CreateMappingRequest;
import com.erp.trade.dto.MallItemMappingDtos.MappingResponse;
import com.erp.trade.dto.MallItemMappingDtos.UpdateMappingRequest;
import com.erp.trade.service.MallItemMappingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 쇼핑몰 품목코드연결(E041004) API. */
@RestController
@RequestMapping("/api/mall-item-mappings")
@RequiredArgsConstructor
public class MallItemMappingController {

    private final MallItemMappingService service;

    @GetMapping
    public List<MappingResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<MappingResponse> create(@Valid @RequestBody CreateMappingRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public MappingResponse update(@PathVariable Long id, @Valid @RequestBody UpdateMappingRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
