package com.erp.trade.mall;

import com.erp.trade.mall.dto.MallAccountDtos.CreateMallAccountRequest;
import com.erp.trade.mall.dto.MallAccountDtos.MallAccountResponse;
import com.erp.trade.mall.dto.MallAccountDtos.UpdateMallAccountRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 쇼핑몰 등록(C000664) API. */
@RestController
@RequestMapping("/api/mall-accounts")
@RequiredArgsConstructor
public class MallAccountController {

    private final MallAccountService service;

    @GetMapping
    public List<MallAccountResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<MallAccountResponse> create(@Valid @RequestBody CreateMallAccountRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public MallAccountResponse update(@PathVariable Long id, @Valid @RequestBody UpdateMallAccountRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
