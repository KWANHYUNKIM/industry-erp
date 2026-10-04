package com.erp.accounting.vatinvoice.dto;

import com.erp.accounting.vatinvoice.VatDocKind;
import com.erp.accounting.vatinvoice.VatInvoiceProgress;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public final class VatInvoiceMarkDtos {

    private VatInvoiceMarkDtos() {
    }

    public record MarkResponse(Long journalEntryId, VatDocKind docKind, String docKindName,
                               VatInvoiceProgress progress, String progressName) {
    }

    /** [변경] — 고른 전표의 전자세금계산서 칸을 드롭다운 값으로. */
    public record DocKindRequest(@NotEmpty List<Long> ids, @NotNull VatDocKind docKind) {
    }

    /** [기한후발행] · [기한내발행으로변경] · [타발행]. */
    public record ProgressRequest(@NotEmpty List<Long> ids, @NotNull VatInvoiceProgress progress) {
    }
}
