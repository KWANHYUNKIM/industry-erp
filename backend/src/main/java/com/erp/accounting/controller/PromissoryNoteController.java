package com.erp.accounting.controller;

import com.erp.accounting.dto.PromissoryNoteDtos.CreateNoteRequest;
import com.erp.accounting.dto.PromissoryNoteDtos.DiscountRequest;
import com.erp.accounting.dto.PromissoryNoteDtos.DishonorRequest;
import com.erp.accounting.dto.PromissoryNoteDtos.NoteResponse;
import com.erp.accounting.dto.PromissoryNoteDtos.NoteSummary;
import com.erp.accounting.dto.PromissoryNoteDtos.SettleRequest;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.PromissoryNoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.erp.accounting.dto.PromissoryNoteDtos;

/** 어음거래 (회계 I). 받을어음 수취 / 지급어음 발행 → 만기결제·할인·부도. */
@RestController
@RequestMapping("/api/notes")
@RequiredArgsConstructor
public class PromissoryNoteController {

    private final PromissoryNoteService service;

    @GetMapping
    public NoteSummary list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<NoteResponse> create(
            @Valid @RequestBody CreateNoteRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 만기결제 (계좌 입출금 + 분개) */
    @PostMapping("/{id}/settle")
    public NoteResponse settle(@PathVariable Long id, @RequestBody SettleRequest req,
                               @AuthenticationPrincipal UserPrincipal principal) {
        return service.settle(id, req, principal.getUsername());
    }

    /** 어음할인 (받을어음 전용) */
    @PostMapping("/{id}/discount")
    public NoteResponse discount(@PathVariable Long id, @Valid @RequestBody DiscountRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.discount(id, req, principal.getUsername());
    }

    /** 부도 처리 (받을어음 전용) */
    @PostMapping("/{id}/dishonor")
    public NoteResponse dishonor(@PathVariable Long id, @RequestBody(required = false) DishonorRequest req) {
        return service.dishonor(id, req);
    }
}
