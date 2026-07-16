package com.erp.production.controller;

import com.erp.production.dto.ResourceDtos.CreateResourceRequest;
import com.erp.production.dto.ResourceDtos.ResourceResponse;
import com.erp.production.dto.ResourceDtos.UpdateResourceRequest;
import com.erp.production.service.ResourceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.production.dto.ResourceDtos;

@RestController
@RequestMapping("/api/resources")
@RequiredArgsConstructor
public class ResourceController {

    private final ResourceService resourceService;

    @GetMapping
    public List<ResourceResponse> list() {
        return resourceService.findAll();
    }

    @PostMapping
    public ResponseEntity<ResourceResponse> create(@Valid @RequestBody CreateResourceRequest req) {
        return ResponseEntity.ok(resourceService.create(req));
    }

    @PutMapping("/{id}")
    public ResourceResponse update(@PathVariable Long id, @Valid @RequestBody UpdateResourceRequest req) {
        return resourceService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        resourceService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
