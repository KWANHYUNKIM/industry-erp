package com.erp.controller;

import com.erp.dto.EmploymentContractDtos.ContractResponse;
import com.erp.dto.EmploymentContractDtos.CreateContractRequest;
import com.erp.dto.EmploymentContractDtos.SignContractRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.EmploymentContractService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 전자근로계약 (관리 > 전자근로계약) */
@RestController
@RequestMapping("/api/employment-contracts")
@RequiredArgsConstructor
public class EmploymentContractController {

    private final EmploymentContractService service;

    @GetMapping
    public List<ContractResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<ContractResponse> create(@Valid @RequestBody CreateContractRequest req,
                                                   @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @PostMapping("/{id}/send")
    public ContractResponse send(@PathVariable Long id) {
        return service.send(id);
    }

    /** 사원 서명 */
    @PostMapping("/{id}/sign")
    public ContractResponse sign(@PathVariable Long id, @Valid @RequestBody SignContractRequest req) {
        return service.sign(id, req);
    }

    @PostMapping("/{id}/terminate")
    public ContractResponse terminate(@PathVariable Long id) {
        return service.terminate(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
