package com.erp.accounting.tax.paymentstatement;

import com.erp.accounting.tax.paymentstatement.dto.PaymentStatementDtos.FileRequest;
import com.erp.accounting.tax.paymentstatement.dto.PaymentStatementDtos.FileResponse;
import com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 지급명세서파일생성 (세무 > 원천징수 > 지급명세서, E030503). 전자파일 [생성] · [목록](국세청 파일 만들기 · 내려받기)은
 * 두지 않았다 — 화면의 링크는 잠겨 있다.
 */
@RestController
@RequestMapping("/api/payment-statement-files")
@RequiredArgsConstructor
public class PaymentStatementController {

    private final PaymentStatementService service;

    @GetMapping
    public List<FileResponse> list(@RequestParam int fromYear, @RequestParam int toYear,
                                   @RequestParam(required = false) PaymentStatementKind kind) {
        return service.list(fromYear, toYear, kind);
    }

    @PostMapping
    public FileResponse create(@Valid @RequestBody FileRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public FileResponse update(@PathVariable Long id, @Valid @RequestBody FileRequest req) {
        return service.update(id, req);
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@RequestBody List<Long> ids) {
        service.delete(ids);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/history")
    public List<ChangeHistoryResponse> history(@PathVariable Long id) {
        return service.history(id);
    }
}
