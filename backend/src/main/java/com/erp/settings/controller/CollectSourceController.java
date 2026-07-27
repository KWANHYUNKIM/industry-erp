package com.erp.settings.controller;

import com.erp.settings.dto.CollectSourceDtos.CollectSourceResponse;
import com.erp.settings.dto.CollectSourceDtos.CreateCollectSourceRequest;
import com.erp.settings.dto.CollectSourceDtos.UpdateCollectSourceRequest;
import com.erp.settings.service.CollectSourceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 수집데이터 소스 등록(E100000) API. */
@RestController
@RequestMapping("/api/collect-sources")
@RequiredArgsConstructor
public class CollectSourceController {

    private final CollectSourceService service;

    @GetMapping
    public List<CollectSourceResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<CollectSourceResponse> create(@Valid @RequestBody CreateCollectSourceRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public CollectSourceResponse update(@PathVariable Long id, @Valid @RequestBody UpdateCollectSourceRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
