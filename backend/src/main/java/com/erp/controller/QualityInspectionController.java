package com.erp.controller;

import com.erp.dto.QualityDtos.CreateInspectionRequest;
import com.erp.dto.QualityDtos.InspectionResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.QualityInspectionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/quality-inspections")
@RequiredArgsConstructor
public class QualityInspectionController {

    private final QualityInspectionService qualityInspectionService;

    @GetMapping
    public List<InspectionResponse> list() {
        return qualityInspectionService.findAll();
    }

    @PostMapping
    public ResponseEntity<InspectionResponse> create(
            @Valid @RequestBody CreateInspectionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(qualityInspectionService.create(req, principal.getName()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        qualityInspectionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
