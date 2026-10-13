package com.erp.accounting.contractbill.dto;

import com.erp.accounting.billingcontract.BillingContractLine;
import com.erp.accounting.contractbill.ContractBill;
import com.erp.accounting.contractbill.ContractBillLine;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ContractBillDtos {
    private ContractBillDtos() {}

    /** 청구자료생성 — [일괄생성] 은 한 장, [거래처별생성] 은 거래처마다 한 장(byPartner). */
    public record CreateBillRequest(
            @NotNull(message = "일자를 입력하세요.") LocalDate billDate,
            @NotBlank String vatType,
            boolean byPartner,
            @NotEmpty(message = "청구할 계약을 [계약] 으로 불러오세요.") List<@Valid BillLine> lines
    ) {}

    public record UpdateBillRequest(@NotEmpty(message = "청구할 줄이 없습니다.") List<@Valid BillLine> lines) {}

    public record BillLine(
            Long id,
            @NotNull Long contractLineId,
            @NotBlank @Size(max = 7) String billMonth,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            @Size(max = 200) String remark
    ) {}

    public record BillLineResponse(
            Long id, Long contractLineId, String itemCode, String itemName, String contractCode, String contractName,
            Long partnerId, String partnerName, String billMonth,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            String billingUnitCode, String billingUnitName, String remark
    ) {
        public static BillLineResponse from(ContractBillLine l) {
            BillingContractLine cl = l.getContractLine();
            return new BillLineResponse(l.getId(), cl.getId(), cl.getItem().getCode(), cl.getItem().getName(),
                    cl.getContract().getCode(), cl.getContract().getName(),
                    cl.getContract().getPartner().getId(), cl.getContract().getPartner().getName(), l.getBillMonth(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    cl.getBillingUnit() != null ? cl.getBillingUnit().getCode() : null,
                    cl.getBillingUnit() != null ? cl.getBillingUnit().getName() : null, l.getRemark());
        }
    }

    public record BillResponse(
            Long id, LocalDate billDate, Integer docNo, String vatType,
            boolean accountingReflected, boolean salesCreated, BigDecimal totalAmount, List<BillLineResponse> lines
    ) {
        public static BillResponse from(ContractBill b, List<ContractBillLine> lines) {
            BigDecimal total = lines.stream().map((l) -> l.getSupplyAmount().add(l.getVatAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
            return new BillResponse(b.getId(), b.getBillDate(), b.getDocNo(), b.getVatType(),
                    b.isAccountingReflected(), b.isSalesCreated(), total, lines.stream().map(BillLineResponse::from).toList());
        }
    }

    public record DeleteRequest(List<Long> ids) {}
}
