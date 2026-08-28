package com.erp.production.controller;

import com.erp.production.dto.WorkResultDtos.CreateWorkResultBatchRequest;
import com.erp.production.dto.WorkResultDtos.CreateWorkResultRequest;
import com.erp.production.dto.WorkResultDtos.WorkResultResponse;
import com.erp.production.service.WorkResultService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.production.dto.WorkResultDtos;

@RestController
@RequestMapping("/api/work-results")
@RequiredArgsConstructor
public class WorkResultController {

    private final WorkResultService workResultService;

    @GetMapping
    public List<WorkResultResponse> list() {
        return workResultService.findAll();
    }

    /** 원본 작업내역입력의 격자 — 한 번에 여러 줄. 한 줄이라도 막히면 전부 되돌린다. */
    @PostMapping("/batch")
    public ResponseEntity<java.util.List<WorkResultResponse>> createBatch(
            @Valid @RequestBody CreateWorkResultBatchRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(workResultService.createBatch(req));
    }

    @PostMapping
    public ResponseEntity<WorkResultResponse> create(@Valid @RequestBody CreateWorkResultRequest req) {
        return ResponseEntity.ok(workResultService.create(req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        workResultService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
