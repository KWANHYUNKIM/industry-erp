package com.erp.controller;

import com.erp.dto.PartnerDtos.CreatePartnerRequest;
import com.erp.dto.PartnerDtos.PartnerResponse;
import com.erp.dto.PartnerDtos.UpdatePartnerRequest;
import com.erp.dto.PartnerDtos.UpdatePriceGroupRequest;
import com.erp.service.PartnerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/partners")
@RequiredArgsConstructor
public class PartnerController {

    private final PartnerService partnerService;

    @GetMapping
    public List<PartnerResponse> list() {
        return partnerService.findAll();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<PartnerResponse> create(@Valid @RequestBody CreatePartnerRequest req) {
        return ResponseEntity.ok(partnerService.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public PartnerResponse update(@PathVariable Long id, @Valid @RequestBody UpdatePartnerRequest req) {
        return partnerService.update(id, req);
    }

    @PatchMapping("/{id}/price-group")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public PartnerResponse updatePriceGroup(@PathVariable Long id, @RequestBody UpdatePriceGroupRequest req) {
        return partnerService.updatePriceGroup(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        partnerService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
