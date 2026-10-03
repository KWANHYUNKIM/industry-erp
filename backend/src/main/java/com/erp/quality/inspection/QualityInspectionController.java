package com.erp.quality.inspection;

import com.erp.quality.inspection.dto.QualityDtos.CreateInspectionRequest;
import com.erp.quality.inspection.dto.QualityDtos.InspectionResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.quality.inspection.dto.QualityDtos;

@RestController
@RequestMapping("/api/quality-inspections")
@RequiredArgsConstructor
public class QualityInspectionController {

    private final QualityInspectionService qualityInspectionService;

    @GetMapping
    public List<InspectionResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return qualityInspectionService.findAll(from, to);
    }

    @PostMapping
    public ResponseEntity<InspectionResponse> create(
            @Valid @RequestBody CreateInspectionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(qualityInspectionService.create(req, principal.getName()));
    }

    @PutMapping("/{id}")
    public InspectionResponse update(@PathVariable Long id, @Valid @RequestBody CreateInspectionRequest req) {
        return qualityInspectionService.update(id, req);
    }

    /** 원본 목록의 [종결여부] 진행중 ↔ 완료. */
    @PatchMapping("/{id}/status")
    public InspectionResponse changeStatus(@PathVariable Long id,
                                           @Valid @RequestBody com.erp.quality.inspection.dto.QualityDtos.StatusRequest req) {
        return qualityInspectionService.changeStatus(id, req.status());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        qualityInspectionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
