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

    /**
     * BOM 목록. 기본은 제품마다 <b>기본 BOM</b> 하나(예전 그대로). versions=all 이면 모든 버전 —
     * 원본 품목별BOM조회 · 생산입고 줄의 [BOM버전] 고르기가 쓴다.
     */
    @GetMapping
    public List<BomResponse> list(@RequestParam(required = false) String versions) {
        return "all".equalsIgnoreCase(versions) ? bomService.findAllVersions() : bomService.findAll();
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
