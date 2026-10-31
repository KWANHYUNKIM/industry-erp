package com.erp.accounting.cost.importcost.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** 수입비용(회계 II) 요청 · 응답. */
public final class ImportCostDtos {

    private ImportCostDtos() {}

    // ── 비용항목 ─────────────────────────────────────────────
    public record CostItemResponse(Long id, String code, String name, Integer sortOrder, boolean active) {}

    public record CreateCostItemRequest(@NotBlank @Size(max = 20) String code, @NotBlank @Size(max = 100) String name,
                                        @NotNull @PositiveOrZero Integer sortOrder) {}

    public record UpdateCostItemRequest(@NotBlank @Size(max = 100) String name, @NotNull @PositiveOrZero Integer sortOrder, Boolean active) {}

    // ── 관리번호 ─────────────────────────────────────────────
    public record LotResponse(Long id, String code, String name, Long partnerId, String partnerCode, String partnerName,
                              LocalDate firstTradeDate, String remark, boolean active) {}

    public record CreateLotRequest(@Size(max = 30) String code, @NotBlank @Size(max = 100) String name, @NotNull Long partnerId,
                                   LocalDate firstTradeDate, @Size(max = 300) String remark) {}

    public record UpdateLotRequest(@NotBlank @Size(max = 100) String name, @NotNull Long partnerId, LocalDate firstTradeDate,
                                   @Size(max = 300) String remark, Boolean active) {}

    // ── 전표 ─────────────────────────────────────────────────
    public record VoucherResponse(Long id, LocalDate voucherDate, String kind, String kindName,
                                  Long lotId, String lotCode, String lotName,
                                  Long partnerId, String partnerCode, String partnerName,
                                  Long costItemId, String costItemName,
                                  BigDecimal amount, BigDecimal vat, BigDecimal fee, BigDecimal total,
                                  Long accountId, String accountCode, String accountName,
                                  Long bankAccountId, String bankAccountCode, String bankAccountName,
                                  Long departmentId, Long projectId, String projectName,
                                  String vatType, String remark, Long journalEntryId, String journalDocNo) {}

    /**
     * 여섯 입력 화면이 같이 쓴다. kind 마다 쓰는 칸이 다르다 — 서류징수시는 accountId(출금계좌 = 대변 계정, 비면 251),
     * 자금지급시는 bankAccountId, 본계정대체는 accountId(구입자산).
     */
    public record SaveVoucherRequest(@NotNull LocalDate voucherDate, @NotBlank String kind, Long lotId,
                                     Long partnerId, Long costItemId,
                                     @PositiveOrZero BigDecimal amount, @PositiveOrZero BigDecimal vat, @PositiveOrZero BigDecimal fee,
                                     Long accountId, Long bankAccountId, Long departmentId, Long projectId,
                                     @Size(max = 30) String vatType, @Size(max = 300) String remark) {}

    public record DeleteVouchersRequest(@NotNull List<Long> ids) {}

    // ── 수입관리대장 ─────────────────────────────────────────
    public record LedgerRow(Long lotId, String lotCode, String lotName, String partnerName, boolean active,
                            BigDecimal carry, BigDecimal goods, Map<Long, BigDecimal> costs, BigDecimal total,
                            BigDecimal transfer, BigDecimal balance, LocalDate firstPaymentDate, LocalDate clearanceDate,
                            BigDecimal tradePaid, BigDecimal brokerPaid) {}

    public record LedgerResponse(List<CostItemResponse> items, List<LedgerRow> rows) {}
}
