package com.erp.controller;

import com.erp.dto.WorkResultDtos.CreateWorkResultRequest;
import com.erp.dto.WorkResultDtos.WorkResultResponse;
import com.erp.service.WorkResultService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/work-results")
@RequiredArgsConstructor
public class WorkResultController {

    private final WorkResultService workResultService;

    @GetMapping
    public List<WorkResultResponse> list() {
        return workResultService.findAll();
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
