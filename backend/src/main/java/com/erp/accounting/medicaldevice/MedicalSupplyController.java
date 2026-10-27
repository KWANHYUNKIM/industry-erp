package com.erp.accounting.medicaldevice;

import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryLineResponse;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryRequest;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryResponse;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.EntryRow;
import com.erp.accounting.medicaldevice.dto.MedicalSupplyDtos.SaleCandidate;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 의료기기공급내역보고(C001403) — 저장하는 보고 줄. 통합시스템 전송은 하지 않는다. */
@RestController
@RequestMapping("/api/medical-device-reports/entries")
@RequiredArgsConstructor
public class MedicalSupplyController {

    private final MedicalSupplyService service;

    @GetMapping
    public List<EntryRow> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Boolean transmitted) {
        return service.list(from, to, transmitted);
    }

    @GetMapping("/{id}")
    public EntryResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @GetMapping("/sales")
    public List<SaleCandidate> sales(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.sales(from, to);
    }

    @PostMapping("/pull")
    public List<EntryLineResponse> pull(@RequestBody List<Long> saleIds,
                                        @RequestParam(required = false) Long exceptEntryId) {
        return service.pull(saleIds, exceptEntryId);
    }

    @PostMapping
    public EntryResponse create(@Valid @RequestBody EntryRequest req,
                                @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getName());
    }

    @PutMapping("/{id}")
    public EntryResponse update(@PathVariable Long id, @Valid @RequestBody EntryRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
