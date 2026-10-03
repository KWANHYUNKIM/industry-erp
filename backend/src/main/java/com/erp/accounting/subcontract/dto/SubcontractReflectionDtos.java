package com.erp.accounting.subcontract.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class SubcontractReflectionDtos {

    private SubcontractReflectionDtos() {}

    /** 원본 외주비일괄회계반영 [구분] — 거래처별(외주처 하나에 매입전표 하나) · 전표별(생산입고 하나에 하나). */
    public enum GroupBy { PARTNER, SLIP }

    /** 외주비가 붙은 생산입고 한 줄 + 외주처 이름 + 넘긴 회계전표 번호. */
    public record SubcontractRow(
            Long productionId, String prodNo, Integer lineNo, LocalDate productionDate,
            Long productId, String productCode, String productName, BigDecimal producedQty,
            BigDecimal unitPrice, BigDecimal amount, BigDecimal vat, BigDecimal total,
            Long fromWarehouseId, String fromWarehouseName,
            Long partnerId, String partnerName,
            Long projectId, Long employeeId, String note,
            Long journalId, String journalNo
    ) {}

    public record ReflectRequest(
            @NotEmpty(message = "반영할 생산입고를 선택하세요.") List<Long> productionIds,
            @NotNull(message = "구분(거래처별·전표별)을 정하세요.") GroupBy groupBy
    ) {}

    public record UnreflectRequest(
            @NotEmpty(message = "반영취소할 생산입고를 선택하세요.") List<Long> productionIds
    ) {}

    /** 만든(지운) 회계전표 수와 그 번호. */
    public record ReflectResult(int count, List<String> journalNos) {}
}
