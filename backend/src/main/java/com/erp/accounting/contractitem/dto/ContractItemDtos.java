package com.erp.accounting.contractitem.dto;

import com.erp.accounting.contractitem.BillingCycle;
import com.erp.accounting.contractitem.ContractItem;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public final class ContractItemDtos {
    private ContractItemDtos() {}

    public record SaveContractItemRequest(
            @NotBlank(message = "계약항목코드를 입력하세요.") @Size(max = 5, message = "계약항목코드는 5자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "계약항목명을 입력하세요.") @Size(max = 100) String name,
            BigDecimal unitPrice,
            boolean vatIncluded,
            @NotNull BillingCycle billingCycle,
            Long salesAccountId
    ) {}

    /** 원본 [사용중단/재사용] — 고른 항목을 한 번에. */
    public record ActiveRequest(java.util.List<Long> ids, boolean active) {}

    public record ContractItemResponse(
            Long id, String code, String name, BigDecimal unitPrice, boolean vatIncluded,
            BillingCycle billingCycle, String billingCycleName,
            Long salesAccountId, String salesAccountCode, String salesAccountName, boolean active
    ) {
        public static ContractItemResponse from(ContractItem i) {
            return new ContractItemResponse(i.getId(), i.getCode(), i.getName(), i.getUnitPrice(), i.isVatIncluded(),
                    i.getBillingCycle(), i.getBillingCycle().getDisplayName(),
                    i.getSalesAccount() != null ? i.getSalesAccount().getId() : null,
                    i.getSalesAccount() != null ? i.getSalesAccount().getCode() : null,
                    i.getSalesAccount() != null ? i.getSalesAccount().getName() : null,
                    i.isActive());
        }
    }
}
