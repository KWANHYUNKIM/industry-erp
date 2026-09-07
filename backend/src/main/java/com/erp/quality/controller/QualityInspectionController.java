package com.erp.quality.controller;

import com.erp.quality.dto.QualityDtos.CreateInspectionRequest;
import com.erp.quality.dto.QualityDtos.InspectionResponse;
import com.erp.security.UserPrincipal;
import com.erp.quality.service.QualityInspectionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.quality.dto.QualityDtos;

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

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        qualityInspectionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
