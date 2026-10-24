package com.erp.groupware.supply;

import com.erp.groupware.supply.dto.SupplyLabelDtos.SaveSupplyLabelRequest;
import com.erp.groupware.supply.dto.SupplyLabelDtos.SupplyLabelResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 원본 공용품관리 [라벨] 🔍 '라벨검색창' · [라벨변경 ▾ › 라벨설정] '라벨조회'. */
@RestController
@RequestMapping("/api/supply-labels")
@RequiredArgsConstructor
public class SupplyLabelController {

    private final SupplyLabelService labelService;

    @GetMapping
    public List<SupplyLabelResponse> list() {
        return labelService.list();
    }

    @PostMapping
    public SupplyLabelResponse create(@Valid @RequestBody SaveSupplyLabelRequest req) {
        return labelService.create(req);
    }

    @PutMapping("/{id}")
    public SupplyLabelResponse update(@PathVariable Long id, @Valid @RequestBody SaveSupplyLabelRequest req) {
        return labelService.update(id, req);
    }

    @PatchMapping("/{id}/active")
    public SupplyLabelResponse setActive(@PathVariable Long id, @RequestParam boolean active) {
        return labelService.setActive(id, active);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        labelService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
