package com.erp.controller;

import com.erp.dto.BusinessContractDtos.ContractResponse;
import com.erp.dto.BusinessContractDtos.CreateContractRequest;
import com.erp.dto.BusinessContractDtos.SignRequest;
import com.erp.dto.BusinessContractDtos.TerminateRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.BusinessContractService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 회계 II > 계약관리 · 전자계약 (작성 → 서명요청 → 전자서명 → 해지) */
@RestController
@RequestMapping("/api/contracts")
@RequiredArgsConstructor
public class BusinessContractController {

    private final BusinessContractService service;

    @GetMapping
    public List<ContractResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ContractResponse create(@Valid @RequestBody CreateContractRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    @PostMapping("/{id}/send")
    public ContractResponse send(@PathVariable Long id) {
        return service.send(id);
    }

    /** 전자서명 */
    @PostMapping("/{id}/sign")
    public ContractResponse sign(@PathVariable Long id, @Valid @RequestBody SignRequest req) {
        return service.sign(id, req);
    }

    @PostMapping("/{id}/terminate")
    public ContractResponse terminate(@PathVariable Long id, @Valid @RequestBody TerminateRequest req) {
        return service.terminate(id, req);
    }
}
