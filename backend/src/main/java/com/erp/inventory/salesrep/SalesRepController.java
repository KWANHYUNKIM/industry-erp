package com.erp.inventory.salesrep;

import com.erp.inventory.salesrep.dto.SalesRepDtos.ActiveRequest;
import com.erp.inventory.salesrep.dto.SalesRepDtos.NextCodeResponse;
import com.erp.inventory.salesrep.dto.SalesRepDtos.SalesRepRequest;
import com.erp.inventory.salesrep.dto.SalesRepDtos.SalesRepResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 재고 I › 기초등록 › 사원(담당)등록. */
@RestController
@RequestMapping("/api/sales-reps")
@RequiredArgsConstructor
public class SalesRepController {

    private final SalesRepService service;

    /** 전표 [담당자] 코드도움 — 사용 중인 것만. */
    @GetMapping
    public List<SalesRepResponse> list() {
        return service.findActive();
    }

    /** 사원(담당)리스트 — 사용중단 포함. */
    @GetMapping("/all")
    public List<SalesRepResponse> listAll() {
        return service.findAll();
    }

    @GetMapping("/next-code")
    public NextCodeResponse nextCode() {
        return new NextCodeResponse(service.nextCode());
    }

    @PostMapping
    public SalesRepResponse create(@Valid @RequestBody SalesRepRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public SalesRepResponse update(@PathVariable Long id, @Valid @RequestBody SalesRepRequest req) {
        return service.update(id, req);
    }

    @PutMapping("/{id}/active")
    public SalesRepResponse setActive(@PathVariable Long id, @RequestBody ActiveRequest req) {
        return service.setActive(id, req.active());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
