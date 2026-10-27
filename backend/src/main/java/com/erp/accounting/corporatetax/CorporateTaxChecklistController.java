package com.erp.accounting.corporatetax;

import com.erp.accounting.corporatetax.dto.CorporateTaxChecklistDtos.ChecklistResponse;
import com.erp.accounting.corporatetax.dto.CorporateTaxChecklistDtos.MemoRequest;
import com.erp.accounting.corporatetax.dto.CorporateTaxChecklistDtos.MemoResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 법인세Checklist (세무 > 법인세 > 법인세Checklist, E030401) */
@RestController
@RequestMapping("/api/corporate-tax/checklist")
@RequiredArgsConstructor
public class CorporateTaxChecklistController {

    private final CorporateTaxChecklistService service;

    @GetMapping
    public ChecklistResponse checklist(@RequestParam int year) {
        return service.checklist(year);
    }

    @GetMapping("/memos")
    public List<MemoResponse> memos(@RequestParam int year, @RequestParam int section) {
        return service.memos(year, section);
    }

    @PostMapping("/memos")
    public MemoResponse createMemo(@Valid @RequestBody MemoRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.createMemo(req, principal.getUsername());
    }

    @PutMapping("/memos/{id}")
    public MemoResponse updateMemo(@PathVariable Long id, @Valid @RequestBody MemoRequest req) {
        return service.updateMemo(id, req);
    }

    @DeleteMapping("/memos/{id}")
    public ResponseEntity<Void> deleteMemo(@PathVariable Long id) {
        service.deleteMemo(id);
        return ResponseEntity.noContent().build();
    }
}
