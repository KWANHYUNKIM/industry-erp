package com.erp.controller;

import com.erp.dto.MaterialIssueDtos.CreateMaterialIssueRequest;
import com.erp.dto.MaterialIssueDtos.MaterialIssueResponse;
import com.erp.service.MaterialIssueService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/material-issues")
@RequiredArgsConstructor
public class MaterialIssueController {

    private final MaterialIssueService materialIssueService;

    @GetMapping
    public List<MaterialIssueResponse> list(
            @RequestParam(required = false) Long itemId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return materialIssueService.findAll(itemId, from, to);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<MaterialIssueResponse> create(@Valid @RequestBody CreateMaterialIssueRequest req) {
        return ResponseEntity.ok(materialIssueService.create(req));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        materialIssueService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
