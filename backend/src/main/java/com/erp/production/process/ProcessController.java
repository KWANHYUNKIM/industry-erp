package com.erp.production.process;

import com.erp.production.process.dto.ProcessDtos.CreateProcessRequest;
import com.erp.production.process.dto.ProcessDtos.ProcessResponse;
import com.erp.production.process.dto.ProcessDtos.UpdateProcessRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.production.process.dto.ProcessDtos;

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
    public ResponseEntity<ProcessResponse> create(@Valid @RequestBody CreateProcessRequest req) {
        return ResponseEntity.ok(processService.create(req));
    }

    @PutMapping("/{id}")
    public ProcessResponse update(@PathVariable Long id, @Valid @RequestBody UpdateProcessRequest req) {
        return processService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        processService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
