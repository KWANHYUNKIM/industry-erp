package com.erp.accounting.controller;

import com.erp.accounting.dto.CardIssuerDtos.CardIssuerResponse;
import com.erp.accounting.dto.CardIssuerDtos.CreateCardIssuerRequest;
import com.erp.accounting.dto.CardIssuerDtos.UpdateCardIssuerRequest;
import com.erp.accounting.service.CardIssuerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 카드사등록(E010109) API. */
@RestController
@RequestMapping("/api/card-issuers")
@RequiredArgsConstructor
public class CardIssuerController {

    private final CardIssuerService service;

    @GetMapping
    public List<CardIssuerResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<CardIssuerResponse> create(@Valid @RequestBody CreateCardIssuerRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public CardIssuerResponse update(@PathVariable Long id, @Valid @RequestBody UpdateCardIssuerRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
