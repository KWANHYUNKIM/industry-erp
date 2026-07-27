package com.erp.accounting.controller;

import com.erp.accounting.dto.PaymentAgencyDtos.CreatePaymentAgencyRequest;
import com.erp.accounting.dto.PaymentAgencyDtos.PaymentAgencyResponse;
import com.erp.accounting.dto.PaymentAgencyDtos.UpdatePaymentAgencyRequest;
import com.erp.accounting.service.PaymentAgencyService;
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
}
