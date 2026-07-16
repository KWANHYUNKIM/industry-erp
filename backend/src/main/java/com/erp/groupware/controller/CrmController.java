package com.erp.groupware.controller;

import com.erp.groupware.dto.CrmDtos.CreateCrmRequest;
import com.erp.groupware.dto.CrmDtos.CrmResponse;
import com.erp.groupware.dto.CrmDtos.UpdateCrmRequest;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.CrmService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.CrmDtos;

@RestController
@RequestMapping("/api/crm-activities")
@RequiredArgsConstructor
public class CrmController {

    private final CrmService crmService;

    @GetMapping
    public List<CrmResponse> list() {
        return crmService.findAll();
    }

    @PostMapping
    public ResponseEntity<CrmResponse> create(
            @Valid @RequestBody CreateCrmRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(crmService.create(req, principal.getName()));
    }

    @PatchMapping("/{id}")
    public CrmResponse update(@PathVariable Long id, @RequestBody UpdateCrmRequest req) {
        return crmService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        crmService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
