package com.erp.accounting.vatreturn;

import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnRequest;
import com.erp.accounting.vatreturn.dto.VatReturnDtos.VatReturnResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
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
    public VatReturnResponse create(@Valid @RequestBody VatReturnRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public VatReturnResponse update(@PathVariable Long id, @Valid @RequestBody VatReturnRequest req) {
        return service.update(id, req);
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@RequestBody List<Long> ids) {
        service.delete(ids);
        return ResponseEntity.noContent().build();
    }
}
