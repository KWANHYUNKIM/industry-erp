package com.erp.inventory.lot;

import com.erp.inventory.lot.dto.LotDtos.AdjustLotRequest;
import com.erp.inventory.lot.dto.LotDtos.ConsumeLotRequest;
import com.erp.inventory.lot.dto.LotDtos.CreateLotRequest;
import com.erp.inventory.lot.dto.LotDtos.HoldLotRequest;
import com.erp.inventory.lot.dto.LotDtos.LotResponse;
import com.erp.inventory.lot.dto.LotDtos.LotTransactionResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.inventory.lot.dto.LotDtos;

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

    /** 원본 시리얼/로트No.내역조회 [신규(F2)] — '시리얼/로트No.내역입력'. */
    @PostMapping("/transactions")
    public LotTransactionResponse createManual(@Valid @RequestBody com.erp.inventory.lot.dto.LotDtos.ManualTxRequest req) {
        return lotService.createManual(req);
    }

    @PutMapping("/transactions/{id}")
    public LotTransactionResponse updateManual(@PathVariable Long id,
                                               @Valid @RequestBody com.erp.inventory.lot.dto.LotDtos.ManualTxRequest req) {
        return lotService.updateManual(id, req);
    }

    /** 원본 목록 [선택삭제] — 손으로 넣은 줄만 지운다. */
    @PostMapping("/transactions/delete")
    public ResponseEntity<Void> deleteManual(@Valid @RequestBody com.erp.inventory.lot.dto.LotDtos.DeleteTxRequest req) {
        lotService.deleteManual(req.ids());
        return ResponseEntity.noContent().build();
    }

    /** 원본 수정 창 [저장(F8)] — 품목 · udi코드 · 유효기한. */
    @PutMapping("/{id}")
    public LotResponse update(@PathVariable Long id, @Valid @RequestBody com.erp.inventory.lot.dto.LotDtos.UpdateLotRequest req) {
        return lotService.update(id, req);
    }

    /** 원본 수정 창 [삭제] — 내역이 있으면 막힌다. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        lotService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 원본 목록 [사용중단/재사용]. */
    @PostMapping("/use")
    public ResponseEntity<Void> setUse(@Valid @RequestBody com.erp.inventory.lot.dto.LotDtos.LotUseRequest req) {
        lotService.setUse(req.ids(), req.use());
        return ResponseEntity.noContent().build();
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
