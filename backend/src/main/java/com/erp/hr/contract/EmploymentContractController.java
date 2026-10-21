package com.erp.hr.contract;

import com.erp.hr.contract.dto.EmploymentContractDtos.ContractResponse;
import com.erp.hr.contract.dto.EmploymentContractDtos.CreateContractRequest;
import com.erp.hr.contract.dto.EmploymentContractDtos.SignContractRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.hr.contract.dto.EmploymentContractDtos;

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

    /** 원본 계약서입력 [저장(F8)] — 계약서명 · 첨부(PDF) */
    @PostMapping("/documents")
    public ContractResponse createDocument(@Valid @RequestBody EmploymentContractDtos.DocumentRequest req,
                                           @AuthenticationPrincipal UserPrincipal principal) {
        return service.createDocument(req, principal.getUsername());
    }

    @PutMapping("/{id}/document")
    public ContractResponse updateDocument(@PathVariable Long id, @Valid @RequestBody EmploymentContractDtos.DocumentRequest req) {
        return service.updateDocument(id, req);
    }

    @PostMapping("/{id}/copy")
    public ContractResponse copy(@PathVariable Long id, @Valid @RequestBody EmploymentContractDtos.CopyRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.copy(id, req, principal.getUsername());
    }

    @PutMapping("/{id}/recipient")
    public ContractResponse recipient(@PathVariable Long id, @Valid @RequestBody EmploymentContractDtos.RecipientRequest req) {
        return service.setRecipient(id, req);
    }

    @PostMapping("/{id}/cancel-request")
    public ContractResponse cancelRequest(@PathVariable Long id) {
        return service.cancelRequest(id);
    }

    @PostMapping("/{id}/re-request")
    public ContractResponse reRequest(@PathVariable Long id) {
        return service.reRequest(id);
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
