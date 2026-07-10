package com.erp.controller;

import com.erp.dto.StockTransferDtos.CreateTransferRequest;
import com.erp.dto.StockTransferDtos.TransferResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.StockTransferService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/stock-transfers")
@RequiredArgsConstructor
public class StockTransferController {

    private final StockTransferService stockTransferService;

    @GetMapping
    public List<TransferResponse> list() {
        return stockTransferService.findAll();
    }

    @PostMapping
    public ResponseEntity<TransferResponse> create(
            @Valid @RequestBody CreateTransferRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockTransferService.create(req, principal.getUsername()));
    }
}
