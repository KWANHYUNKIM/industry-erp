package com.erp.controller;

import com.erp.dto.ManagementItemDtos.CreateManagementItemRequest;
import com.erp.dto.ManagementItemDtos.ManagementItemResponse;
import com.erp.dto.ManagementItemDtos.UpdateManagementItemRequest;
import com.erp.service.ManagementItemService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/management-items")
@RequiredArgsConstructor
public class ManagementItemController {

    private final ManagementItemService managementItemService;

    @GetMapping
    public List<ManagementItemResponse> list() {
        return managementItemService.findAll();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<ManagementItemResponse> create(@Valid @RequestBody CreateManagementItemRequest req) {
        return ResponseEntity.ok(managementItemService.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ManagementItemResponse update(@PathVariable Long id, @Valid @RequestBody UpdateManagementItemRequest req) {
        return managementItemService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        managementItemService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
