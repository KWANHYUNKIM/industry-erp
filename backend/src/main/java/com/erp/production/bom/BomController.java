package com.erp.production.bom;

import com.erp.production.bom.dto.BomDtos.BomResponse;
import com.erp.production.bom.dto.BomDtos.SaveBomRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.production.bom.dto.BomDtos;

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
