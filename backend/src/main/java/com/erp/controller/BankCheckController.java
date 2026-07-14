package com.erp.controller;

import com.erp.dto.BankCheckDtos.CheckResponse;
import com.erp.dto.BankCheckDtos.CreateCheckRequest;
import com.erp.dto.BankCheckDtos.DepositRequest;
import com.erp.dto.BankCheckDtos.SettleRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.BankCheckService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 회계 II > 수표관리 — 받은수표(수취·입금·부도) / 발행수표(발행·결제확인) */
@RestController
@RequestMapping("/api/checks")
@RequiredArgsConstructor
public class BankCheckController {

    private final BankCheckService service;

    @GetMapping
    public List<CheckResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public CheckResponse create(@Valid @RequestBody CreateCheckRequest req,
                                @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    /** 받은수표를 계좌에 입금 */
    @PostMapping("/{id}/deposit")
    public CheckResponse deposit(@PathVariable Long id, @Valid @RequestBody DepositRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.deposit(id, req, principal.getUsername());
    }

    /** 받은수표 부도 */
    @PostMapping("/{id}/dishonor")
    public CheckResponse dishonor(@PathVariable Long id, @RequestBody(required = false) SettleRequest req,
                                  @AuthenticationPrincipal UserPrincipal principal) {
        return service.dishonor(id, req != null ? req : new SettleRequest(null), principal.getUsername());
    }

    /** 발행수표 은행 인출 확인 */
    @PostMapping("/{id}/settle")
    public CheckResponse settle(@PathVariable Long id, @RequestBody(required = false) SettleRequest req) {
        return service.settle(id, req != null ? req : new SettleRequest(null));
    }
}
