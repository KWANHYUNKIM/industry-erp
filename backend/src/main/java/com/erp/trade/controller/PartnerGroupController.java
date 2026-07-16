package com.erp.trade.controller;

import com.erp.trade.dto.PartnerGroupDtos.CreatePartnerGroupRequest;
import com.erp.trade.dto.PartnerGroupDtos.PartnerGroupResponse;
import com.erp.trade.dto.PartnerGroupDtos.UpdatePartnerGroupRequest;
import com.erp.trade.service.PartnerGroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.trade.dto.PartnerGroupDtos;

@RestController
@RequestMapping("/api/partner-groups")
@RequiredArgsConstructor
public class PartnerGroupController {

    private final PartnerGroupService partnerGroupService;

    @GetMapping
    public List<PartnerGroupResponse> list() {
        return partnerGroupService.findAll();
    }

    @PostMapping
    public ResponseEntity<PartnerGroupResponse> create(@Valid @RequestBody CreatePartnerGroupRequest req) {
        return ResponseEntity.ok(partnerGroupService.create(req));
    }

    @PutMapping("/{id}")
    public PartnerGroupResponse update(@PathVariable Long id, @Valid @RequestBody UpdatePartnerGroupRequest req) {
        return partnerGroupService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        partnerGroupService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
