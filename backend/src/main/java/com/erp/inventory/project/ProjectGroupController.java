package com.erp.inventory.project;

import com.erp.inventory.project.dto.ProjectGroupDtos.CreateProjectGroupRequest;
import com.erp.inventory.project.dto.ProjectGroupDtos.ProjectGroupResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/project-groups")
@RequiredArgsConstructor
public class ProjectGroupController {

    private final ProjectGroupService projectGroupService;

    @GetMapping
    public List<ProjectGroupResponse> list() {
        return projectGroupService.findAll();
    }

    @PostMapping
    public ResponseEntity<ProjectGroupResponse> create(@Valid @RequestBody CreateProjectGroupRequest req) {
        return ResponseEntity.ok(projectGroupService.create(req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        projectGroupService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
