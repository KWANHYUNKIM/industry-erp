package com.erp.trade.settlement;

import com.erp.trade.settlement.dto.SettlementDtos.CreateSettlementRequest;
import com.erp.trade.settlement.dto.SettlementDtos.SettlementResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.trade.settlement.dto.SettlementDtos;

@RestController
@RequestMapping("/api/settlements")
@RequiredArgsConstructor
public class SettlementController {

    private final SettlementService settlementService;

    @GetMapping
    public List<SettlementResponse> list() {
        return settlementService.findAll();
    }

    @PostMapping
    public ResponseEntity<SettlementResponse> create(
            @Valid @RequestBody CreateSettlementRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(settlementService.create(req, principal.getUsername()));
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        settlementService.delete(id);
        return ResponseEntity.noContent().build();
    }

}
