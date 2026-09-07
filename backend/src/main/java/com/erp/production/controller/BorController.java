package com.erp.production.controller;

import com.erp.production.dto.BorDtos.BorResponse;
import com.erp.production.dto.BorDtos.SaveBorRequest;
import com.erp.production.service.BorService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** BOR(작업소요시간) — 품목별 작업 라우팅 API. */
@RestController
@RequestMapping("/api/bor")
@RequiredArgsConstructor
public class BorController {

    private final BorService borService;

    @GetMapping
    public List<BorResponse> list() {
        return borService.findAll();
    }

    @PostMapping
    public BorResponse create(@Valid @RequestBody SaveBorRequest req) {
        return borService.create(req);
    }

    @PutMapping("/{id}")
    public BorResponse update(@PathVariable Long id, @Valid @RequestBody SaveBorRequest req) {
        return borService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        borService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
