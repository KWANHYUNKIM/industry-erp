package com.erp.accounting.vatinvoice;

import com.erp.accounting.vatinvoice.dto.VatInvoiceMarkDtos.DocKindRequest;
import com.erp.accounting.vatinvoice.dto.VatInvoiceMarkDtos.MarkResponse;
import com.erp.accounting.vatinvoice.dto.VatInvoiceMarkDtos.ProgressRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 각종구분값변경 (세무 › 부가세 › 신고전검토자료, E010723) */
@RestController
@RequestMapping("/api/vat-invoice-marks")
@RequiredArgsConstructor
public class VatInvoiceMarkController {

    private final VatInvoiceMarkService service;

    @GetMapping
    public List<MarkResponse> list() {
        return service.list();
    }

    @PostMapping("/doc-kind")
    public List<MarkResponse> changeDocKind(@Valid @RequestBody DocKindRequest req) {
        return service.changeDocKind(req.ids(), req.docKind());
    }

    @PostMapping("/progress")
    public List<MarkResponse> changeProgress(@Valid @RequestBody ProgressRequest req) {
        return service.changeProgress(req.ids(), req.progress());
    }
}
