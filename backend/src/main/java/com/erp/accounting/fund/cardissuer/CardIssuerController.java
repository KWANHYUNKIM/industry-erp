package com.erp.accounting.fund.cardissuer;

import com.erp.accounting.fund.cardissuer.dto.CardIssuerDtos.CardIssuerResponse;
import com.erp.accounting.fund.cardissuer.dto.CardIssuerDtos.CreateCardIssuerRequest;
import com.erp.accounting.fund.cardissuer.dto.CardIssuerDtos.UpdateCardIssuerRequest;
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

    /** 신규 창의 [카드사 코드] 처음 값 — 원본은 다음 번호를 미리 채운다(00022). */
    @GetMapping("/next-code")
    public java.util.Map<String, String> nextCode() {
        return java.util.Map.of("code", service.nextCode());
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
