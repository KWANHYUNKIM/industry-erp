package com.erp.production.processoperation;

import com.erp.production.processoperation.dto.ProcessOperationDtos.OperationResponse;
import com.erp.production.processoperation.dto.ProcessOperationDtos.SaveOperationRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 작업코드등록 API (공정등록의 [작업코드등록]). */
@RestController
@RequestMapping("/api/process-operations")
@RequiredArgsConstructor
public class ProcessOperationController {

    private final ProcessOperationService service;

    @GetMapping
    public List<OperationResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public OperationResponse create(@Valid @RequestBody SaveOperationRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public OperationResponse update(@PathVariable Long id, @Valid @RequestBody SaveOperationRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
