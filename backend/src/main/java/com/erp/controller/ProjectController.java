package com.erp.controller;

import com.erp.dto.ProjectDtos.CreateProjectRequest;
import com.erp.dto.ProjectDtos.ProjectResponse;
import com.erp.dto.ProjectDtos.UpdateProjectRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

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
