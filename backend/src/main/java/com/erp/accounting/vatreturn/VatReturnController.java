package com.erp.accounting.vatreturn;

import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnDocRequest;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnDocResponse;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnDocSummary;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnRequest;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnResponse;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnHistoryRow;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 세무 › 부가세 › 부가세신고서(일반) 목록(E200928) · 부가세신고서 PDF 다운로드(E030216). */
@RestController
@RequestMapping("/api/vat-returns")
@RequiredArgsConstructor
public class VatReturnController {

    private final VatReturnService service;

    @GetMapping
    public List<VatReturnResponse> list(@RequestParam int fromYear, @RequestParam int toYear) {
        return service.list(fromYear, toYear);
    }

    @PostMapping
    public VatReturnResponse create(@Valid @RequestBody VatReturnRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, nameOf(principal));
    }

    @PutMapping("/{id}")
    public VatReturnResponse update(@PathVariable Long id, @Valid @RequestBody VatReturnRequest req,
                                    @AuthenticationPrincipal UserPrincipal principal) {
        return service.update(id, req, nameOf(principal));
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@RequestBody List<Long> ids) {
        service.delete(ids);
        return ResponseEntity.noContent().build();
    }

    /** [신고서등] 창 — 저장된 신고서 · 첨부서류와 만든 때. */
    @GetMapping("/{id}/docs")
    public List<VatReturnDocSummary> docs(@PathVariable Long id) {
        return service.docs(id);
    }

    @GetMapping("/{id}/docs/{docCode}")
    public ResponseEntity<VatReturnDocResponse> doc(@PathVariable Long id, @PathVariable String docCode) {
        VatReturnDocResponse d = service.doc(id, docCode);
        return d == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(d);
    }

    @PutMapping("/{id}/docs/{docCode}")
    public VatReturnDocResponse writeDoc(@PathVariable Long id, @PathVariable String docCode,
                                         @Valid @RequestBody VatReturnDocRequest req,
                                         @AuthenticationPrincipal UserPrincipal principal) {
        return service.writeDoc(id, docCode, req.data(), nameOf(principal));
    }

    /** 목록 [이력] — 원본 '부가세신고서 이력보기'(작업자ID · 작업일시 · 신고서종류 · 행위). */
    @GetMapping("/{id}/history")
    public List<VatReturnHistoryRow> history(@PathVariable Long id) {
        return service.history(id);
    }

    private static String nameOf(UserPrincipal principal) {
        return principal == null ? null : principal.getUsername();
    }
}
