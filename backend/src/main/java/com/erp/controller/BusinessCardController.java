package com.erp.controller;

import com.erp.dto.BusinessCardDtos.CardResponse;
import com.erp.dto.BusinessCardDtos.CreateCardRequest;
import com.erp.service.BusinessCardService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 명함관리 (그룹웨어 > 고객관리 > 명함관리) */
@RestController
@RequestMapping("/api/business-cards")
@RequiredArgsConstructor
public class BusinessCardController {

    private final BusinessCardService service;

    @GetMapping
    public List<CardResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<CardResponse> create(@Valid @RequestBody CreateCardRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public CardResponse update(@PathVariable Long id, @Valid @RequestBody CreateCardRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
