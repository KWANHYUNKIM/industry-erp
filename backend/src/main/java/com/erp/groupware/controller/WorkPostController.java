package com.erp.groupware.controller;

import com.erp.groupware.dto.WorkPostDtos.CreateWorkPostRequest;
import com.erp.groupware.dto.WorkPostDtos.UpdateWorkPostStatusRequest;
import com.erp.groupware.dto.WorkPostDtos.WorkPostResponse;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.WorkPostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.WorkPostDtos;

@RestController
@RequestMapping("/api/work-posts")
@RequiredArgsConstructor
public class WorkPostController {

    private final WorkPostService workPostService;

    @GetMapping
    public List<WorkPostResponse> list() {
        return workPostService.findAll();
    }

    @PostMapping
    public ResponseEntity<WorkPostResponse> create(
            @Valid @RequestBody CreateWorkPostRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(workPostService.create(req, principal.getName()));
    }

    @PatchMapping("/{id}/status")
    public WorkPostResponse updateStatus(@PathVariable Long id, @RequestBody(required = false) UpdateWorkPostStatusRequest req) {
        return workPostService.updateStatus(id, req != null ? req : new UpdateWorkPostStatusRequest(null));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        workPostService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
