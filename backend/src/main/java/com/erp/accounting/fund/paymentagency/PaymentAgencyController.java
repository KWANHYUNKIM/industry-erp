package com.erp.accounting.fund.paymentagency;

import com.erp.accounting.fund.paymentagency.dto.PaymentAgencyDtos.CreatePaymentAgencyRequest;
import com.erp.accounting.fund.paymentagency.dto.PaymentAgencyDtos.PaymentAgencyResponse;
import com.erp.accounting.fund.paymentagency.dto.PaymentAgencyDtos.UpdatePaymentAgencyRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 결제대행사등록(E010114) API. */
@RestController
@RequestMapping("/api/payment-agencies")
@RequiredArgsConstructor
public class PaymentAgencyController {

    private final PaymentAgencyService service;

    @GetMapping
    public List<PaymentAgencyResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<PaymentAgencyResponse> create(@Valid @RequestBody CreatePaymentAgencyRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public PaymentAgencyResponse update(@PathVariable Long id, @Valid @RequestBody UpdatePaymentAgencyRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** [이체정보] 이체정보리스트 · 등록 · 수정 · 삭제(원본 E010114 2026-10-21 실측). */
    @GetMapping("/{id}/transfers")
    public List<com.erp.accounting.fund.paymentagency.dto.PaymentAgencyDtos.TransferResponse> transfers(@PathVariable Long id) {
        return service.transfers(id);
    }

    @PostMapping("/{id}/transfers")
    public com.erp.accounting.fund.paymentagency.dto.PaymentAgencyDtos.TransferResponse addTransfer(
            @PathVariable Long id, @Valid @RequestBody com.erp.accounting.fund.paymentagency.dto.PaymentAgencyDtos.SaveTransferRequest req) {
        return service.addTransfer(id, req);
    }

    @PutMapping("/transfers/{transferId}")
    public com.erp.accounting.fund.paymentagency.dto.PaymentAgencyDtos.TransferResponse updateTransfer(
            @PathVariable Long transferId, @Valid @RequestBody com.erp.accounting.fund.paymentagency.dto.PaymentAgencyDtos.SaveTransferRequest req) {
        return service.updateTransfer(transferId, req);
    }

    @DeleteMapping("/transfers/{transferId}")
    public ResponseEntity<Void> deleteTransfer(@PathVariable Long transferId) {
        service.deleteTransfer(transferId);
        return ResponseEntity.noContent().build();
    }
}
