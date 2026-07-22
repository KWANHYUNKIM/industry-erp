package com.erp.accounting.controller;

import com.erp.accounting.dto.ProjectPlanDtos.ComparisonRow;
import com.erp.accounting.dto.ProjectPlanDtos.CreateProjectPlanRequest;
import com.erp.accounting.dto.ProjectPlanDtos.ProjectPlanResponse;
import com.erp.accounting.service.ProjectPlanService;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/project-plans")
@RequiredArgsConstructor
public class ProjectPlanController {

    private final ProjectPlanService service;

    @GetMapping
    public List<ProjectPlanResponse> list(@RequestParam(required = false) Integer year) {
        return service.findAll(year);
    }

    @GetMapping("/comparison")
    public List<ComparisonRow> comparison(@RequestParam int year) {
        return service.comparison(year);
    }

    @PostMapping
    public ResponseEntity<ProjectPlanResponse> create(
            @Valid @RequestBody CreateProjectPlanRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
