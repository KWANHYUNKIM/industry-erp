package com.erp.accounting.extrafield;

import com.erp.accounting.extrafield.dto.ExtraFieldDtos.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 회계 I › 기초등록 › 추가항목유형등록(E010118). */
@RestController
@RequestMapping("/api/extra-field-types")
@RequiredArgsConstructor
public class ExtraFieldTypeController {

    private final ExtraFieldTypeService service;

    @GetMapping
    public List<TypeResponse> list() { return service.findAll(); }

    /** 유형 id → 묶인 계정 id 들 (조건 [계정]) */
    @GetMapping("/account-ids")
    public Map<Long, List<Long>> accountIds() { return service.accountIdsByType(); }

    /** [추가항목등록] — 회사 공용 항목 8칸 */
    @GetMapping("/company-slots")
    public List<CompanySlot> companySlots() { return service.companySlots(); }

    @PostMapping
    public TypeResponse create(@Valid @RequestBody SaveTypeRequest req) { return service.create(req); }

    @PutMapping("/{id}")
    public TypeResponse update(@PathVariable Long id, @Valid @RequestBody SaveTypeRequest req) { return service.update(id, req); }

    @PostMapping("/active")
    public ResponseEntity<Void> setActive(@RequestParam boolean active, @RequestBody List<Long> ids) {
        service.setActive(ids, active);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@RequestBody List<Long> ids) {
        service.delete(ids);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/slots")
    public List<SlotRow> slots(@PathVariable Long id) { return service.slots(id); }

    @PutMapping("/{id}/slots")
    public List<SlotRow> saveSlots(@PathVariable Long id, @Valid @RequestBody List<SlotSave> req) { return service.saveSlots(id, req); }

    @GetMapping("/{id}/accounts")
    public List<AccountRow> accounts(@PathVariable Long id) { return service.accounts(id); }

    @PostMapping("/{id}/accounts")
    public List<AccountRow> addAccounts(@PathVariable Long id, @RequestBody AddAccountsRequest req) {
        return service.addAccounts(id, req.accountIds());
    }

    @PostMapping("/{id}/accounts/remove")
    public List<AccountRow> removeAccounts(@PathVariable Long id, @RequestBody List<Long> rowIds) {
        return service.removeAccounts(id, rowIds);
    }
}
