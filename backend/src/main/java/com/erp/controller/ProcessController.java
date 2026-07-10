package com.erp.controller;

import com.erp.dto.ProcessDtos.CreateProcessRequest;
import com.erp.dto.ProcessDtos.ProcessResponse;
import com.erp.dto.ProcessDtos.UpdateProcessRequest;
import com.erp.service.ProcessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/processes")
@RequiredArgsConstructor
public class ProcessController {

    private final ProcessService processService;

    @GetMapping
    public List<ProcessResponse> list() {
        return processService.findAll();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<ProcessResponse> create(@Valid @RequestBody CreateProcessRequest req) {
        return ResponseEntity.ok(processService.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ProcessResponse update(@PathVariable Long id, @Valid @RequestBody UpdateProcessRequest req) {
        return processService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        processService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
