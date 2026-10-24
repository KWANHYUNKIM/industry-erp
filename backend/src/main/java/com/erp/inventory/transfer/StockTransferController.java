package com.erp.inventory.transfer;

import com.erp.inventory.transfer.dto.StockTransferDtos.CreateTransferRequest;
import com.erp.inventory.transfer.dto.StockTransferDtos.TransferResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.time.LocalDate;
import com.erp.inventory.transfer.dto.StockTransferDtos;

@RestController
@RequestMapping("/api/stock-transfers")
@RequiredArgsConstructor
public class StockTransferController {

    private final StockTransferService stockTransferService;

    @GetMapping
    public List<TransferResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return stockTransferService.findAll(from, to);
    }

    @PostMapping
    public ResponseEntity<TransferResponse> create(
            @Valid @RequestBody CreateTransferRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockTransferService.create(req, principal.getUsername()));
    }

    /** 창고이동 전표 한 장(원본 창고이동조회에서 이동번호를 눌러 여는 창). */
    @GetMapping("/slips/{transferNo}")
    public List<TransferResponse> slip(@PathVariable String transferNo) {
        return stockTransferService.findSlip(transferNo);
    }

    /** 창고이동입력 — 머리 하나에 품목 여러 줄. */
    @PostMapping("/slips")
    public List<TransferResponse> createSlip(@Valid @RequestBody StockTransferDtos.TransferSlipRequest req,
                                             @AuthenticationPrincipal UserPrincipal principal) {
        return stockTransferService.createSlip(req, principal.getUsername());
    }

    @PutMapping("/slips/{transferNo}")
    public List<TransferResponse> updateSlip(@PathVariable String transferNo,
                                             @Valid @RequestBody StockTransferDtos.TransferSlipRequest req,
                                             @AuthenticationPrincipal UserPrincipal principal) {
        return stockTransferService.updateSlip(transferNo, req, principal.getUsername());
    }

    @DeleteMapping("/slips/{transferNo}")
    public ResponseEntity<Void> deleteSlip(@PathVariable String transferNo,
                                           @AuthenticationPrincipal UserPrincipal principal) {
        stockTransferService.deleteSlip(transferNo, principal.getUsername());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        stockTransferService.delete(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
