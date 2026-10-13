package com.erp.accounting.billingcontract.dto;

import com.erp.accounting.billingcontract.BillingContract;
import com.erp.accounting.billingcontract.BillingContractLine;
import com.erp.accounting.billingcontract.BillingUnit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import com.erp.accounting.contractitem.dto.ContractItemDtos.ProductLink;

public final class BillingContractDtos {
    private BillingContractDtos() {}

    public record SaveContractRequest(
            @NotNull(message = "계약일자를 입력하세요.") LocalDate contractDate,
            @NotNull(message = "거래처를 입력하세요.") Long partnerId,
            @Size(max = 20) String code,
            @Size(max = 100) String name,
            @NotNull(message = "청구시작일을 입력하세요.") LocalDate billStart,
            @NotNull(message = "청구종료일을 입력하세요.") LocalDate billEnd,
            @NotBlank(message = "부가세유형을 선택하세요.") String vatType,
            boolean foreignCurrency,
            Long employeeId,
            Long departmentId,
            Long projectId,
            @Size(max = 200) String remark,
            @NotEmpty(message = "계약항목을 입력하세요.") List<@Valid SaveLine> lines
    ) {}

    public record SaveLine(
            @NotNull(message = "항목코드를 입력하세요.") Long itemId,
            @Size(max = 40) String billMonths,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            @NotNull(message = "청구단위를 입력하세요.") Long billingUnitId,
            @Size(max = 200) String remark,
            /** 줄 [상세] 품목연결설정 — [적용(F8)]했을 때만 보낸다. 비우면 품목연결이 없는 줄(판매반영에 안 나옴). */
            List<@Valid ProductLink> products
    ) {}

    public record LineResponse(
            Long id, Integer lineNo, Long itemId, String itemCode, String itemName, String billMonths,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            Long billingUnitId, String billingUnitCode, String billingUnitName, String remark,
            List<ProductLink> products
    ) {
        public static LineResponse from(BillingContractLine l) {
            BillingUnit u = l.getBillingUnit();
            List<ProductLink> ps = l.getProducts().stream()
                    .map((p) -> ProductLink.of(
                            p.getItem(), p.getQuantity(), p.getUnitPrice(), p.getSupplyAmount(), p.getVatAmount())).toList();
            return new LineResponse(l.getId(), l.getLineNo(), l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(),
                    l.getBillMonths(), l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    u != null ? u.getId() : null, u != null ? u.getCode() : null, u != null ? u.getName() : null, l.getRemark(), ps);
        }
    }

    public record ContractResponse(
            Long id, LocalDate contractDate, Integer docNo, String code, String name,
            Long partnerId, String partnerCode, String partnerName,
            LocalDate billStart, LocalDate billEnd, String vatType, boolean foreignCurrency,
            Long employeeId, Long departmentId, Long projectId, String projectName, String remark,
            BigDecimal totalAmount, List<LineResponse> lines,
            String createdBy, LocalDateTime createdAt, String updatedBy, LocalDateTime updatedAt
    ) {
        public static ContractResponse from(BillingContract c, List<BillingContractLine> lines) {
            BigDecimal total = lines.stream().map((l) -> l.getSupplyAmount().add(l.getVatAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
            return new ContractResponse(c.getId(), c.getContractDate(), c.getDocNo(), c.getCode(), c.getName(),
                    c.getPartner().getId(), c.getPartner().getCode(), c.getPartner().getName(),
                    c.getBillStart(), c.getBillEnd(), c.getVatType(), c.isForeignCurrency(),
                    c.getEmployeeId(), c.getDepartmentId(),
                    c.getProject() != null ? c.getProject().getId() : null, c.getProject() != null ? c.getProject().getName() : null,
                    c.getRemark(), total, lines.stream().map(LineResponse::from).toList(),
                    c.getCreatedBy(), c.getCreatedAt(), c.getUpdatedBy(), c.getUpdatedAt());
        }
    }

    /** 청구자료생성의 [계약] 찾기(계약현황) 한 줄 — 계약 줄 × 청구할 달. */
    public record BillableLine(
            Long contractLineId, Long contractId, LocalDate contractDate, Integer docNo, String contractCode, String contractName,
            Long partnerId, String partnerName, String itemCode, String itemName, String billMonth, String billMonths,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            Long billingUnitId, String billingUnitCode, String billingUnitName, String remark
    ) {}

    public record BillingUnitResponse(Long id, String code, String name) {
        public static BillingUnitResponse from(BillingUnit u) {
            return new BillingUnitResponse(u.getId(), u.getCode(), u.getName());
        }
    }

    public record DeleteRequest(List<Long> ids) {}

    /** 계약단가/수량일괄변경 · 계약현황 한 줄 — 계약 줄 하나. */
    public record PriceChangeLine(
            Long lineId, Long contractId, LocalDate contractDate, Integer docNo, String contractCode, String contractName,
            Long partnerId, String partnerName, Long employeeId, LocalDate billStart, LocalDate billEnd, String vatType,
            boolean foreignCurrency, Long projectId, String projectName, Long departmentId, Long itemId, String itemName,
            Long billingUnitId, String billingUnitName, BigDecimal quantity, BigDecimal unitPrice,
            BigDecimal supplyAmount, BigDecimal vatAmount, String remark,
            /* 계약현황(E060912) 의 청구예정월 열 · 최초작성자 조건. */
            String billMonths, String createdBy
    ) {
        public static PriceChangeLine from(BillingContractLine l) {
            BillingContract c = l.getContract();
            return new PriceChangeLine(l.getId(), c.getId(), c.getContractDate(), c.getDocNo(), c.getCode(), c.getName(),
                    c.getPartner().getId(), c.getPartner().getName(), c.getEmployeeId(), c.getBillStart(), c.getBillEnd(), c.getVatType(),
                    c.isForeignCurrency(), c.getProject() != null ? c.getProject().getId() : null,
                    c.getProject() != null ? c.getProject().getName() : null, c.getDepartmentId(),
                    l.getItem().getId(), l.getItem().getName(),
                    l.getBillingUnit() != null ? l.getBillingUnit().getId() : null, l.getBillingUnit() != null ? l.getBillingUnit().getName() : null,
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(), l.getRemark(),
                    l.getBillMonths(), c.getCreatedBy());
        }
    }

    /** 계약단가/수량일괄변경 [저장(F8)] — 고친 줄의 수량 · 단가(공급가액 · 부가세는 다시 셈한다). */
    public record PriceChangeRequest(@NotEmpty List<@Valid PriceChangeItem> lines) {}

    public record PriceChangeItem(@NotNull Long lineId, @NotNull BigDecimal quantity, @NotNull BigDecimal unitPrice) {}
}
