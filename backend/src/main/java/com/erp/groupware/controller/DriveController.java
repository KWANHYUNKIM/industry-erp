package com.erp.groupware.controller;

import com.erp.groupware.dto.DriveDtos.CreateDocumentRequest;
import com.erp.groupware.dto.DriveDtos.DocumentResponse;
import com.erp.groupware.dto.DriveDtos.UpdateDocumentRequest;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.DriveService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.DriveDtos;

@RestController
@RequestMapping("/api/drive-documents")
@RequiredArgsConstructor
public class DriveController {

    private final DriveService driveService;

    @GetMapping
    public List<DocumentResponse> list(@RequestParam(required = false, defaultValue = "my") String folder) {
        return driveService.list(folder);
    }

    @PostMapping
    public ResponseEntity<DocumentResponse> create(
            @Valid @RequestBody CreateDocumentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(driveService.create(req, principal.getName()));
    }

    @PatchMapping("/{id}")
    public DocumentResponse update(@PathVariable Long id, @RequestBody UpdateDocumentRequest req) {
        return driveService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        driveService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
