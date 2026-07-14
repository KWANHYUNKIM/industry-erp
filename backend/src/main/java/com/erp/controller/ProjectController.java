package com.erp.controller;

import com.erp.dto.ProjectDtos.CreateProjectRequest;
import com.erp.dto.ProjectDtos.ProjectResponse;
import com.erp.dto.ProjectDtos.UpdateProjectRequest;
import com.erp.security.UserPrincipal;
import com.erp.dto.ProjectProfitDtos.ProjectProfitSummary;
import org.springframework.format.annotation.DateTimeFormat;
import com.erp.service.ProjectProfitService;
import com.erp.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;
    private final ProjectProfitService projectProfitService;

    /** 프로젝트별 손익 (매출=판매전표 공급가액, 원가=구매전표, 비용=비용전표) */
    @GetMapping("/profit")
    public ProjectProfitSummary profit(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return projectProfitService.profit(from, to);
    }

    @GetMapping
    public List<ProjectResponse> list() {
        return projectService.findAll();
    }

    @PostMapping
    public ResponseEntity<ProjectResponse> create(
            @Valid @RequestBody CreateProjectRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(projectService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public ProjectResponse update(@PathVariable Long id, @Valid @RequestBody UpdateProjectRequest req) {
        return projectService.update(id, req);
    }
}
