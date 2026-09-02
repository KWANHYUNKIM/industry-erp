package com.erp.inventory.controller;

import com.erp.inventory.dto.LotDtos.AdjustLotRequest;
import com.erp.inventory.dto.LotDtos.ConsumeLotRequest;
import com.erp.inventory.dto.LotDtos.CreateLotRequest;
import com.erp.inventory.dto.LotDtos.HoldLotRequest;
import com.erp.inventory.dto.LotDtos.LotResponse;
import com.erp.inventory.dto.LotDtos.LotTransactionResponse;
import com.erp.inventory.service.LotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.inventory.dto.LotDtos;

@RestController
@RequestMapping("/api/lots")
@RequiredArgsConstructor
public class LotController {

    private final LotService lotService;

    @GetMapping
    public List<LotResponse> list(
            /* 원본 품목vs시리얼재고수량비교의 [기준일자] — 그 날 시점의 로트 잔량으로 되돌린다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate asOf) {
        return lotService.findAll(asOf);
    }

    /** 로트 수불부/내역조회 — 전체 로트 입출고 이력. */
    @GetMapping("/transactions")
    public List<LotTransactionResponse> transactions(
            /* 화면 조건 판의 [기준일자] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return lotService.transactions(from, to);
    }

    @PostMapping
    public ResponseEntity<LotResponse> create(@Valid @RequestBody CreateLotRequest req) {
        return ResponseEntity.ok(lotService.create(req));
    }

    @PatchMapping("/{id}/consume")
    public LotResponse consume(@PathVariable Long id, @Valid @RequestBody ConsumeLotRequest req) {
        return lotService.consume(id, req);
    }

    @PatchMapping("/{id}/hold")
    public LotResponse hold(@PathVariable Long id, @RequestBody HoldLotRequest req) {
        return lotService.hold(id, req);
    }

    @PatchMapping("/{id}/adjust")
    public LotResponse adjust(@PathVariable Long id, @Valid @RequestBody AdjustLotRequest req) {
        return lotService.adjust(id, req);
    }
}
