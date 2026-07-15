package com.erp.controller;

import com.erp.dto.BomDtos.BomResponse;
import com.erp.dto.BomDtos.SaveBomRequest;
import com.erp.service.BomService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/boms")
@RequiredArgsConstructor
public class BomController {

    private final BomService bomService;

    @GetMapping
    public List<BomResponse> list() {
        return bomService.findAll();
    }

    @PostMapping
    public ResponseEntity<BomResponse> save(@Valid @RequestBody SaveBomRequest req) {
        return ResponseEntity.ok(bomService.save(req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        bomService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
